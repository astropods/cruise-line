# cruise-line

A GitHub PR review tool that generates guided walkthroughs of pull requests.

## Development

Three terminals:

```bash
# Terminal 1: Start infrastructure (Postgres)
ast dev

# Terminal 2: Start backend with hot reload
bun run dev

# Terminal 3: Start frontend with HMR
cd frontend && bun run dev
```

Open http://localhost:5173 in browser.

- Backend auto-restarts on file changes via `bun --watch` (port 3002)
- Frontend hot-reloads via Vite HMR (port 5173)
- Vite proxies `/api/*` requests to the backend
- `ast dev` only runs Postgres — your code runs on the host

## Production

```bash
ast push
```

The Dockerfile builds everything into a single container (backend + frontend static assets) served on port 80.

## Project structure

```
cruise-line/
├── agent/             # Backend (Hono server)
│   ├── index.ts       # Server entry point
│   ├── routes/        # API routes (webhook, auth, walkthroughs, setup)
│   ├── github/        # GitHub App auth, OAuth, webhooks
│   ├── analysis/      # Claude Agent SDK integration
│   ├── db/            # Postgres client, migrations, CRUD
│   └── middleware/     # Session auth, error handling
├── frontend/          # React SPA (Vite, Shiki, Framer Motion, Tailwind)
│   └── src/
├── scripts/
│   └── dev.ts         # Dev server bootstrap (env setup + import agent)
├── astropods.yml      # Astropods deployment spec
└── Dockerfile         # 3-stage production build
```
