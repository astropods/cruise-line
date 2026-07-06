package main

import (
	"strings"
	"testing"
)

func TestBuildUserPromptRendersMetadataAndRules(t *testing.T) {
	pr := prMetadata{
		Owner:   "acme",
		Repo:    "app",
		Title:   "refactor auth handling",
		Author:  "chris",
		BaseRef: "main",
		HeadRef: "feat/auth",
		BaseSha: "aaa",
		HeadSha: "bbb",
	}
	rules := []reviewRule{
		{RuleNumber: 1, Rule: "Always use tagged-template SQL"},
		{RuleNumber: 2, Rule: "Never duplicate SQL queries"},
	}
	got := buildUserPrompt(pr, rules)

	// Sanity: header names the change without pretending there's a PR.
	if !strings.Contains(got, "## Change Details") {
		t.Error("missing '## Change Details' heading")
	}
	if strings.Contains(got, "PR #") {
		t.Error("prompt shouldn't render a 'PR #N' line — there's no PR yet")
	}
	if !strings.Contains(got, "acme/app") {
		t.Error("missing repo")
	}
	if !strings.Contains(got, "refactor auth handling") {
		t.Error("missing title")
	}
	if !strings.Contains(got, "aaa (main) → Head: bbb (feat/auth)") {
		t.Error("missing base/head refs")
	}

	// Rules survive.
	if !strings.Contains(got, "**Rule #1:** Always use tagged-template SQL") {
		t.Error("rule #1 missing")
	}
	if !strings.Contains(got, "**Rule #2:** Never duplicate SQL queries") {
		t.Error("rule #2 missing")
	}

	// The key contract that replaced the old diff-embedding behaviour:
	// the sub-agent is pointed at git tools instead of reading a bundled
	// diff. If a future edit accidentally removes this section, the loop
	// silently reviews with no changes visible — this test blocks that.
	if !strings.Contains(got, "git diff $(git merge-base main HEAD)") {
		t.Error("missing 'where to look' guidance (git diff via merge-base)")
	}
	if !strings.Contains(got, "git ls-files --others --exclude-standard") {
		t.Error("missing untracked-file guidance — untracked files would be invisible without this")
	}

	// The prompt must not contain a ```diff fence — that would suggest
	// there's an embedded diff to read, contradicting the whole design.
	if strings.Contains(got, "```diff") {
		t.Error("prompt embeds a ```diff fence — the local review no longer bundles the diff")
	}

	// Explicit JSON output contract. The server's analyzer enforces JSON
	// via the SDK's json_schema outputFormat; the Agent-tool path has no
	// equivalent, so if we don't tell the sub-agent to return JSON here,
	// the skill's JSON.parse step will fail on prose responses.
	if !strings.Contains(got, "## Output") {
		t.Error("missing '## Output' section — sub-agent has no instruction to emit JSON")
	}
	if !strings.Contains(got, "single JSON object") {
		t.Error("'## Output' section doesn't ask for a single JSON object")
	}
	for _, field := range []string{"summary", "verdict", "verdictRationale", "findings"} {
		if !strings.Contains(got, "`"+field+"`") {
			t.Errorf("output schema doesn't mention required field %q", field)
		}
	}
}

func TestBuildUserPromptOmitsRulesSectionWhenEmpty(t *testing.T) {
	pr := prMetadata{
		Owner: "acme", Repo: "app",
		Title: "small change", Author: "chris",
		BaseRef: "main", HeadRef: "feat/x",
		BaseSha: "aaa", HeadSha: "bbb",
	}
	got := buildUserPrompt(pr, nil)

	// An empty rules slice is legitimate — most repos won't have any.
	// A stray "## Repository Review Rules" heading with no content
	// underneath would confuse the sub-agent.
	if strings.Contains(got, "## Repository Review Rules") {
		t.Error("rules heading rendered even though no rules were provided")
	}
}
