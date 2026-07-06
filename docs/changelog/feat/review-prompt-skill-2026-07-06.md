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

### Server assembles the user prompt from client-provided diff

`POST /api/cli/user-prompt/:owner/:repo` is new. Body:

```json
{
  "diff":     "<git diff output>",
  "title":    "feature branch name",
  "author":   "<git user.name>",
  "baseRef":  "main",
  "headRef":  "feat/x",
  "baseSha":  "aaa",
  "headSha":  "bbb"
}
```

Only `diff` is required. Every metadata field has a defensible default
so a caller can send just the diff and get a usable prompt back.

The endpoint fetches the repo's configured review rules from the DB and
runs everything through `buildUserPrompt` — the same helper the server-
side analyzer uses. Auth: `requireAuth` + `requireRepoAccess`, so a
caller only assembles prompts for repos they can actually see.

Rate-limited at 30/min per user. The review loop calls this once per
iteration; the limit is generous enough for interactive use and tight
enough that a runaway loop can't hammer the endpoint.

### Diff comes from the working tree, not GitHub

`cruise-line user-prompt <owner/repo>` runs `git diff <base>` against
the working tree, so the diff picks up:

- committed changes on the branch
- staged changes
- unstaged working-copy edits

The `<base>` ref is auto-detected via `origin/HEAD` (what `git clone`
points at, usually `main`) with a `--base` flag for overrides. The
resulting diff is the client-provided `diff` field in the POST body
above.

This is what makes the review-fix-review loop converge without any
`git commit` between iterations: the main agent applies fixes via
`Edit`, and the next `cruise-line user-prompt` call sees them.

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
