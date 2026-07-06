---
name: cruise-line-review
description: Run a Cruise Line review locally in a loop. Spawns a sub-agent (cruise-line-reviewer) that uses the exact server-side system prompt and user prompt, then applies fixes and re-reviews until only info-level findings remain. Use this when the user asks you to "review with Cruise Line", "run a local Cruise Line review", or wants to iterate on a PR before pushing.
allowed-tools: Bash, Read, Edit, Glob, Grep, Agent
user-invocable: true
disable-model-invocation: true
---

## Target PR

If the user passed `owner/repo#N` explicitly, use it. Otherwise resolve the PR open on the current branch:

!`gh pr view --json number,headRepository --jq '{number, repo:.headRepository.nameWithOwner}'`

If no PR is found, stop and ask the user which PR to review.

## Loop (max 5 iterations)

Each iteration is fully deterministic — the sub-agent's system prompt comes from the installed `cruise-line-reviewer` agent definition (pinned by `cruise-line install-skills`), and the user prompt comes from the server via `cruise-line pr prompt`, so a local run reads the same inputs a server-driven Cruise Line analysis would.

For iteration `i` from 1 to 5:

1. Fetch the current user prompt from the server:

   ```
   cruise-line pr prompt <owner/repo>#<N>
   ```

   Capture the entire output. Do not summarize or truncate it — the sub-agent expects the assembled prompt verbatim.

2. Invoke the sub-agent with the `Agent` tool:

   - `subagent_type`: `"cruise-line-reviewer"`
   - `model`: `"opus"` (matches the server's Opus deployment)
   - `description`: `"Cruise Line review iteration <i>"`
   - `prompt`: the user prompt string from step 1

3. The sub-agent returns findings shaped exactly as the server would emit — a JSON object with `summary`, `verdict`, `findings[]`, each finding having `title`, `severity`, `category`, `body`, and (for non-info) `fixPrompt` + `commentAnchor`. Parse it.

4. Termination check — stop the loop if any of these hold:
   - `verdict` is `"approve"`.
   - No findings with severity `critical` or `high` remain.
   - `i == 5`.

5. Otherwise, act on the critical and high findings:
   - Read the affected files with the Read tool (paths come from `commentAnchor.file`).
   - Apply the fix guided by `fixPrompt` using the Edit tool.
   - Don't commit or push — the loop expects local-only fixes between iterations.
   - Continue to the next iteration.

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
