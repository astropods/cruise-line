# cruise-line

A GitHub PR review tool that generates guided reviews of pull requests.
Built on the Astropods platform using the Claude Agent SDK.

For comprehensive documentation including **critical API usage notes**, run `ast docs`.

## Architecture

Single container (Hono web server on Bun) serving:
- GitHub webhook endpoint (PR events)
- REST API (reviews, generation triggers; stored as `walkthroughs` for history)
- GitHub OAuth (viewer authentication)
- React frontend (inbox and review viewer)

Core analysis uses `@astropods/adapter-claude-agent-sdk` (a drop-in replacement
for `@anthropic-ai/claude-agent-sdk` with OTEL instrumentation baked in) to
clone repos and generate a structured review: summary, verdict, findings, and
an architecture overview.

## Key paths

- `agent/` — Backend (Hono server, routes, GitHub integration, analysis engine, DB)
- `frontend/` — React SPA (Vite, Shiki, Framer Motion, Tailwind)
- `astropods.yml` — Astropods deployment spec
