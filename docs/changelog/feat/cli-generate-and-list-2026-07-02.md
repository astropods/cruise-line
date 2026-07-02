# CLI can trigger analysis, list repositories, and view review rules

## Summary

The Cruise Line CLI shipped as strictly read-only, which meant a coding
agent's loop still had a hole in it: the agent could poll for a walkthrough
and fetch the JSON, but it couldn't ask the server to *produce* one after
pushing a commit. Users worked around this by opening the PR in a browser
and clicking Generate.

This change closes the loop. CLI tokens can now trigger analysis on a PR,
and two adjacent capabilities land alongside it — discovering which
repositories the deployment knows about and reading a repo's configured
review rules.

## Design

### Loosening the read-only contract, but only where the loop needs it

The `POST /generate` endpoint no longer requires a cookie session. Every
other write path — comment posting, walkthrough deletion, rule edits, chat,
settings — stays behind `requireCookieSession`. The mental model is: **the
CLI can start work, but never destroy it**. Delete stays cookie-only for
the same reason `DELETE /users/:id/role` does — a leaked token shouldn't be
able to remove records.

The existing `generateLimiter` (5/min/user) still fronts the endpoint, so
the change doesn't widen the abuse surface.

### New endpoints and commands

- `GET /api/cli/repos` is scoped per-caller via
  `listInstallationsWithReposForUser(username)`, which runs each repo
  through a collaborator-permission check via the installation token and
  drops installations that end up empty. Any authenticated user can call
  it, but they only see repositories they actually have write access to
  — a collaborator on one repo in org A never sees the names of unrelated
  private repos in org B just because both orgs installed the App.
- `pr review <owner/repo#N>` POSTs to `/generate` and prints the server's
  `{walkthroughId, status}` response. Chains directly into `pr status --wait`
  for a "kick and block" flow. No `--force` flag: `force=true` wipes the
  existing walkthrough, which the server rejects from CLI tokens because
  CLI tokens can start work but never destroy it.
- `repos` lists connected installations.
- `rules <owner/repo>` reads from the existing `GET /api/rules/:owner/:repo`
  (which was already open to bearer callers — the write methods on that
  router stay guarded).

### Consent screen honesty

The `/cli/authorize` bullet list was written when tokens couldn't do any
writes at all. It's been rewritten to enumerate what the token *can* do
(read walkthroughs and rules, check status, list repos, trigger analysis)
and what it still *can't* (post comments, delete, edit rules, chat, change
settings). Users see accurate scope at approve time.

### Coding-agent flow, end to end

```
cruise-line pr review astropods/cruise-line#42
cruise-line pr status astropods/cruise-line#42 --wait --timeout=10m
cruise-line pr walkthrough astropods/cruise-line#42 | jq .
```

The three commands compose. The first kicks off analysis, the second blocks
until it's done, the third streams the JSON. No browser round-trip anywhere.

## Migration

No migration required. Existing CLI tokens continue to work with the
broader capability set — the change is server-side, so a re-issue isn't
needed. The consent screen for *new* logins reflects the updated scope;
tokens issued before this change grant the same capabilities without any
extra approval step.
