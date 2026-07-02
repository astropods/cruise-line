package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

// captureStdout runs f while os.Stdout is redirected to an in-memory buffer,
// then restores the original. writeIndentedJSON writes to os.Stdout directly,
// so this is the cleanest way to observe its output.
func captureStdout(t *testing.T, f func()) string {
	t.Helper()
	orig := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = w
	done := make(chan string, 1)
	go func() {
		var buf bytes.Buffer
		io.Copy(&buf, r)
		done <- buf.String()
	}()
	f()
	w.Close()
	os.Stdout = orig
	return <-done
}

func TestWriteIndentedJSON(t *testing.T) {
	t.Run("empty raw prints [] rather than null", func(t *testing.T) {
		// Empty response body should emit an array (what `jq` and shell
		// scripts expect), not literal "null" which coerces to a value.
		out := captureStdout(t, func() {
			if err := writeIndentedJSON(nil); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
		if strings.TrimSpace(out) != "[]" {
			t.Errorf("expected [], got %q", out)
		}
	})

	t.Run("empty json.RawMessage prints [] rather than null", func(t *testing.T) {
		out := captureStdout(t, func() {
			if err := writeIndentedJSON(json.RawMessage{}); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
		if strings.TrimSpace(out) != "[]" {
			t.Errorf("expected [], got %q", out)
		}
	})

	t.Run("valid JSON is pretty-printed with two-space indent", func(t *testing.T) {
		out := captureStdout(t, func() {
			if err := writeIndentedJSON(json.RawMessage(`[{"a":1}]`)); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
		if !strings.Contains(out, "\"a\": 1") {
			t.Errorf("expected pretty-printed key/value, got %q", out)
		}
		if !strings.Contains(out, "  ") {
			t.Errorf("expected indentation, got %q", out)
		}
	})

	t.Run("invalid JSON falls back to raw bytes instead of erroring silently", func(t *testing.T) {
		// If the server ever returns something that isn't valid JSON, we'd
		// rather write it through than swallow it — otherwise a schema break
		// on the server would look like a silent CLI failure.
		out := captureStdout(t, func() {
			if err := writeIndentedJSON(json.RawMessage(`<html>not json</html>`)); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
		if !strings.Contains(out, "<html>") {
			t.Errorf("expected raw bytes in output, got %q", out)
		}
	})
}
