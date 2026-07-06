package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNotifyIfOutdated(t *testing.T) {
	// notifyIfOutdated writes to os.Stderr directly. Swap it out via a pipe
	// so we can assert on what got printed.
	captureStderr := func(f func()) string {
		orig := os.Stderr
		r, w, err := os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
		os.Stderr = w
		done := make(chan string, 1)
		go func() {
			var buf bytes.Buffer
			io.Copy(&buf, r)
			done <- buf.String()
		}()
		f()
		w.Close()
		os.Stderr = orig
		return <-done
	}

	// Preserve + restore package-level `version` since it's linker-injected.
	origVersion := version
	defer func() { version = origVersion }()

	t.Run("prints notice when upstream is newer", func(t *testing.T) {
		version = "0.1.0"
		out := captureStderr(func() {
			notifyIfOutdated(&latestResponse{Version: "0.2.0"})
		})
		if !strings.Contains(out, "0.2.0") || !strings.Contains(out, "upgrade") {
			t.Errorf("expected upgrade notice, got %q", out)
		}
	})

	t.Run("silent when versions match", func(t *testing.T) {
		version = "0.1.0"
		out := captureStderr(func() {
			notifyIfOutdated(&latestResponse{Version: "0.1.0"})
		})
		if out != "" {
			t.Errorf("expected silence when versions match, got %q", out)
		}
	})

	t.Run("silent when both sides are dev", func(t *testing.T) {
		// A locally-built dev binary talking to a server that also reports
		// "dev" (either a dev deploy, or a Dockerfile that didn't stamp
		// BUILD_VERSION) has nothing to nag about — versions match.
		version = "dev"
		out := captureStderr(func() {
			notifyIfOutdated(&latestResponse{Version: "dev"})
		})
		if out != "" {
			t.Errorf("expected silence when both sides are dev, got %q", out)
		}
	})

	t.Run("nags dev-versioned local when server has a real version", func(t *testing.T) {
		// This is the "existing installs that got the old dev-stamped
		// binary should upgrade once" path. Without this exit, users who
		// pulled from a deploy that predates the version-stamping fix
		// would never learn a real release exists.
		version = "dev"
		out := captureStderr(func() {
			notifyIfOutdated(&latestResponse{Version: "20260706T210000Z"})
		})
		if !strings.Contains(out, "20260706T210000Z") || !strings.Contains(out, "upgrade") {
			t.Errorf("expected upgrade notice, got %q", out)
		}
	})

	t.Run("silent on nil response (offline / server down)", func(t *testing.T) {
		version = "0.1.0"
		out := captureStderr(func() {
			notifyIfOutdated(nil)
		})
		if out != "" {
			t.Errorf("expected silence on nil response, got %q", out)
		}
	})

	t.Run("silent when CRUISE_LINE_NO_UPDATE_CHECK is set", func(t *testing.T) {
		// The env-var escape hatch for developers who run `go build .`
		// against a prod server. Without this, the dev→real nudge would
		// nag them on every command, and following the advice would
		// blow away their local binary.
		t.Setenv("CRUISE_LINE_NO_UPDATE_CHECK", "1")
		version = "dev"
		out := captureStderr(func() {
			notifyIfOutdated(&latestResponse{Version: "20260706T210000Z"})
		})
		if out != "" {
			t.Errorf("expected silence when CRUISE_LINE_NO_UPDATE_CHECK is set, got %q", out)
		}
	})
}

func TestFetchLatest(t *testing.T) {
	t.Run("decodes a valid response", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/cli/latest" {
				t.Errorf("wrong path: %s", r.URL.Path)
			}
			json.NewEncoder(w).Encode(latestResponse{
				Version: "1.2.3",
				DownloadURLs: map[string]string{
					"darwin-arm64": "http://example/download/cruise-line-darwin-arm64",
				},
			})
		}))
		defer srv.Close()

		got, err := fetchLatest(srv.URL, time.Second)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Version != "1.2.3" {
			t.Errorf("version = %q, want 1.2.3", got.Version)
		}
	})

	t.Run("rejects a response with no version", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(latestResponse{Version: ""})
		}))
		defer srv.Close()

		if _, err := fetchLatest(srv.URL, time.Second); err == nil {
			t.Fatal("expected error on empty version")
		}
	})

	t.Run("returns error on non-2xx", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "boom", http.StatusInternalServerError)
		}))
		defer srv.Close()

		if _, err := fetchLatest(srv.URL, time.Second); err == nil {
			t.Fatal("expected error on 500")
		}
	})
}

func TestMaybeCheckForUpdate(t *testing.T) {
	// Point CRUISE_LINE_HOME at a fresh temp dir so the config file writes
	// don't touch the real user's config.
	dir := t.TempDir()
	t.Setenv("CRUISE_LINE_HOME", dir)

	var callCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		json.NewEncoder(w).Encode(latestResponse{
			Version:      "9.9.9",
			DownloadURLs: map[string]string{},
		})
	}))
	defer srv.Close()

	t.Run("skips when Host is empty", func(t *testing.T) {
		cfg := &Config{}
		got := maybeCheckForUpdate(cfg)
		if got != nil {
			t.Errorf("expected nil when Host is empty, got %+v", got)
		}
	})

	t.Run("fetches when there's no cached state", func(t *testing.T) {
		callCount = 0
		cfg := &Config{Host: srv.URL}
		got := maybeCheckForUpdate(cfg)
		if got == nil || got.Version != "9.9.9" {
			t.Errorf("expected 9.9.9, got %+v", got)
		}
		if callCount != 1 {
			t.Errorf("expected 1 HTTP call, got %d", callCount)
		}
		if cfg.UpdateCheck == nil || cfg.UpdateCheck.LatestVersion != "9.9.9" {
			t.Errorf("cache not written: %+v", cfg.UpdateCheck)
		}
	})

	t.Run("uses cache when last check is fresh", func(t *testing.T) {
		callCount = 0
		cfg := &Config{
			Host: srv.URL,
			UpdateCheck: &UpdateCheckState{
				LastCheckedAt: time.Now().UTC().Format(time.RFC3339),
				LatestVersion: "5.5.5",
			},
		}
		got := maybeCheckForUpdate(cfg)
		if got == nil || got.Version != "5.5.5" {
			t.Errorf("expected cached 5.5.5, got %+v", got)
		}
		if callCount != 0 {
			t.Errorf("expected no HTTP call, got %d", callCount)
		}
	})

	t.Run("refetches when the cache is older than the interval", func(t *testing.T) {
		callCount = 0
		old := time.Now().Add(-25 * time.Hour).UTC().Format(time.RFC3339)
		cfg := &Config{
			Host: srv.URL,
			UpdateCheck: &UpdateCheckState{
				LastCheckedAt: old,
				LatestVersion: "5.5.5",
			},
		}
		got := maybeCheckForUpdate(cfg)
		if got == nil || got.Version != "9.9.9" {
			t.Errorf("expected refetched 9.9.9, got %+v", got)
		}
		if callCount != 1 {
			t.Errorf("expected 1 HTTP call, got %d", callCount)
		}
	})
}

// verifyServer returns an httptest.Server that responds to two URLs:
//   GET <basePath>          -> serves `body`
//   GET <basePath>.sha256   -> serves `sha` (or a hex-encoded sha256 of body if empty)
// Each response can be overridden with a status code — a 500 for either path
// lets tests exercise error branches without wrestling with a fake client.
func verifyServer(t *testing.T, basePath string, body []byte, sha string, binStatus, shaStatus int) *httptest.Server {
	t.Helper()
	if sha == "" {
		h := sha256.Sum256(body)
		sha = hex.EncodeToString(h[:])
	}
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case basePath:
			if binStatus != 0 && binStatus != 200 {
				http.Error(w, "boom", binStatus)
				return
			}
			w.Write(body)
		case basePath + ".sha256":
			if shaStatus != 0 && shaStatus != 200 {
				http.Error(w, "boom", shaStatus)
				return
			}
			w.Write([]byte(sha + "\n"))
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestDownloadBinaryWithVerify(t *testing.T) {
	body := []byte("this-is-a-fake-cruise-line-binary\n")

	t.Run("returns tempfile path when checksum matches", func(t *testing.T) {
		srv := verifyServer(t, "/cruise-line-darwin-arm64", body, "", 200, 200)
		defer srv.Close()

		got, err := downloadBinaryWithVerify(srv.URL + "/cruise-line-darwin-arm64")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		defer os.Remove(got)

		written, err := os.ReadFile(got)
		if err != nil {
			t.Fatalf("reading temp: %v", err)
		}
		if !bytes.Equal(written, body) {
			t.Errorf("tempfile contents differ from body")
		}
	})

	t.Run("rejects a binary whose sha does not match the sidecar", func(t *testing.T) {
		// The sidecar advertises a sha for DIFFERENT content, so the streamed
		// hash will disagree. This is the MITM detection path — the whole
		// upgrade security story depends on it.
		wrongSha := hex.EncodeToString(sha256.New().Sum(nil)) // sha256 of empty
		if len(wrongSha) != 64 {
			t.Fatalf("test setup: expected 64-char sha, got %d", len(wrongSha))
		}
		srv := verifyServer(t, "/cruise-line-darwin-arm64", body, wrongSha, 200, 200)
		defer srv.Close()

		got, err := downloadBinaryWithVerify(srv.URL + "/cruise-line-darwin-arm64")
		if err == nil {
			os.Remove(got)
			t.Fatal("expected mismatch error")
		}
		if !strings.Contains(err.Error(), "checksum mismatch") {
			t.Errorf("expected 'checksum mismatch' in error, got %v", err)
		}
		if got != "" {
			t.Errorf("expected empty path on failure, got %q", got)
			os.Remove(got)
		}
	})

	t.Run("rejects a sidecar that is not a 64-char hex string", func(t *testing.T) {
		srv := verifyServer(t, "/cruise-line-darwin-arm64", body, "not-a-real-sha", 200, 200)
		defer srv.Close()

		_, err := downloadBinaryWithVerify(srv.URL + "/cruise-line-darwin-arm64")
		if err == nil {
			t.Fatal("expected error on short sidecar")
		}
		if !strings.Contains(err.Error(), "checksum sidecar") {
			t.Errorf("expected sidecar-format error, got %v", err)
		}
	})

	t.Run("rejects a non-2xx sha endpoint before hitting the binary URL", func(t *testing.T) {
		srv := verifyServer(t, "/cruise-line-darwin-arm64", body, "", 200, 500)
		defer srv.Close()

		_, err := downloadBinaryWithVerify(srv.URL + "/cruise-line-darwin-arm64")
		if err == nil {
			t.Fatal("expected error on 500 sha")
		}
		if !strings.Contains(err.Error(), "checksum HTTP") {
			t.Errorf("expected checksum HTTP error, got %v", err)
		}
	})

	t.Run("rejects a non-2xx binary endpoint", func(t *testing.T) {
		srv := verifyServer(t, "/cruise-line-darwin-arm64", body, "", 404, 200)
		defer srv.Close()

		_, err := downloadBinaryWithVerify(srv.URL + "/cruise-line-darwin-arm64")
		if err == nil {
			t.Fatal("expected error on 404 binary")
		}
		if !strings.Contains(err.Error(), "binary HTTP") {
			t.Errorf("expected binary HTTP error, got %v", err)
		}
	})

	t.Run("does not leave temp files behind on checksum mismatch", func(t *testing.T) {
		// The current impl removes the tempfile on hash mismatch. Regression
		// check via manual dir listing: count matching temp files before + after.
		wrongSha := strings.Repeat("0", 64)
		srv := verifyServer(t, "/cruise-line-darwin-arm64", body, wrongSha, 200, 200)
		defer srv.Close()

		before := countCruiseLineTempFiles(t)
		_, err := downloadBinaryWithVerify(srv.URL + "/cruise-line-darwin-arm64")
		if err == nil {
			t.Fatal("expected error")
		}
		after := countCruiseLineTempFiles(t)
		if after > before {
			t.Errorf("leaked %d tempfiles on failure path", after-before)
		}
	})
}

func countCruiseLineTempFiles(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatalf("reading tmpdir: %v", err)
	}
	n := 0
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "cruise-line-") {
			n++
		}
	}
	return n
}

func TestConfigRoundTripWithUpdateCheck(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CRUISE_LINE_HOME", dir)

	original := &Config{
		Host:  "https://cl.example.com",
		Token: "cl_live_x",
		UpdateCheck: &UpdateCheckState{
			LastCheckedAt: "2026-06-30T12:00:00Z",
			LatestVersion: "0.5.0",
		},
	}
	if err := SaveConfig(original); err != nil {
		t.Fatalf("save: %v", err)
	}
	// Cross-check that the config file actually exists at the expected path
	// (regression check for XDG_CONFIG_HOME handling).
	if _, err := os.Stat(filepath.Join(dir, "config.json")); err != nil {
		t.Fatalf("expected config.json in %s: %v", dir, err)
	}

	loaded, err := LoadConfig()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.UpdateCheck == nil {
		t.Fatal("UpdateCheck round-trip lost the field")
	}
	if loaded.UpdateCheck.LatestVersion != "0.5.0" {
		t.Errorf("LatestVersion = %q, want 0.5.0", loaded.UpdateCheck.LatestVersion)
	}
}
