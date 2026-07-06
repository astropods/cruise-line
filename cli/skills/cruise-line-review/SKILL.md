---
name: cruise-line-review
description: Review local changes with Cruise Line's methodology before opening a PR. Spawns a sub-agent (cruise-line-reviewer) using the exact server-side system prompt and a user prompt assembled from `git diff` against the base branch. Loops until you're satisfied — you use your judgment on when to stop, no fixed iteration count. Use this when the user asks to "review with Cruise Line", "run a local Cruise Line review", or wants to iterate on their changes before pushing.
allowed-tools: Bash, Read, Edit, Glob, Grep, Agent
user-invocable: true
disable-model-invocation: true
---

## Target repository

The user is reviewing local changes in their current working tree. Determine which Cruise Line-installed repo they're in:

!`gh repo view --json nameWithOwner --jq .nameWithOwner`

If that fails (no `gh`, no origin remote, or the repo isn't on GitHub), ask the user for `<owner>/<repo>` explicitly.

## Loop

Each iteration is deterministic: the sub-agent's system prompt is pinned in the `cruise-line-reviewer` agent definition (updated by `cruise-line install-skills`), and the user prompt is assembled fresh from `git diff <base>` against the current working tree — so any local fixes the previous iteration applied are visible to the next review.

The **number of iterations is your judgment call**, not a fixed count. Keep looping while another pass looks likely to surface actionable issues, and stop when it doesn't. Worthwhile signals: unresolved critical or high findings, findings the last pass flagged as regressions from a recent fix, a `needs_discussion` verdict on something you can now address. Stop signals: an `approve` verdict, findings you've already declined to fix (repeat flags aren't new information), or diminishing returns.

Each iteration:

1. Assemble the user prompt from the current working tree:

   ```
   cruise-line user-prompt <owner/repo>
   ```

   Captures the full `git diff` against the auto-detected base (usually `origin/HEAD` → `main`). Pass `--base <ref>` if the user is targeting a non-default base branch. The diff includes committed, staged, and unstaged changes — so fixes from the previous iteration are picked up automatically without needing to commit.

   Capture the entire output verbatim.

2. Invoke the sub-agent with the `Agent` tool:

   - `subagent_type`: `"cruise-line-reviewer"`
   - `model`: `"opus"` (matches the server's Opus deployment)
   - `description`: brief label for this iteration
   - `prompt`: the user prompt string from step 1

3. The sub-agent returns findings shaped like a server-driven Cruise Line review — JSON with `summary`, `verdict`, `findings[]`, each finding carrying `title`, `severity`, `category`, `body`, and (for non-info) `fixPrompt` + `commentAnchor`. Parse it.

4. Decide what to do next based on the review:
   - **Act on findings worth fixing.** Read the affected files with the Read tool (paths come from `commentAnchor.file`). Apply the fix guided by `fixPrompt` using the Edit tool. Don't commit — the next iteration's `git diff` will pick up the edits regardless.
   - **Skip findings you've considered and rejected.** If the review re-raises something you already decided not to fix (design trade-off, disagreement with the finding), don't keep churning. Note it in the final report and either stop or move on to other findings.
   - **Stop when you're done.** Approve verdicts, no remaining actionable findings, or the last iteration surfaced nothing new — any of these are a signal to end the loop.

## Final report

Print a summary for the user:

- The final verdict.
- One line per remaining finding: `[severity/category] title — file:lineStart-lineEnd`.
- A short paragraph on what was fixed during the loop (files touched, high-level nature of each fix).

Do **not** commit or push — leave that to the user. If they ask you to commit afterwards, do so.

## Notes

- If `cruise-line user-prompt` reports "no changes against <base>", the user's working tree matches the base branch — nothing to review. Ask if they meant a different base.
- If `cruise-line user-prompt` fails on auth or network, stop and report — don't fall back to a local prompt-assembly path. That would defeat the "same inputs as server" contract.
- If the sub-agent's response isn't parseable JSON, treat that as a failed iteration and stop; don't attempt to fix an unparseable review.
