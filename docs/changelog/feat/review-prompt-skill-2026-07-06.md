# Local pre-PR review via a pinned Cruise Line sub-agent

## Summary

Developers regularly want to review their own changes before opening a
PR — they've made a batch of edits on a feature branch, want a critical
read pass, and don't want to push a WIP branch just to trigger the remote
Cruise Line analyzer. Round-tripping through GitHub also breaks the tight
review-fix-review loop: local edits aren't visible to the server until
they're pushed.

This change lets that loop run entirely inside a Claude Code session.
The methodology, severity taxonomy, and output shape are identical to
what the server would produce — no local reimplementation of the review
logic — but the actual reasoning happens in a sub-agent spawned inside
the caller's session, driven by `git diff` against the base branch. No
PR needed, no push needed, no commit needed between iterations.

## Design

### Two files installed side by side

The local review runs on two files that always get installed together
by `cruise-line install-skills`:

- **`~/.claude/skills/cruise-line-review/SKILL.md`** — the entry point.
  Runs deterministic bash prelude directives (`` !`command` ``) that
  determine the target repo and assemble the review inputs before the
  main agent sees the task.

- **`~/.claude/agents/cruise-line-reviewer.md`** — a sub-agent
  definition. Its body is the *exact* server-side `SYSTEM_PROMPT`,
  fetched at install time from `GET /api/cli/review-prompt`. Claude
  Code loads agent definitions from disk, so the sub-agent's system
  slot is pinned to what the server had at install time.

The skill invokes the sub-agent via Claude Code's `Agent` tool:

```
Agent(
  subagent_type: "cruise-line-reviewer",   // resolves to the pinned agent
  model: "opus",                            // same tier as the server
  prompt: <output of `cruise-line user-prompt owner/repo`>
)
```

The sub-agent's system prompt is server-controlled, the user prompt is
server-assembled from the caller's local diff + repo rules (see below),
and the model tier matches the server's Opus deployment. Behaviorally
the sub-agent runs the same review the analyzer would run — with the
critical difference that its inputs come from the local working tree
rather than a GitHub PR.

### No bundled diff: the sub-agent inspects the working tree directly

`cruise-line user-prompt <owner/repo>` builds a small prompt that
contains:

1. Change metadata (repo, branch names, SHAs, author) inferred locally
   from git.
2. The repo's configured review rules from
   `GET /api/rules/:owner/:repo` — the only server call per iteration,
   since rules are the one input that changes without a CLI upgrade.
3. A "where to look" section that points the sub-agent at git and
   filesystem tools: `git diff $(git merge-base <base> HEAD)` for the
   PR-shaped delta, `git ls-files --others --exclude-standard` for
   untracked files, plus Read/Grep/Glob for the actual code.
4. An "output" section that explicitly asks for a single JSON object
   with `summary`, `verdict`, `verdictRationale`, `findings[]` — the
   same shape the server produces. The server enforces JSON out-of-band
   via the SDK's `json_schema` outputFormat; the Agent-tool path has
   no equivalent, so we have to ask in the prompt itself. The skill's
   parse step relies on this.

The sub-agent has `Bash + Read + Grep + Glob`, so it runs those git
commands itself and reads whichever files it wants — no diff is
embedded in the prompt. This deliberately trades a diff-in-prompt
model for direct filesystem access, because the sub-agent runs in the
developer's working tree. Concrete wins:

- No merge-base semantics hard-coded into a diff string; the sub-agent
  can vary its commands as it explores.
- Untracked new files are visible via the normal `git ls-files` flow.
- Fixes applied between iterations are picked up automatically — the
  next invocation asks the sub-agent to look at the live filesystem,
  not a stale snapshot.
- No diff truncation, no UTF-8 slicing, no cross-language template
  synchronization: the CLI's `buildUserPrompt` is a small Go function
  that renders metadata + rules + git-tool guidance. It shares
  intent with the server's `buildUserPrompt` (same methodology, same
  rules formatting) but doesn't need byte-for-byte parity, because
  each is talking to a different environment (server sandbox with
  bundled diff vs. local sub-agent with filesystem access).

This design contributes ~zero server surface for the local review flow
— the pre-existing `/api/rules/:owner/:repo` endpoint is the only thing
touched per iteration.

### Loop control: judgment, not counting

The skill doesn't cap iterations. The main agent decides whether another
pass is worth running based on the review it just got back — unresolved
criticals or regressions warrant another iteration, an `approve` verdict
or repeat flags on findings already considered-and-rejected are signals
to stop.

Each iteration is the same shape:

1. `cruise-line user-prompt <owner/repo>` — assembles a fresh user
   prompt from the current working tree.
2. `Agent(subagent_type="cruise-line-reviewer", model="opus", prompt=…)`
   — sub-agent produces findings.
3. Parse JSON findings.
4. Either apply fixes with `Edit` and loop, or stop and report.

The loop never commits or pushes. Local file edits are enough to make
the next iteration see updated context.

### Why pinning the system prompt is the right trade-off

Claude Code loads agent definitions from disk; there's no runtime API
for injecting a system prompt into an `Agent` tool call. That leaves
two options: pin the prompt at install time and require an occasional
`install-skills --force` to resync after Cruise Line server upgrades,
or put everything in the user prompt and use a generic sub-agent (losing
the identity signal a system-slot prompt carries).

We went with pinning. The methodology moves rarely enough that a manual
resync is acceptable, and preserving the exact system-slot semantics is
what makes "runs the same review as the server" true rather than
approximately true. The pinned file carries an inline regen note.

## Migration

Existing users don't need to do anything — nothing runs the new skill
automatically.

To use the local review loop:

```
cruise-line login <host>       # if not already logged in
cruise-line install-skills     # writes skill + sub-agent definition
```

Then in a Claude Code session, from inside your feature branch's working
tree, ask the agent to "review with Cruise Line" (or explicitly invoke
`/cruise-line-review`). No PR needs to exist yet.

After a Cruise Line server upgrade that changes the review prompt, rerun
`cruise-line install-skills --force` to resync the pinned sub-agent
definition; the CLI's lazy update check will nag when a newer CLI is
available.
