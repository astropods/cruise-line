---
name: cruise-line-review
description: Run a Cruise Line review locally in a loop. Spawns a sub-agent (cruise-line-reviewer) that uses the exact server-side system prompt and user prompt, then applies fixes and re-reviews. Uses your judgment on when to stop — no fixed iteration count. Use this when the user asks you to "review with Cruise Line", "run a local Cruise Line review", or wants to iterate on a PR before pushing.
allowed-tools: Bash, Read, Edit, Glob, Grep, Agent
user-invocable: true
disable-model-invocation: true
---

## Target PR

If the user passed `owner/repo#N` explicitly, use it. Otherwise resolve the PR open on the current branch:

!`gh pr view --json number,headRepository --jq '{number, repo:.headRepository.nameWithOwner}'`

If no PR is found, stop and ask the user which PR to review.

## Loop

Each iteration is deterministic — the sub-agent's system prompt comes from the installed `cruise-line-reviewer` agent definition (pinned by `cruise-line install-skills`), and the user prompt comes from the server via `cruise-line pr prompt`, so a local run reads the same inputs a server-driven Cruise Line analysis would.

The **number of iterations is your judgment call**, not a fixed count. Keep looping as long as another pass looks likely to surface actionable issues, and stop when it doesn't. Signals that another iteration is worthwhile: unresolved critical or high findings, findings the last pass explicitly flagged as regressions from a recent fix, or a `needs_discussion` verdict on a change you can now address. Signals to stop: an `approve` verdict, findings you've already declined to fix (repeat flags aren't new information), or diminishing returns (the last pass introduced no new material findings).

Each iteration:

1. Fetch the current user prompt from the server:

   ```
   cruise-line pr prompt <owner/repo>#<N>
   ```

   Capture the entire output. Do not summarize or truncate it — the sub-agent expects the assembled prompt verbatim.

2. Invoke the sub-agent with the `Agent` tool:

   - `subagent_type`: `"cruise-line-reviewer"`
   - `model`: `"opus"` (matches the server's Opus deployment)
   - `description`: brief label for this iteration
   - `prompt`: the user prompt string from step 1

3. The sub-agent returns findings shaped exactly as the server would emit — a JSON object with `summary`, `verdict`, `findings[]`, each finding having `title`, `severity`, `category`, `body`, and (for non-info) `fixPrompt` + `commentAnchor`. Parse it.

4. Decide what to do next based on the review:
   - **Act on findings worth fixing.** Read the affected files with the Read tool (paths come from `commentAnchor.file`). Apply the fix guided by `fixPrompt` using the Edit tool. Don't commit or push — the loop expects local-only fixes between iterations. Then run another iteration.
   - **Skip findings you've considered and rejected.** If the review re-raises something you already decided not to fix (design trade-off, disagreement with the finding), don't keep churning on it. Note it in the final report and either stop or move on to other findings.
   - **Stop when you're done.** Approve verdicts, no remaining actionable findings, or the last iteration surfaced nothing new — any of these are a signal to end the loop.

## Final report

Print a summary for the user:

- The final verdict.
- One line per remaining finding: `[severity/category] title — file:lineStart-lineEnd`.
- A short paragraph on what was fixed during the loop (files touched, high-level nature of each fix).

Do **not** commit or push — leave that to the user. If the user asks you to commit afterwards, do so.

## Notes

- The sub-agent has `Read`, `Grep`, `Glob`, `Bash` — it reads local files to verify claims but doesn't edit. Fixes are the main agent's job.
- If `cruise-line pr prompt` fails (network, auth), stop and report — don't fall back to a local prompt-assembly path. That would defeat the "same inputs as server" contract.
- If the sub-agent's response isn't parseable JSON, treat that as a failed iteration and stop; don't attempt to fix an unparseable review.
