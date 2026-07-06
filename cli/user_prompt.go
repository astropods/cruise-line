package main

import (
	"fmt"
	"strings"
)

// prMetadata mirrors the shape server-side buildUserPrompt consumes.
// Number == 0 marks a pre-PR local review (no GitHub PR exists yet), which
// swaps the "## PR Details" heading for "## Change Details" and drops the
// "PR #N:" prefix from the title line.
type prMetadata struct {
	Owner   string
	Repo    string
	Number  int
	Title   string
	Author  string
	BaseRef string
	HeadRef string
	BaseSha string
	HeadSha string
	Body    string // PR description; empty is fine
}

type reviewRule struct {
	RuleNumber int
	Rule       string
}

// maxDiffChars is the same cap the server-side buildUserPrompt uses. A diff
// larger than this gets truncated with a note pointing the reviewer at the
// tools they have. Kept in sync with agent/analysis/prompt.ts by the golden
// test — a divergence in this constant surfaces there.
const maxDiffChars = 100_000

// buildUserPrompt renders the review's user prompt for a given change.
// This is a Go port of the TypeScript buildUserPrompt in
// agent/analysis/prompt.ts. Both implementations are pinned to the same
// golden file (agent/analysis/testdata/user-prompt-pre-pr-golden.txt) so
// drift shows up in tests.
//
// The template lives in two languages because the server-side analyzer
// still calls the TS version, and the CLI's local-review loop calls this
// Go version. The alternative — serving the template as a string from the
// server for the CLI to fetch and render — was ruled out because the
// template contains conditional structure (pre-PR vs. PR, rules present or
// not, description present or not) that neither language can render
// without an interpreter for the other's template DSL.
func buildUserPrompt(pr prMetadata, diffContent string, rules []reviewRule) string {
	truncatedDiff := diffContent
	if len(truncatedDiff) > maxDiffChars {
		truncatedDiff = truncatedDiff[:maxDiffChars] +
			"\n\n... [diff truncated — use tools to read full files]"
	}

	isPrePR := pr.Number == 0

	var heading string
	if isPrePR {
		heading = fmt.Sprintf("## Change Details\n- Repository: %s/%s\n- %s",
			pr.Owner, pr.Repo, pr.Title)
	} else {
		heading = fmt.Sprintf("## PR Details\n- Repository: %s/%s\n- PR #%d: %s",
			pr.Owner, pr.Repo, pr.Number, pr.Title)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Review this pull request.\n\n%s\n- Author: %s\n- Base: %s (%s) → Head: %s (%s)",
		heading, pr.Author, pr.BaseSha, pr.BaseRef, pr.HeadSha, pr.HeadRef)

	if trimmed := strings.TrimSpace(pr.Body); trimmed != "" {
		fmt.Fprintf(&b, "\n\n## PR Description\n%s", trimmed)
	}

	if len(rules) > 0 {
		b.WriteString("\n\n## Repository Review Rules\n\n")
		b.WriteString("The team has configured these review rules for this repository. These are **supplementary guidance** — you should still perform your full analysis independently. Rules highlight areas the team cares about, but don't limit your review to only these topics.\n\n")
		b.WriteString("When a finding is related to a rule, mention it naturally (e.g. \"This violates Rule #3\" or \"Per Rule #1, this endpoint should...\"). Not every finding needs to reference a rule, and not every rule will be relevant to every PR.\n\n")
		for i, r := range rules {
			if i > 0 {
				b.WriteString("\n")
			}
			fmt.Fprintf(&b, "**Rule #%d:** %s", r.RuleNumber, r.Rule)
		}
	}

	fmt.Fprintf(&b, "\n\n## Diff\n```diff\n%s\n```\n\nRead the files to understand context, check callers and tests, and determine accurate line numbers for your directives.",
		truncatedDiff)

	return b.String()
}
