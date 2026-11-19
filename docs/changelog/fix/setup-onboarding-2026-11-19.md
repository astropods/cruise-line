# First-time setup: Connect to GitHub and the default page

## Summary

Two bugs on a fresh production install.

- **Connect to GitHub was blocked**: the setup form POSTs the App manifest
  to `github.com/settings/apps/new`, and the CSP's `form-action 'self'`
  blocked it. `form-action` now allows `https:` until the GitHub App is
  configured, then goes back to `'self'`. Allowing only the GitHub host
  isn't enough: the policy is set when the page loads, and an Enterprise
  user enters their host on the form afterwards. Before setup there are no
  reviews or chats, so there's no model-written content that could inject
  a form.
- **The CLI page showed instead of setup**: nobody can sign in before
  setup, so every visitor is signed out, and the router showed signed-out
  visitors at `/` the CLI home page before checking setup status. The setup
  check now runs first, so an unconfigured install sends `/` to the setup
  form. `/cli` still shows the CLI instructions.

## Testing

- `bun test` (219 pass), `tsc --noEmit`, frontend build.
- `csp.test.ts` covers `form-action` before and after setup. It now mocks
  config itself, and the other partial config mocks gained an
  `isGitHubConfigured` stub, since module mocks are shared across the run.
- Not yet tried against GitHub in a browser: dev mode doesn't send the CSP.
