package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

// TestBuildUserPromptMatchesGolden pins the Go implementation of
// buildUserPrompt against a golden file that lives with the server-side
// tests. A matching TS test in agent/analysis/prompt.test.ts reads the
// same file, so if either language's implementation drifts from the
// other, one of these two tests fails.
//
// The fixture inputs are duplicated by hand across the two tests — keep
// them identical if you change either.
func TestBuildUserPromptMatchesGolden(t *testing.T) {
	pr := prMetadata{
		Owner:   "acme",
		Repo:    "app",
		Number:  0, // pre-PR local review
		Title:   "refactor auth handling",
		Author:  "chris",
		BaseRef: "main",
		HeadRef: "feat/auth",
		BaseSha: "aaa",
		HeadSha: "bbb",
	}
	diff := "diff --git a/foo b/foo\n@@ -1 +1 @@\n-old\n+new"
	rules := []reviewRule{
		{RuleNumber: 1, Rule: "Always use tagged-template SQL"},
		{RuleNumber: 2, Rule: "Never duplicate SQL queries"},
	}

	got := buildUserPrompt(pr, diff, rules)

	goldenPath := filepath.Join("..", "agent", "analysis", "testdata", "user-prompt-pre-pr-golden.txt")
	expectedBytes, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("reading golden file %s: %v", goldenPath, err)
	}
	expected := string(expectedBytes)

	if got != expected {
		// Longer failure output than usual — the whole point of the
		// cross-language test is to make it obvious which side moved.
		t.Errorf(`buildUserPrompt output does not match golden file.

If you changed the template on the server side (agent/analysis/prompt.ts),
update the Go implementation here to match AND update the golden file.
If you changed the Go implementation, do the reverse.

--- expected (from %s) ---
%s
--- got ---
%s
`, goldenPath, expected, got)
	}
}

// TestBuildUserPromptTruncationIsRuneSafe checks that a diff over the
// maxDiffChars limit is truncated by Unicode code point (not by byte).
// A previous implementation used byte slicing, which could cut in the
// middle of a multi-byte rune and produce invalid UTF-8 — and would
// silently disagree with the TS side on the truncation position for any
// multi-byte content. A matching TS test in agent/analysis/prompt.test.ts
// exercises the same invariants.
func TestBuildUserPromptTruncationIsRuneSafe(t *testing.T) {
	pr := prMetadata{
		Owner: "acme", Repo: "app",
		Title: "big", Author: "chris",
		BaseRef: "main", HeadRef: "feat/x",
		BaseSha: "aaa", HeadSha: "bbb",
	}

	// A diff exactly one code-point past the truncation limit, made of a
	// multi-byte emoji so a byte-based implementation would either cut
	// in the middle of the last emoji (broken UTF-8) or truncate at a
	// smaller code-point count than the TS side.
	oversized := strings.Repeat("🚢", maxDiffChars+1)

	got := buildUserPrompt(pr, oversized, nil)

	t.Run("output is valid UTF-8", func(t *testing.T) {
		if !utf8.ValidString(got) {
			t.Error("buildUserPrompt emitted invalid UTF-8 — the truncation must be sliced by rune, not byte")
		}
	})

	t.Run("truncation notice is present", func(t *testing.T) {
		if !strings.Contains(got, "[diff truncated") {
			t.Error("oversized diff was not truncated")
		}
	})

	t.Run("truncated diff contains exactly maxDiffChars code points of the payload", func(t *testing.T) {
		// Extract just the fenced diff block so we can count code points
		// deterministically. Test surface (```diff ... ```), not the
		// prose around it.
		startIdx := strings.Index(got, "```diff\n")
		if startIdx < 0 {
			t.Fatal("could not find opening diff fence in output")
		}
		payloadStart := startIdx + len("```diff\n")
		endIdx := strings.Index(got[payloadStart:], "\n\n... [diff truncated")
		if endIdx < 0 {
			t.Fatal("could not find truncation boundary in output")
		}
		payload := got[payloadStart : payloadStart+endIdx]

		count := 0
		for range payload {
			count++
		}
		if count != maxDiffChars {
			t.Errorf("truncated payload was %d code points, want %d", count, maxDiffChars)
		}
	})
}
