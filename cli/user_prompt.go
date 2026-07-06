package main

import (
	"fmt"
	"strings"
)

// prMetadata is the pre-PR context passed into the user prompt. There's
// no GitHub PR number — the developer hasn't opened one yet — so the
// template omits the "PR #N" framing entirely.
type prMetadata struct {
	Owner   string
	Repo    string
	Title   string
	Author  string
	BaseRef string
	HeadRef string
	BaseSha string
	HeadSha string
}

type reviewRule struct {
	RuleNumber int
	Rule       string
}

// buildUserPrompt assembles the user-slot prompt for a local pre-PR review.
//
// Deliberately does NOT include the diff. The sub-agent runs inside the
// developer's working tree with Bash + Read + Grep + Glob, so it can look
// at the change directly (`git diff`, `git ls-files`, individual files)
// rather than reading a bundled diff that would go stale as fixes accrue.
// This sidesteps all the merge-base semantics / intent-to-add for
// untracked files / UTF-8-safe truncation edge cases that plagued the
// previous diff-embedding version.
//
// The server-side buildUserPrompt in agent/analysis/prompt.ts is separate
// and unchanged — its caller (the analyzer running inside a headless
// sandbox) genuinely needs the diff embedded, because the sandbox has no
// developer working tree to read from.
func buildUserPrompt(pr prMetadata, rules []reviewRule) string {
	var b strings.Builder

	fmt.Fprintf(&b, `Review the local changes in the developer's working tree.

## Change Details
- Repository: %s/%s
- %s
- Author: %s
- Base: %s (%s) → Head: %s (%s)`,
		pr.Owner, pr.Repo, pr.Title, pr.Author,
		pr.BaseSha, pr.BaseRef, pr.HeadSha, pr.HeadRef)

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

	fmt.Fprintf(&b, "\n\n## Where to look\n\n"+
		"You are running in the developer's working tree. The changes are on the local filesystem — no diff is bundled with this prompt. Use your tools to investigate:\n\n"+
		"- `git diff $(git merge-base %[1]s HEAD)` — full pre-PR delta including committed, staged, and unstaged edits. Merge-base semantics so unrelated advances on %[1]s don't pollute the diff.\n"+
		"- `git ls-files --others --exclude-standard` — new files that aren't tracked yet. Plain `git diff` won't show them.\n"+
		"- `git log %[1]s..HEAD --oneline` — the commit history on this branch.\n"+
		"- The Read tool for individual files. Grep and Glob for cross-file searches — check callers, tests, and neighbouring patterns.\n\n"+
		"Read the actual files, verify accurate line numbers for your directives, and base severity on the code you actually saw.",
		pr.BaseRef)

	// Explicit output shape. The server enforces JSON out-of-band via the
	// SDK's json_schema outputFormat; the Agent-tool path has no
	// equivalent, so if we don't ask for JSON here, the sub-agent might
	// return prose and the skill's JSON.parse step would fail. Fields
	// listed here match the methodology in SYSTEM_PROMPT — pinning them
	// here too is a small duplication that keeps the contract legible in
	// one place for the local flow.
	b.WriteString("\n\n## Output\n\n" +
		"Return your review as a single JSON object — no prose before or after — with these top-level fields, matching the methodology above:\n\n" +
		"- `summary` (string): 1-2 paragraphs on what changed and your overall assessment.\n" +
		"- `verdict` (string): `\"approve\"`, `\"request_changes\"`, or `\"needs_discussion\"`.\n" +
		"- `verdictRationale` (string): brief explanation of what drove the verdict.\n" +
		"- `findings` (array): each finding is an object with `title`, `severity`, `category`, `body` (markdown, may contain ::diff / ::code / ::suggestion directives), and — for any non-`info` finding — `fixPrompt` and `commentAnchor` per the methodology.\n\n" +
		"Order `findings` by severity (critical → info). Output the JSON object only — the caller parses your entire response as JSON.")

	return b.String()
}
