---
name: cruise-line-review
description: Review local changes with Cruise Line's methodology before opening a PR. Spawns a sub-agent (cruise-line-reviewer) using the exact server-side system prompt; the sub-agent inspects the developer's working tree directly via git. Loops until you're satisfied — you use your judgment on when to stop, no fixed iteration count. Use this when the user asks to "review with Cruise Line", "run a local Cruise Line review", or wants to iterate on their changes before pushing.
allowed-tools: Bash, Read, Edit, Glob, Grep, Agent
user-invocable: true
disable-model-invocation: true
---

## Target repository

The user is reviewing local changes in their current working tree. Determine which Cruise Line-installed repo they're in:

!`gh repo view --json nameWithOwner --jq .nameWithOwner`

If that fails (no `gh`, no origin remote, or the repo isn't on GitHub), ask the user for `<owner>/<repo>` explicitly.

## Loop

Each iteration is deterministic: the sub-agent's system prompt is pinned in the `cruise-line-reviewer` agent definition (updated by `cruise-line install-skills`), and the user prompt points the sub-agent at the current working tree via `git` commands it runs itself. Any local fixes the previous iteration applied are visible to the next review automatically, because the sub-agent inspects the live filesystem rather than a bundled diff.

The **number of iterations is your judgment call**, not a fixed count. Keep looping while another pass looks likely to surface actionable issues, and stop when it doesn't. Worthwhile signals: unresolved critical or high findings, findings the last pass flagged as regressions from a recent fix, a `needs_discussion` verdict on something you can now address. Stop signals: an `approve` verdict, findings you've already declined to fix (repeat flags aren't new information), or diminishing returns.

Each iteration:

1. Assemble the user prompt:

   ```
   cruise-line user-prompt <owner/repo>
   ```

   Emits the sub-agent's user-slot prompt: repo metadata, configured review rules, and instructions pointing at git commands (`git diff $(git merge-base <base> HEAD)`, `git ls-files --others --exclude-standard`) plus the Read/Grep tools. Base ref auto-detects to `origin/HEAD` (usually `main`); pass `--base <ref>` for a non-default target.

   Capture the entire output verbatim.

2. Invoke the sub-agent with the `Agent` tool:

   - `subagent_type`: `"cruise-line-reviewer"`
   - `model`: `"opus"` (matches the server's Opus deployment)
   - `description`: brief label for this iteration
   - `prompt`: the user prompt string from step 1

3. The sub-agent returns a single JSON object (the user prompt from step 1 explicitly asks for this shape): `summary`, `verdict`, `verdictRationale`, and `findings[]` — each finding carrying `title`, `severity`, `category`, `body`, and (for non-info) `fixPrompt` + `commentAnchor`. Parse it.

4. Decide what to do next based on the review:
   - **Act on findings worth fixing.** Read the affected files with the Read tool (paths come from `commentAnchor.file`). Apply the fix guided by `fixPrompt` using the Edit tool. Don't commit — the sub-agent inspects the working tree live, so fixes are visible to the next iteration automatically.
   - **Skip findings you've considered and rejected.** If the review re-raises something you already decided not to fix (design trade-off, disagreement with the finding), don't keep churning. Note it in the final report and either stop or move on to other findings.
   - **Stop when you're done.** Approve verdicts, no remaining actionable findings, or the last iteration surfaced nothing new — any of these are a signal to end the loop.

## Final report

Print a summary for the user:

- The final verdict.
- One line per remaining finding: `[severity/category] title — file:lineStart-lineEnd`.
- A short paragraph on what was fixed during the loop (files touched, high-level nature of each fix).

Do **not** commit or push — leave that to the user. If they ask you to commit afterwards, do so.

## Notes

- The sub-agent (`cruise-line-reviewer`) has `Bash`, `Read`, `Grep`, `Glob` — it runs its own `git diff`, reads its own files. Don't hand-hold it or feed it a diff separately.
- If the sub-agent's response isn't parseable JSON, treat that as a failed iteration and stop; don't attempt to fix an unparseable review.
- If `cruise-line user-prompt` fails on auth or network, stop and report — don't skip the fetch and hand-assemble a prompt yourself. The point is to run the same review methodology the server would.
