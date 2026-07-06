package main

import (
	"os"
	"path/filepath"
	"testing"
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
