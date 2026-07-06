# Local review loop via a pinned Cruise Line sub-agent

## Summary

Coding agents were still round-tripping to the remote Cruise Line analysis
service to review a PR, which is fine for a one-shot review but breaks
down when the agent wants to iterate — fix a finding, re-review, fix
again — because each round trip clones the repo, spins up a sandbox, and
posts back through GitHub webhooks.

This change gives agents a way to run the same review locally inside a
Claude Code session. The methodology, severity taxonomy, and user-prompt
shape are identical to what the server would produce — no local reim­
plementation of the review logic — but the actual reasoning happens in a
sub-agent spawned inside the caller's session, so the fix-review-fix
loop is fast and doesn't push commits.

## Design

### Two files installed side by side

The local review runs on two files that always get installed together
by `cruise-line install-skills`:

- **`~/.claude/skills/cruise-line-review/SKILL.md`** — the entry point.
  Runs deterministic bash prelude directives (`` !`command` ``) that
  fetch the target PR, the current diff, and the assembled user prompt
  before the main agent sees the task.

- **`~/.claude/agents/cruise-line-reviewer.md`** — a sub-agent
  definition. Its body is the *exact* server-side `SYSTEM_PROMPT`,
  fetched at install time from `GET /api/cli/review-prompt`. That's the
  sub-agent's system slot; it can't be injected at Agent-tool call time,
  so it's pinned on disk.

The skill invokes the sub-agent via Claude Code's `Agent` tool:

```
Agent(
  subagent_type: "cruise-line-reviewer",   // resolves to the pinned agent
  model: "opus",                            // same tier as the server
  prompt: <user prompt from `cruise-line pr prompt`>
)
```

The sub-agent's system prompt is server-controlled, the user prompt is
server-assembled from PR metadata + rules + diff (see below), and the
model tier matches the server's Opus deployment. Behaviorally the sub-
agent runs the same review the analyzer would run.

### Server assembles the user prompt

`GET /api/walkthroughs/:owner/:repo/:pr/prompt` is new and returns the
fully-assembled user prompt for a PR — the same one `buildUserPrompt`
produces server-side when the analysis job runs. It:

- Fetches PR metadata via the installation token (same call the analyzer
  uses).
- Pulls the diff via GitHub's `application/vnd.github.v3.diff` media
  type.
- Reads configured rules from the DB.
- Runs them all through `buildUserPrompt` — the exact same helper the
  analyzer imports.

Auth + repo access are inherited from the walkthroughs router. Bearer
callers reach it, non-collaborators don't.

Keeping the template server-side means there's one source of truth. If
the analyzer's prompt shape changes, the local review picks it up on
next invocation.

### Loop control: judgment, not counting

The skill doesn't cap iterations at a fixed number. The main agent
decides whether another pass is worth running based on the review it
just got back — unresolved criticals or regressions warrant another
iteration, an `approve` verdict or repeat flags on findings already
considered-and-rejected are signals to stop.

Each iteration is the same shape:

1. Fetch a fresh user prompt (the diff includes any local edits from
   the previous iteration's fixes).
2. Spawn the sub-agent with that prompt.
3. Read JSON findings.
4. Either apply fixes with `Edit` and loop, or stop and report.

The loop never commits or pushes. Local file edits are enough to make
the next iteration see updated context.

### Why pinning the system prompt is the right trade-off

Claude Code loads agent definitions from disk; there's no runtime API
for injecting a system prompt into an `Agent` tool call. That leaves two
options: pin the prompt at install time and require an occasional
`install-skills --force` to resync after Cruise Line server upgrades,
or put everything in the user prompt and use a generic sub-agent (losing
the identity signal a system-slot prompt carries).

We went with pinning. The methodology moves rarely enough that a manual
resync after a server upgrade is acceptable, and preserving the exact
system-slot semantics is what makes "runs the same review as the server"
true rather than approximately true. The pinned file carries an inline
regen note explaining how to update.

## Migration

Existing users don't need to do anything — nothing runs the new skill
automatically.

To use the local review loop:

```
cruise-line login <host>       # if not already logged in
cruise-line install-skills     # writes skill + sub-agent definition
```

Then in a Claude Code session, ask the agent to "review with Cruise
Line" (or explicitly `/cruise-line-review`). After a Cruise Line server
upgrade that changes the review prompt, rerun `cruise-line install-
skills --force` to resync the pinned sub-agent definition; the CLI's
lazy update check will nag when a newer CLI is available.
