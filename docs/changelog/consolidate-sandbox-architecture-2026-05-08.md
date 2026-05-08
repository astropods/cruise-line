# Consolidate all Claude Code operations into the sandbox container

## Summary

Chat was broken on deployed instances because the agent and sandbox containers have separate filesystems. The agent cloned repos to its own ephemeral storage, then passed the path to the sandbox — which couldn't see the files. The astropods platform has no shared-volume mechanism between containers.

Rather than duplicating clones across both containers, this change consolidates all Claude Code execution and repo management into the sandbox container. The sandbox has persistent storage (`/data` volume); the agent container does not. The agent becomes a thin HTTP/DB/GitHub orchestrator.

## Design

The sandbox container is now the single owner of:
- **Repo clones** — stored in its persistent `/data/repos/` volume
- **Claude Agent SDK execution** — both walkthrough analysis and interactive chat
- **File serving** — the agent proxies file reads through the sandbox

The agent container no longer has git, Claude Code, or the Claude Agent SDK installed. It communicates with the sandbox via HTTP:

- `POST /ensure-clone` — clone/update a repo using a short-lived GitHub token
- `POST /query` — run a Claude query (chat or analysis with structured output)
- `POST /file-content` — read a file + diff patch from a cloned repo
- `POST /collect-files` — batch read files after analysis
- `POST /cleanup` — remove a clone when a PR closes

A typed client (`agent/sandbox-client.ts`) centralizes all sandbox communication, including an async generator that consumes the SSE stream from `/query` for analysis progress.

The `/query` endpoint was enhanced with an optional `outputFormat` field. When present, the `done` SSE event includes `structuredOutput` with Claude's parsed JSON — this is how walkthrough analysis gets structured results back through the HTTP boundary.

Concurrency is preserved: the agent's `JobManager` limits concurrent analysis jobs, and the sandbox uses per-PR mutex locks to prevent clone races. Different PRs get isolated paths (`/data/repos/owner/repo/prNumber`).

## Migration

No user-facing changes. The frontend API remains identical. Requires redeploying both the agent and sandbox container images together.
