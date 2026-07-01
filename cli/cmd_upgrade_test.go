package main

import (
	"bytes"
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

	t.Run("silent on dev builds", func(t *testing.T) {
		// A dev build has no upstream to be older than — never nag.
		version = "dev"
		out := captureStderr(func() {
			notifyIfOutdated(&latestResponse{Version: "1.0.0"})
		})
		if out != "" {
			t.Errorf("expected silence on dev build, got %q", out)
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
