# Logout button & sandbox chat session fixes

## Summary

Adds a logout button to the frontend and fixes three bugs in the sandbox
chat query handler that prevented follow-up messages from working and
left tool restrictions unenforced.

## Design

### Logout

A `logout()` helper in the API client POSTs to `/api/auth/logout` and
redirects to `/`. It is surfaced in two places:

- **AnalysisProgress page** -- small text link below the progress indicator.
- **WalkthroughPage header menu** -- entry at the bottom of the "..." dropdown,
  separated by a divider.

### Sandbox session resume detection

The sandbox determined whether to resume or create a new Claude Agent SDK
session by checking for a `projects/` directory under the `.claude` symlink
in the cloned repo. The SDK stores session data in `~/.claude/projects/`,
not `<cwd>/.claude/projects/`, so this check always returned false. Every
follow-up message attempted to create a new session with an already-used ID
instead of resuming, producing a consistent error.

The fix replaces the filesystem check with the SDK's own
`getSessionInfo(sessionId, { dir })`, which queries the correct storage
location.

### SDK option naming

The options object passed to the SDK's `query()` used `allowedTools` --
a field name the SDK silently ignores. The correct field is `tools`.
Without this fix, tool restrictions (limiting chat to Read/Glob/Grep/Bash)
were not enforced.

### Permission bypass safety flag

`permissionMode: 'bypassPermissions'` requires
`allowDangerouslySkipPermissions: true` as an explicit opt-in. The flag
was missing, which could cause the SDK to reject the bypass or fall back
to interactive prompts in the headless sandbox container.

## Migration

No migration required. The logout endpoint already existed; only the
frontend button and sandbox runtime behavior changed.
