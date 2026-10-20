# Security hardening

## Summary

Fixes from the whole-app review, ordered by severity.

- **Setup callback** (`/api/setup/github/callback`): it took any manifest
  `code` and installed the resulting GitHub App, without sign-in, so anyone
  could swap the deployment onto an App they control. It now needs a signed
  `state` that `POST /api/setup/github` adds to the manifest URL, and once
  setup is done it needs an owner's session, like the start of the flow.
- **Installation token on disk**: clone URLs carried
  `x-access-token:<token>@`, which git saved in `.git/config`, where the
  file viewer could serve it. The agent now sends the token separately. The
  sandbox passes it to git per command through `GIT_CONFIG_*` environment
  variables, so it never reaches config or argv, and it rewrites the remote
  of existing clones to drop old tokens. git errors are redacted.
- **File reads**: `.git/` and `.claude/` paths are refused, and symlinks are
  followed only while they stay inside the checkout, so a PR can't link to
  `/proc/self/environ` or another checkout.
- **Review agent**: reviews now get Read, Glob, and Grep only (chat asks for
  Bash explicitly). The SDK no longer loads the reviewed repo's CLAUDE.md,
  settings, or hooks (`settingSources: []`), and a PreToolUse hook denies
  file tools pointed outside the checkout.
- **XSS**: inline code and suggestions rendered raw PR lines as HTML until
  Shiki loaded, and forever if it failed. One shared `useHighlightedLines`
  now renders tokens as React text in both.
- **Token audiences**: the OAuth `state` was signed with the session key and
  passed the session check. Sessions and each `state` now carry an audience;
  sessions also need a numeric `userId`. Existing sessions keep working.
  Signing moved to `github/tokens.ts`.
- **Sandbox**: paths must be exactly `owner/repo/pr` under the repos root
  (the old prefix check accepted the root itself and `/data/repos-x`);
  clone URLs must be https and come after `--`; an optional `SANDBOX_TOKEN`
  shared with the agent is required on every request when set; dev binds to
  127.0.0.1.
- **Clone lock**: three requests for one checkout could run together; the
  lock is now a queue, and the self-heal re-clone runs inside it.
- Reviews and chat share `ensurePrCheckout`; chat now fetches the base
  branch too.

## Not done here

- `SANDBOX_TOKEN` isn't set in `astropods.yml`, since a secret input needs
  `ast project configure` before every deploy. Until it's wired up, the
  sandbox relies on platform network isolation.
- Chat still has Bash with permission checks off (known backlog).

## Testing

- `bun test`: 189 pass, including `sandbox/paths.test.ts` and
  `agent/oauth-tokens.test.ts`.
- Ran the sandbox locally against octocat/Hello-World: unauthenticated
  requests refused, `.git/config` holds no credentials, `.git/config`,
  symlink, and `..` reads refused, `/cleanup` of the root and `file://`
  clone URLs refused.
- Not exercised end to end: the PreToolUse hook inside a real query, and
  the manifest flow against GitHub.
