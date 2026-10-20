# Cruise Line

An AI-powered pull request analysis agent for the [Astro](https://astropods.ai) platform. Cruise Line reviews your GitHub pull requests for correctness, security, maintainability, performance, and code quality — then presents the results in a rich, interactive interface with one-click actions.

## What it does

When you open a pull request, Cruise Line:

- **Analyzes the changes** using Claude, examining the diff and reading surrounding code for context
- **Produces structured findings** with severity levels (critical, high, medium, low, info) and categories (correctness, security, maintainability, performance, style)
- **Suggests concrete fixes** with before/after diffs you can post as GitHub review comments in one click
- **Generates fix prompts** you can copy and paste into Claude Code to resolve issues
- **Posts a summary comment** on the PR with the verdict and finding counts
- **Provides a chat interface** where you can ask follow-up questions about the PR with full codebase access

## Features

- **Interactive analysis view** with severity badges, category tags, and a verdict banner
- **File viewer** with syntax-highlighted diffs and full file content, with inline commenting
- **Review rules** — configure per-repo rules that guide the analysis (e.g., "All API endpoints must validate input with Zod")
- **One-click commenting** — post findings and suggestions directly as GitHub review comments
- **Copy fix prompt** — copy a prompt to paste into Claude Code for automated fixes
- **Chat with context** — ask questions about the PR with full access to the codebase
- **Auto-start analysis** — analysis begins automatically when you visit the PR page

## Deploy on Astro

### Prerequisites

- An [Astro](https://astropods.ai) account
- The [Astro CLI](https://astropods.ai/docs/cli) installed

### Quick start

```bash
# Clone the repo
git clone https://github.com/anthropics/cruise-line.git
cd cruise-line

# Push to Astro
ast push
```

Once deployed, visit your agent's URL and follow the setup flow to connect a GitHub App. The setup wizard handles all GitHub configuration automatically — no manual token or webhook setup required.

### Configuration

Cruise Line is configured via the Astro setup flow. After deploying, visit `/settings` to:

1. Connect to GitHub (or GitHub Enterprise) by creating a GitHub App
2. Install the app on your repositories
3. Start reviewing PRs

Optional environment variables can be set in `astropods.yml`:

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5-5` | Default Claude model for analysis and chat |
| `MAX_CONCURRENT_JOBS` | `3` | Maximum concurrent analysis jobs |

Owners can override the model, and its effort level (default `high`), for
reviews and chat separately under **Settings → Models**. The picker lists every
model the deploy's Anthropic API key can use, from the Models API.

### GitHub Enterprise

Cruise Line supports GitHub Enterprise Server. During setup, enter your GitHub Enterprise URL and the agent will configure itself for your instance.

## Local development

```bash
# Start the full stack locally (Postgres, sandbox, agent)
ast dev

# Or run the agent as a local process with hot reload
ast dev --local
```

Visit `http://localhost:3200` to access the frontend.

### UI-only mock mode

To work on the frontend without GitHub, Postgres, or Claude:

```bash
cd frontend && bun run dev:mock
```

Open `http://localhost:5174/reviews`. The Vite dev server answers `/api/*` from
an in-memory mock (`frontend/dev/mock-api.ts`) seeded with one PR per UI state:
a finished review, a first review, a rerun that fails, a first review that
fails, a stale review, a rerun already in progress, an open PR nobody has
reviewed, and merged and closed PRs. Simulated runs take 15s
(`MOCK_JOB_SECONDS` to change it); `curl -X POST localhost:5174/__mock/reset`
restores the seeds. Chat streams a canned reply; posting comments and editing rules are not mocked.

## Architecture

Cruise Line runs as a single container on Astro with two supporting services:

- **Agent** — Hono web server (Bun runtime) serving the API, GitHub webhooks, OAuth, and the React frontend
- **Database** — PostgreSQL for walkthroughs, chat sessions, review rules, and app configuration
- **Sandbox** — Isolated container for chat queries with codebase access

The analysis engine uses the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) to clone repositories and generate structured reviews with full tool access (file reading, grep, glob, bash).

## Project structure

```
cruise-line/
├── agent/             # Backend (Hono server on Bun)
│   ├── analysis/      # Claude Agent SDK analysis engine + prompts
│   ├── chat/          # Chat system prompt
│   ├── db/            # Postgres client, migrations, CRUD
│   ├── github/        # GitHub App auth, OAuth, webhooks
│   ├── middleware/     # Session auth, error handling
│   ├── repo/          # Git clone management
│   └── routes/        # API routes
├── frontend/          # React SPA
│   └── src/
│       ├── components/  # UI components
│       ├── contexts/    # React contexts (slideout, comments)
│       ├── hooks/       # Custom hooks (walkthrough, chat, auth)
│       ├── lib/         # Directive parser, path resolution
│       ├── pages/       # Page components
│       └── styles/      # Global CSS
├── sandbox/           # Chat sandbox container
├── astropods.yml      # Astro deployment spec
├── Dockerfile         # Production build
└── LICENSE            # Apache 2.0
```

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
