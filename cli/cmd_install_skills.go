package main

import (
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// skillsFS is the tree of starter skill files bundled with the CLI.
// Every file under cli/skills/ ships with the binary and gets written
// out by `cruise-line install-skills`.
//
//go:embed skills
var skillsFS embed.FS

// cliReviewerAgentPath is the sub-agent definition file the local-review
// skill invokes via the Agent tool. Its body holds the exact server-side
// SYSTEM_PROMPT, fetched at install time so the sub-agent runs with the
// same system slot Cruise Line would run.
//
// Kept as a relative path so it composes cleanly with either the default
// ~/.claude location or the --dir / CLAUDE_SKILLS_DIR override. The
// convention on Claude Code is:
//   ~/.claude/skills/<name>/SKILL.md
//   ~/.claude/agents/<name>.md
// so the two directories are siblings — the agents dir lives one level
// above the skills dir.
const cliReviewerAgentRelativePath = "../agents/cruise-line-reviewer.md"

// cmdInstallSkills implements `cruise-line install-skills`.
//
// Writes the bundled skill file to the user's Claude skills directory
// AND fetches the current server SYSTEM_PROMPT to write a sub-agent
// definition at ~/.claude/agents/cruise-line-reviewer.md. The skill
// spawns that sub-agent via the Agent tool, so the two files are only
// useful together.
//
// The sub-agent's system prompt is pinned at install time. Re-run
// `cruise-line install-skills --force` after a Cruise Line server upgrade
// to sync — otherwise the local sub-agent runs against a stale
// methodology.
func cmdInstallSkills(args []string) error {
	fs_ := flag.NewFlagSet("install-skills", flag.ContinueOnError)
	force := fs_.Bool("force", false, "overwrite existing skill/agent files even if they've been edited locally")
	dirFlag := fs_.String("dir", "", "install skills into this directory instead of the default ~/.claude/skills")
	fs_.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: cruise-line install-skills [--force] [--dir PATH]")
	}
	if err := fs_.Parse(args); err != nil {
		return err
	}
	if fs_.NArg() != 0 {
		fs_.Usage()
		return errors.New("install-skills does not take positional arguments")
	}

	dest, err := resolveSkillsDir(*dirFlag)
	if err != nil {
		return err
	}

	cfg, err := RequireLoggedIn()
	if err != nil {
		// The skill isn't useful without the sub-agent file, and that
		// requires fetching the server prompt. Force the user through
		// login rather than half-installing.
		return err
	}

	// Write the embedded skill files first — even if the prompt fetch
	// fails later, the user still has a partial install they can retry.
	written, skipped, err := writeEmbeddedSkills(dest, *force)
	if err != nil {
		return err
	}

	client := NewClient(cfg)
	var promptResp struct {
		Prompt string `json:"prompt"`
	}
	if err := client.GetJSON("/api/cli/review-prompt", &promptResp); err != nil {
		return fmt.Errorf("fetching server review prompt: %w", err)
	}

	agentPath := filepath.Join(dest, cliReviewerAgentRelativePath)
	agentPath = filepath.Clean(agentPath)

	agentWritten, agentSkipped, err := writeReviewerAgent(agentPath, promptResp.Prompt, *force)
	if err != nil {
		return err
	}
	if agentWritten {
		written = append(written, agentPath)
	} else if agentSkipped {
		skipped = append(skipped, agentPath)
	}

	for _, p := range written {
		fmt.Printf("  wrote %s\n", p)
	}
	for _, p := range skipped {
		fmt.Printf("  skipped %s (already exists — pass --force to overwrite)\n", p)
	}
	fmt.Println()
	fmt.Printf("Installed %d file(s) under %s\n", len(written), dest)
	if len(skipped) > 0 {
		fmt.Printf("Kept %d existing file(s) as-is\n", len(skipped))
	}
	return nil
}

// resolveSkillsDir returns the directory to install into. Explicit --dir
// wins; otherwise honor CLAUDE_SKILLS_DIR for tests and power users, then
// fall back to ~/.claude/skills which is where Claude Code looks by default.
func resolveSkillsDir(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}
	if env := os.Getenv("CLAUDE_SKILLS_DIR"); env != "" {
		return env, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home dir: %w", err)
	}
	return filepath.Join(home, ".claude", "skills"), nil
}

// writeEmbeddedSkills walks the embedded FS and writes every file to dest,
// preserving the directory layout under skills/. Existing files are
// skipped unless force is set. Returns the paths actually written and
// those skipped so the CLI can report both.
func writeEmbeddedSkills(dest string, force bool) (written, skipped []string, err error) {
	err = fs.WalkDir(skillsFS, "skills", func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}

		// Strip the "skills/" prefix so the on-disk layout mirrors what
		// Claude Code expects under ~/.claude/skills/, not
		// ~/.claude/skills/skills/.
		rel := strings.TrimPrefix(path, "skills/")
		outPath := filepath.Join(dest, rel)

		if !force {
			if _, statErr := os.Stat(outPath); statErr == nil {
				skipped = append(skipped, outPath)
				return nil
			}
		}

		if mkErr := os.MkdirAll(filepath.Dir(outPath), 0o755); mkErr != nil {
			return fmt.Errorf("creating %s: %w", filepath.Dir(outPath), mkErr)
		}

		data, readErr := skillsFS.ReadFile(path)
		if readErr != nil {
			return fmt.Errorf("reading embedded %s: %w", path, readErr)
		}
		if writeErr := os.WriteFile(outPath, data, 0o644); writeErr != nil {
			return fmt.Errorf("writing %s: %w", outPath, writeErr)
		}
		written = append(written, outPath)
		return nil
	})
	return written, skipped, err
}

// writeReviewerAgent writes the sub-agent definition file consumed by the
// cruise-line-review skill. Its body is the raw server SYSTEM_PROMPT, so
// the sub-agent's system slot matches what the Cruise Line analyzer would
// send verbatim.
func writeReviewerAgent(agentPath, systemPrompt string, force bool) (written, skipped bool, err error) {
	if !force {
		if _, statErr := os.Stat(agentPath); statErr == nil {
			return false, true, nil
		}
	}
	if mkErr := os.MkdirAll(filepath.Dir(agentPath), 0o755); mkErr != nil {
		return false, false, fmt.Errorf("creating %s: %w", filepath.Dir(agentPath), mkErr)
	}
	content := renderReviewerAgent(systemPrompt)
	if writeErr := os.WriteFile(agentPath, []byte(content), 0o644); writeErr != nil {
		return false, false, fmt.Errorf("writing %s: %w", agentPath, writeErr)
	}
	return true, false, nil
}

// renderReviewerAgent produces the on-disk sub-agent definition. The
// frontmatter is fixed; the body is the server-provided SYSTEM_PROMPT.
// A regeneration note at the top tells maintainers where to re-fetch
// if the file drifts from server.
func renderReviewerAgent(systemPrompt string) string {
	return `---
name: cruise-line-reviewer
description: One-shot code reviewer. Uses the exact server-side Cruise Line methodology, severity taxonomy, and output shape. Invoked by the cruise-line-review skill inside a review-fix-review loop.
tools: Read, Grep, Glob, Bash
---

<!--
  Body below is the Cruise Line server SYSTEM_PROMPT, pinned at install
  time via ` + "`cruise-line install-skills`" + `. Re-run install-skills after
  a Cruise Line server upgrade to sync the local methodology to the
  current server prompt.
-->

` + systemPrompt + "\n"
}
