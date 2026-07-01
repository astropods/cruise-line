package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// Loopback OAuth flow constants. The 3-minute overall budget bounds how long
// the CLI waits with a listener bound; the server's auth code TTL is 2 minutes,
// so a slower user has to log in again rather than exchange a stale code.
const (
	oauthTimeout = 3 * time.Minute
	pkceBytes    = 32
	stateBytes   = 16
	clientID     = "cli"
)

type LoginResult struct {
	Host    string
	Token   string
	TokenID string
	User    *UserBlock
}

// RunLogin drives the full flow: mint PKCE material, spin up a loopback
// server, open the browser, wait for the callback, exchange the code.
func RunLogin(host string) (*LoginResult, error) {
	host = strings.TrimRight(host, "/")
	if !strings.HasPrefix(host, "http://") && !strings.HasPrefix(host, "https://") {
		return nil, fmt.Errorf("host must start with http:// or https:// (got %q)", host)
	}

	verifier, err := randBase64URL(pkceBytes)
	if err != nil {
		return nil, fmt.Errorf("generating code_verifier: %w", err)
	}
	challenge := sha256Base64URL(verifier)

	state, err := randHex(stateBytes)
	if err != nil {
		return nil, fmt.Errorf("generating state: %w", err)
	}

	// Bind to :0 and read back the actual port. Fixed ports would clash with
	// other tools; the server accepts any loopback port.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("opening loopback listener: %w", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	redirectURI := fmt.Sprintf("http://127.0.0.1:%d/callback", port)

	// The callback handler races two channels: `codeCh` when the server
	// redirects back with a valid code, `errCh` for anything else. Timeout
	// covers the whole ceremony.
	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if errParam := q.Get("error"); errParam != "" {
			desc := q.Get("error_description")
			writeCallbackPage(w, false, fmt.Sprintf("Authorization %s.", errParam))
			errCh <- fmt.Errorf("authorization %s: %s", errParam, desc)
			return
		}
		if got := q.Get("state"); got != state {
			writeCallbackPage(w, false, "State mismatch. Please try again.")
			errCh <- fmt.Errorf("state mismatch: expected %q, got %q", state, got)
			return
		}
		code := q.Get("code")
		if code == "" {
			writeCallbackPage(w, false, "Server returned no authorization code.")
			errCh <- fmt.Errorf("no code in callback")
			return
		}
		writeCallbackPage(w, true, "")
		codeCh <- code
	})

	srv := &http.Server{Handler: mux}
	go func() {
		// Ignore ErrServerClosed — that's the shutdown path.
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			errCh <- fmt.Errorf("loopback server: %w", err)
		}
	}()

	// Kick off the browser hop.
	authURL := buildAuthorizeURL(host, redirectURI, state, challenge)
	fmt.Println("Opening browser to:")
	fmt.Println(" ", authURL)
	if err := openBrowser(authURL); err != nil {
		fmt.Println("(couldn't open the browser automatically — visit the URL above manually)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), oauthTimeout)
	defer cancel()

	var code string
	select {
	case code = <-codeCh:
	case err := <-errCh:
		shutdownServer(srv)
		return nil, err
	case <-ctx.Done():
		shutdownServer(srv)
		return nil, fmt.Errorf("timed out waiting for browser callback after %s", oauthTimeout)
	}
	shutdownServer(srv)

	return exchangeCode(host, code, verifier, redirectURI)
}

func shutdownServer(srv *http.Server) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func buildAuthorizeURL(host, redirectURI, state, challenge string) string {
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", clientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("state", state)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	return host + "/cli/authorize?" + q.Encode()
}

type tokenResponse struct {
	AccessToken string     `json:"access_token"`
	TokenType   string     `json:"token_type"`
	TokenID     string     `json:"token_id"`
	User        *UserBlock `json:"user"`
}

type tokenErrorResponse struct {
	Error string `json:"error"`
}

func exchangeCode(host, code, verifier, redirectURI string) (*LoginResult, error) {
	body, _ := json.Marshal(map[string]string{
		"grant_type":    "authorization_code",
		"code":          code,
		"code_verifier": verifier,
		"redirect_uri":  redirectURI,
	})
	req, err := http.NewRequest("POST", host+"/api/cli/token", strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("building token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var errBody tokenErrorResponse
		_ = json.NewDecoder(res.Body).Decode(&errBody)
		msg := errBody.Error
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", res.StatusCode)
		}
		return nil, fmt.Errorf("token exchange failed: %s", msg)
	}

	var tok tokenResponse
	if err := json.NewDecoder(res.Body).Decode(&tok); err != nil {
		return nil, fmt.Errorf("decoding token response: %w", err)
	}

	return &LoginResult{
		Host:    host,
		Token:   tok.AccessToken,
		TokenID: tok.TokenID,
		User:    tok.User,
	}, nil
}

// randBase64URL returns n random bytes encoded as unpadded base64url — the
// alphabet PKCE requires for both verifier and challenge.
func randBase64URL(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func randHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func sha256Base64URL(input string) string {
	sum := sha256.Sum256([]byte(input))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// openBrowser tries to launch the default browser. Failure is non-fatal — the
// caller falls back to instructing the user to visit the URL manually.
func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

func writeCallbackPage(w http.ResponseWriter, success bool, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	title := "Signed in"
	body := "You can close this window and return to your terminal."
	if !success {
		title = "Sign-in failed"
		body = message
	}
	fmt.Fprintf(w, `<!doctype html>
<html><head><meta charset="utf-8"><title>%s — Cruise Line</title>
<style>
  html, body { height: 100%%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center; font-family: -apple-system, system-ui, sans-serif; background: #0b0d10; color: #e6e6e6; }
  .card { padding: 2rem 2.5rem; border-radius: 12px; background: #14171c; max-width: 28rem; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
  p { margin: 0; color: #9aa4b2; }
</style>
</head><body>
<div class="card"><h1>%s</h1><p>%s</p></div>
</body></html>`, html.EscapeString(title), html.EscapeString(title), html.EscapeString(body))
}
