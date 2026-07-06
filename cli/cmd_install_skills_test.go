package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveSkillsDir(t *testing.T) {
	t.Run("explicit --dir wins over environment and default", func(t *testing.T) {
		t.Setenv("CLAUDE_SKILLS_DIR", "/env-value")
		got, err := resolveSkillsDir("/explicit")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "/explicit" {
			t.Errorf("resolveSkillsDir(explicit) = %q, want /explicit", got)
		}
	})

	t.Run("CLAUDE_SKILLS_DIR is used when no explicit dir", func(t *testing.T) {
		t.Setenv("CLAUDE_SKILLS_DIR", "/env-value")
		got, err := resolveSkillsDir("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "/env-value" {
			t.Errorf("resolveSkillsDir(\"\") = %q, want /env-value", got)
		}
	})

	t.Run("falls back to ~/.claude/skills", func(t *testing.T) {
		t.Setenv("CLAUDE_SKILLS_DIR", "")
		got, err := resolveSkillsDir("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.HasSuffix(got, filepath.Join(".claude", "skills")) {
			t.Errorf("resolveSkillsDir default = %q, expected to end with .claude/skills", got)
		}
	})
}

func TestWriteEmbeddedSkills(t *testing.T) {
	t.Run("writes every bundled file preserving structure", func(t *testing.T) {
		dir := t.TempDir()
		written, skipped, err := writeEmbeddedSkills(dir, false)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(written) == 0 {
			t.Fatal("expected at least one file written")
		}
		if len(skipped) != 0 {
			t.Errorf("expected zero skipped, got %d", len(skipped))
		}

		// The main skill lives at cruise-line-review/SKILL.md — pin the
		// contract so an accidental rename breaks the test loudly.
		skillPath := filepath.Join(dir, "cruise-line-review", "SKILL.md")
		data, err := os.ReadFile(skillPath)
		if err != nil {
			t.Fatalf("expected %s to exist: %v", skillPath, err)
		}
		if !strings.Contains(string(data), "name: cruise-line-review") {
			t.Errorf("SKILL.md doesn't look like the bundled skill: %s", string(data)[:100])
		}
	})

	t.Run("skips existing files unless force is set", func(t *testing.T) {
		dir := t.TempDir()

		// First install creates everything.
		if _, _, err := writeEmbeddedSkills(dir, false); err != nil {
			t.Fatalf("first install failed: %v", err)
		}
		skillPath := filepath.Join(dir, "cruise-line-review", "SKILL.md")

		// Simulate a local edit the user made after install.
		if err := os.WriteFile(skillPath, []byte("# local edits\n"), 0o644); err != nil {
			t.Fatal(err)
		}

		// Second install without --force must leave the local edits alone.
		written, skipped, err := writeEmbeddedSkills(dir, false)
		if err != nil {
			t.Fatalf("second install failed: %v", err)
		}
		if len(written) != 0 {
			t.Errorf("expected zero writes on no-force reinstall, got %d", len(written))
		}
		if len(skipped) == 0 {
			t.Errorf("expected at least one skipped path on no-force reinstall")
		}
		data, err := os.ReadFile(skillPath)
		if err != nil {
			t.Fatal(err)
		}
		if string(data) != "# local edits\n" {
			t.Errorf("local edits were clobbered: got %q", string(data))
		}
	})

	t.Run("force overwrites existing files", func(t *testing.T) {
		dir := t.TempDir()
		if _, _, err := writeEmbeddedSkills(dir, false); err != nil {
			t.Fatalf("first install failed: %v", err)
		}
		skillPath := filepath.Join(dir, "cruise-line-review", "SKILL.md")
		if err := os.WriteFile(skillPath, []byte("# local edits\n"), 0o644); err != nil {
			t.Fatal(err)
		}

		written, skipped, err := writeEmbeddedSkills(dir, true)
		if err != nil {
			t.Fatalf("force install failed: %v", err)
		}
		if len(written) == 0 {
			t.Errorf("expected --force to write files")
		}
		if len(skipped) != 0 {
			t.Errorf("expected zero skipped with --force, got %d", len(skipped))
		}
		data, err := os.ReadFile(skillPath)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), "local edits") {
			t.Errorf("--force didn't overwrite: %s", string(data))
		}
	})
}

func TestWriteReviewerAgent(t *testing.T) {
	prompt := "You are a senior engineer reviewing a pull request..."

	t.Run("writes an agent file that embeds the server system prompt", func(t *testing.T) {
		dir := t.TempDir()
		agentPath := filepath.Join(dir, "cruise-line-reviewer.md")
		written, skipped, err := writeReviewerAgent(agentPath, prompt, false)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !written {
			t.Fatal("expected written=true on fresh install")
		}
		if skipped {
			t.Fatal("expected skipped=false on fresh install")
		}

		data, err := os.ReadFile(agentPath)
		if err != nil {
			t.Fatalf("expected %s to exist: %v", agentPath, err)
		}
		body := string(data)
		if !strings.Contains(body, "name: cruise-line-reviewer") {
			t.Errorf("frontmatter missing name field: %s", body[:200])
		}
		if !strings.Contains(body, prompt) {
			t.Error("agent body doesn't contain the server prompt")
		}
	})

	t.Run("skips existing agent file unless force is set", func(t *testing.T) {
		// This is important because writeReviewerAgent's whole reason to
		// exist is to sync the system prompt to the current server. If a
		// user has hand-edited the agent file, we'd blow away their edits
		// on every install run.
		dir := t.TempDir()
		agentPath := filepath.Join(dir, "cruise-line-reviewer.md")
		if err := os.WriteFile(agentPath, []byte("# hand-edited\n"), 0o644); err != nil {
			t.Fatal(err)
		}

		written, skipped, err := writeReviewerAgent(agentPath, prompt, false)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if written {
			t.Error("expected written=false on existing file without --force")
		}
		if !skipped {
			t.Error("expected skipped=true on existing file without --force")
		}
		data, _ := os.ReadFile(agentPath)
		if string(data) != "# hand-edited\n" {
			t.Errorf("hand edits clobbered: %q", string(data))
		}
	})

	t.Run("force overwrites existing agent file with the new prompt", func(t *testing.T) {
		dir := t.TempDir()
		agentPath := filepath.Join(dir, "cruise-line-reviewer.md")
		if err := os.WriteFile(agentPath, []byte("old\n"), 0o644); err != nil {
			t.Fatal(err)
		}

		written, _, err := writeReviewerAgent(agentPath, "NEW PROMPT", true)
		if err != nil {
			t.Fatal(err)
		}
		if !written {
			t.Error("expected written=true with --force")
		}
		data, _ := os.ReadFile(agentPath)
		if !strings.Contains(string(data), "NEW PROMPT") {
			t.Errorf("--force didn't overwrite: %q", string(data))
		}
	})

	t.Run("creates parent directories as needed", func(t *testing.T) {
		// The agent file lands in ~/.claude/agents/ — that directory may
		// not exist yet if the user has never used custom agents.
		dir := t.TempDir()
		agentPath := filepath.Join(dir, "agents", "cruise-line-reviewer.md")
		if _, _, err := writeReviewerAgent(agentPath, prompt, false); err != nil {
			t.Fatalf("expected mkdir-p behavior: %v", err)
		}
		if _, err := os.Stat(agentPath); err != nil {
			t.Errorf("expected %s to exist: %v", agentPath, err)
		}
	})
}

func TestRenderReviewerAgent(t *testing.T) {
	body := renderReviewerAgent("SYS_PROMPT_HERE")
	// Frontmatter has to declare the subagent_type the Agent tool will
	// look up. Pin the exact name — a typo would silently break the
	// skill's Agent(subagent_type=...) call.
	if !strings.Contains(body, "name: cruise-line-reviewer\n") {
		t.Error("agent frontmatter missing exact name")
	}
	if !strings.Contains(body, "tools:") {
		t.Error("agent frontmatter missing tools declaration")
	}
	if !strings.Contains(body, "SYS_PROMPT_HERE") {
		t.Error("system prompt not embedded in body")
	}
	// A regen note in the body explains why the file exists and how to
	// resync. Losing it would leave future readers puzzled.
	if !strings.Contains(body, "install-skills") {
		t.Error("regeneration note missing")
	}
}
