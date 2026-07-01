package main

import (
	"regexp"
	"strings"
	"testing"
)

func TestSha256Base64URL(t *testing.T) {
	t.Run("matches RFC 7636 test vector", func(t *testing.T) {
		// RFC 7636 Appendix B — given this specific verifier, the S256
		// challenge MUST be this exact string. If our impl disagrees with
		// this, no OAuth server implementing PKCE will interoperate.
		verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
		want := "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
		if got := sha256Base64URL(verifier); got != want {
			t.Fatalf("challenge = %q, want %q", got, want)
		}
	})

	t.Run("is deterministic", func(t *testing.T) {
		a := sha256Base64URL("same input")
		b := sha256Base64URL("same input")
		if a != b {
			t.Fatalf("nondeterministic: %q vs %q", a, b)
		}
	})

	t.Run("uses url-safe alphabet with no padding", func(t *testing.T) {
		out := sha256Base64URL("some random input")
		if strings.ContainsAny(out, "+/=") {
			t.Fatalf("output contains non-url-safe chars: %q", out)
		}
		// SHA-256 (32 bytes) encoded as base64url without padding is 43 chars.
		if len(out) != 43 {
			t.Fatalf("output length = %d, want 43", len(out))
		}
	})

	t.Run("differs for different inputs", func(t *testing.T) {
		if sha256Base64URL("a") == sha256Base64URL("b") {
			t.Fatal("collision on trivial inputs")
		}
	})
}

func TestRandBase64URL(t *testing.T) {
	t.Run("produces url-safe unpadded base64 of the requested length", func(t *testing.T) {
		out, err := randBase64URL(32)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if strings.ContainsAny(out, "+/=") {
			t.Fatalf("output contains non-url-safe chars: %q", out)
		}
		// 32 raw bytes → 43 base64url chars unpadded.
		if len(out) != 43 {
			t.Fatalf("length = %d, want 43", len(out))
		}
		urlSafe := regexp.MustCompile(`^[A-Za-z0-9_\-]+$`)
		if !urlSafe.MatchString(out) {
			t.Fatalf("output includes unexpected characters: %q", out)
		}
	})

	t.Run("produces different values across calls (entropy sanity)", func(t *testing.T) {
		a, err := randBase64URL(32)
		if err != nil {
			t.Fatal(err)
		}
		b, err := randBase64URL(32)
		if err != nil {
			t.Fatal(err)
		}
		if a == b {
			// Cryptographically negligible probability — a match here means
			// crypto/rand is broken or someone replaced the source.
			t.Fatal("two randBase64URL(32) calls returned the same string")
		}
	})
}

func TestBuildAuthorizeURL(t *testing.T) {
	// Sanity: the URL we send the browser to has the correct params in it.
	// A regression here would break the very first step of every login.
	got := buildAuthorizeURL(
		"https://cl.example.com",
		"http://127.0.0.1:12345/callback",
		"the-state",
		"the-challenge",
	)
	wantContains := []string{
		"https://cl.example.com/cli/authorize?",
		"response_type=code",
		"client_id=cli",
		"code_challenge=the-challenge",
		"code_challenge_method=S256",
		"state=the-state",
		"redirect_uri=http%3A%2F%2F127.0.0.1%3A12345%2Fcallback",
	}
	for _, want := range wantContains {
		if !strings.Contains(got, want) {
			t.Errorf("authorize URL missing %q\ngot: %s", want, got)
		}
	}
}
