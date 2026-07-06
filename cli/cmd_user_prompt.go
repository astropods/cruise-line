package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// cmdUserPrompt implements `cruise-line user-prompt <owner/repo>`.
//
// Assembles the user prompt for a *local pre-PR* review. The developer is
// on a feature branch with local changes (committed and/or uncommitted)
// and wants a Cruise Line-style review before opening a PR on GitHub.
//
// Runs almost entirely against the local working tree:
//   - Diff comes from `git diff <base>` (base ref auto-detected from
//     origin/HEAD, overridable with --base).
//   - PR-shaped metadata is inferred from git (branch names, SHAs,
//     `user.name` for author).
//   - Rules come from the server via GET /api/rules/:owner/:repo — the
//     only server call per invocation, since rules are the one input
//     that can change without a CLI upgrade.
//
// The user prompt is then assembled locally via buildUserPrompt (a Go
// port of the TS analyzer helper, cross-tested against the same golden
// file — see cli/user_prompt.go and agent/analysis/prompt.test.ts).
func cmdUserPrompt(args []string) error {
	fs := flag.NewFlagSet("user-prompt", flag.ContinueOnError)
	baseFlag := fs.String("base", "", "base ref to diff against (default: origin/HEAD, or main)")
	titleFlag := fs.String("title", "", "override the change title (default: current branch name)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line user-prompt <owner/repo> [--base <ref>] [--title <text>]")
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return errors.New("expected exactly one positional argument: owner/repo")
	}
	owner, repo, ok := strings.Cut(fs.Arg(0), "/")
	if !ok || owner == "" || repo == "" {
		return fmt.Errorf("expected owner/repo, got %q", fs.Arg(0))
	}

	// Every step below shells out to git — this command only makes sense
	// from inside a git working tree.
	if _, err := gitOutput("rev-parse", "--is-inside-work-tree"); err != nil {
		return fmt.Errorf("not inside a git working tree: %w", err)
	}

	base := *baseFlag
	if base == "" {
		base = detectDefaultBase()
	}

	// Verify the base ref resolves to something. A clear early error is
	// better than a cryptic `git diff` failure buried in the loop.
	if _, err := gitOutput("rev-parse", "--verify", base); err != nil {
		return fmt.Errorf("base ref %q not found (use --base to override): %w", base, err)
	}

	diff, err := gitOutput("diff", base)
	if err != nil {
		return fmt.Errorf("git diff %s: %w", base, err)
	}
	if strings.TrimSpace(diff) == "" {
		return fmt.Errorf("no changes against %s — nothing to review", base)
	}

	headRef, _ := gitOutput("rev-parse", "--abbrev-ref", "HEAD")
	headSha, _ := gitOutput("rev-parse", "HEAD")
	baseSha, _ := gitOutput("rev-parse", base)
	author, _ := gitOutput("config", "user.name")

	title := *titleFlag
	if title == "" {
		title = strings.TrimSpace(headRef)
		if title == "" || title == "HEAD" {
			title = "Local pre-PR review"
		}
	}

	// Strip "origin/" or similar remote prefix from the reported base ref
	// so the prompt reads naturally ("Base: main → Head: feat/x" rather
	// than "Base: origin/main → Head: feat/x").
	baseRef := base
	if _, after, ok := strings.Cut(base, "/"); ok {
		baseRef = after
	}

	cfg, err := RequireLoggedIn()
	if err != nil {
		return err
	}
	client := NewClient(cfg)

	// Fetch rules from the server. This is the ONLY server round-trip per
	// iteration — the prompt is assembled locally via buildUserPrompt (Go
	// port of the server-side TS helper, cross-tested against a golden
	// file). Same review methodology, no bespoke assembly endpoint.
	var rulesResp struct {
		Rules []struct {
			RuleNumber int    `json:"ruleNumber"`
			Rule       string `json:"rule"`
		} `json:"rules"`
	}
	if err := client.GetJSON(fmt.Sprintf("/api/rules/%s/%s", owner, repo), &rulesResp); err != nil {
		return fmt.Errorf("fetching rules: %w", err)
	}
	rules := make([]reviewRule, 0, len(rulesResp.Rules))
	for _, r := range rulesResp.Rules {
		rules = append(rules, reviewRule{RuleNumber: r.RuleNumber, Rule: r.Rule})
	}

	prompt := buildUserPrompt(prMetadata{
		Owner:   owner,
		Repo:    repo,
		Number:  0, // pre-PR local review — no GitHub PR number
		Title:   title,
		Author:  strings.TrimSpace(author),
		BaseRef: baseRef,
		HeadRef: strings.TrimSpace(headRef),
		BaseSha: strings.TrimSpace(baseSha),
		HeadSha: strings.TrimSpace(headSha),
	}, diff, rules)

	fmt.Println(prompt)
	return nil
}

// gitOutput runs a git command in the current working directory and
// returns its stdout as a trimmed string. stderr is captured into the
// returned error so the caller sees git's own diagnostics.
func gitOutput(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			return "", err
		}
		return "", fmt.Errorf("%s: %s", err, msg)
	}
	return strings.TrimRight(stdout.String(), "\n"), nil
}

// detectDefaultBase returns the branch treated as "the base" by the local
// repo's convention. Order:
//  1. `origin/HEAD` symbolic ref (this is what `git clone` sets to the
//     default branch — usually main or master).
//  2. `origin/main` if it exists.
//  3. `main` fallback (works for repos with no origin remote).
func detectDefaultBase() string {
	if s, err := gitOutput("symbolic-ref", "--short", "refs/remotes/origin/HEAD"); err == nil && s != "" {
		return s
	}
	if _, err := gitOutput("rev-parse", "--verify", "origin/main"); err == nil {
		return "origin/main"
	}
	return "main"
}
