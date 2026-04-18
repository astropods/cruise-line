# cruise-line

A GitHub PR review tool that generates guided walkthroughs of pull requests.
Built on the Astropods platform using the Claude Agent SDK.

For comprehensive documentation including **critical API usage notes**, run `ast docs`.

## Architecture

Single container (Hono web server on Bun) serving:
- GitHub webhook endpoint (PR events)
- REST API (walkthrough CRUD, generation triggers)
- GitHub OAuth (viewer authentication)
- React frontend (walkthrough viewer)

Core analysis uses `@anthropic-ai/claude-agent-sdk` to clone repos and generate
structured walkthrough JSON with chapters grouped by intent, not by file.

## Key paths

- `agent/` — Backend (Hono server, routes, GitHub integration, analysis engine, DB)
- `frontend/` — React SPA (Vite, Shiki, Framer Motion, Tailwind)
- `astropods.yml` — Astropods deployment spec
