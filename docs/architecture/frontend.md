# Frontend architecture

How `frontend/src` is organized, and why. Written for the 2026-10 redesign
(inbox sidebar, compact PR bar, finding cards, settings in the shell);
designs live in the "Cruise Line" Paper file.

## Layout

```
frontend/src/
  main.tsx      Mounts the app with the query client
  app/          App (routes), gates (sign-in, setup), session queries, NotFoundPage
  ui/           Visual building blocks. No data fetching, no domain types.
                Avatar, Button, Card, EmptyState, IconButton, Kbd, Menu, PageSpinner,
                Pill, Popover, ProgressBar, SegmentedControl, Spinner, StatusIcon
  shell/        AppShell (sidebar + outlet), Sidebar, AccountMenu, Logo
  features/
    inbox/      Sidebar PR list: tabs, rows, model, list query
    review/     ReviewPage, PrBar, BarStatePill, VerdictCard, FindingCard, queries;
                content/ renders review bodies (RichContent, diffs, suggestions,
                the file slideout) and parses their directives
    architecture/
    chat/       ChatPanel, ChatInputBar, useChat
    comments/   Inline PR comments and their context
    rules/      RulesPanel
    settings/   SettingsEntry (setup, claim), SettingsLayout, sections/, onboarding/
    auth/       Login, CLI consent, dev auth handoff
    home/       Public home page and CLI tokens
  domain/       Pure TypeScript, no React. Tested with `bun test`.
                prStatus.ts  run state + PR state + verdict → tone, icon, label
                severity.ts  severity order, tone, label, counts
  api/          client.ts (apiFetch, ApiError), one module per area, queryKeys;
                types.ts re-exports the review types from agent/analysis/types.ts
  lib/          Generic helpers (cx, time, useNow, scopePath)
  dev/          The /__ui component sheet (dev builds only)
```

## Rules

- **`ui/` knows nothing about PRs.** Components take styling options
  (`tone`, `size`, `variant`) and children. Every color comes from the
  tones in `ui/tone.ts`, which map to the theme tokens in
  `styles/globals.css`.
- **How a status looks is decided once, in `domain/`.** The inbox row,
  the PR bar pill, and the verdict card all read `domain/prStatus.ts`.
  "Needs attention" is defined there too.
- **Pages load data; feature components render it.** Feature components
  take domain objects as props and don't fetch.
- **Routes:** `/` is the inbox when signed in and the public home page
  when signed out; `/cli` is the home page for everyone (the account menu's
  "CLI access"); PR pages live inside the shell; `/reviews` redirects to `/`.
- **State that should survive a reload or a shared link goes in the URL:**
  the PR view (`/:owner/:repo/pull/:pr/:view?`), the inbox tab
  (`?inbox=`), the settings section (`/settings/:section`).
- **Colors are theme tokens, never raw values.** Use `bg-surface
  text-fg-muted border-line`, not `bg-[var(--bg-secondary)]` or hex. The
  old `--bg-*`/`--text-*` variables remain as aliases until the last
  component moves over.

## Theme tokens

| Token | Use |
|---|---|
| `canvas` | Page background |
| `sunken` | Sidebar, behind the canvas |
| `surface` | Cards, bars, inputs |
| `raised` | Selected segment, hover, chips |
| `line`, `line-strong` | Borders, dividers |
| `fg-strong`, `fg`, `fg-muted` | Headings, body, secondary text |
| `accent`, `accent-strong`, `accent-emphasis` | Links, focus, running state |
| `success`, `success-emphasis` | Approved, Open, primary action |
| `warning`, `warning-fg` | Medium severity, stale |
| `severe` | High severity |
| `danger`, `danger-fg` | Critical, changes requested, failed |
| `done`, `done-fg` | Merged |

## Data

TanStack Query owns server state. One cached PR list feeds the sidebar
and the PR bar; polling is on only while a review is running; starting or
rerunning a review invalidates both. No component calls `fetch`
directly.

## Build phases

1. Foundation: theme tokens, `ui/`, `api/` split, `domain/` with tests.
2. Data: TanStack Query; backend list fields (author avatar, branches,
   additions/deletions, changed files, merged time, severity counts).
3. Shell + inbox sidebar; `/reviews` and the old top bar go away.
4. Review page: PR bar with states, verdict card, finding cards.
5. Settings inside the shell, split into sections.
6. Cleanup: types shared with `agent/`, every API call in `api/`, theme
   tokens everywhere, legacy folders folded into `features/`.

Each phase ships on its own and is checked in mock mode
(`bun run dev:mock`).
