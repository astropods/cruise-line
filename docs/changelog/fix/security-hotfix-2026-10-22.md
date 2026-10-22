# Security hotfix: review path escape, git tampering, image beacons

## Summary

From the second security pass. None of these change what reviews or chat
can do.

- **Review path escape (critical)**: the PreToolUse hook checked Grep and
  Glob paths as written, but the SDK trims them and expands `~` before use,
  so `" /data/repos"` or `"~/.claude/projects"` passed the check and read
  every org's checkouts and transcripts. Paths the SDK would rewrite
  (surrounding whitespace, a leading `~`, NUL) are now refused, for
  patterns too.
- **Git tampering**: chat's Bash can write into any checkout's `.git`, so a
  planted hook or `url.insteadOf` could hand the next fetch's token to an
  attacker. Every git command now runs with hooks and fsmonitor off, only
  https allowed, and no global or system config (`gitEnv`). The auth header
  is scoped to the remote's origin, and `.git/config` is rewritten to just
  the remote before each fetch. The working-tree reset also clears ignored
  files (`git clean -ffdx`, keeping `.claude`).
- **Image beacons**: model-written markdown could include an image whose
  URL carries data out the moment a page renders it.
  - The CSP now allows images only from the app, `avatars.githubusercontent.com`,
    and the GitHub host (plus its `avatars.` subdomain for Enterprise). It's
    built per request in `middleware/csp.ts`, so a host set at setup applies.
  - `Md` renders images as links, and Mermaid output drops `<image>` elements.
- **PR comment**: the verdict rationale posted to GitHub drops markdown
  images and elements that load a URL, and redacts anything shaped like an
  Anthropic key, GitHub token, CLI token, or private key.
- **Fonts**: the old CSP blocked Google Fonts, so production fell back to
  system fonts. The new one allows them; IBM Plex will start loading.

## Deferred

Scoped read-only clone tokens, no transcripts for reviews, owner-only debug
routes, telemetry output hiding, a required `SANDBOX_TOKEN`, a setup code,
session cookie hardening, repo name casing, and isolating chat's Bash (the
platform sandbox).

## Testing

- `bun test`: 217 pass, including new cases in `sandbox/paths.test.ts`,
  `agent/pr-comment.test.ts`, `agent/csp.test.ts`, and `ui/Md.test.tsx`.
- Ran the sandbox locally against octocat/Hello-World: a planted
  `post-checkout` hook didn't run on the next checkout, a planted
  `insteadOf` was removed, and the fetch still reached GitHub.
- The CSP applies in production only; check avatars and fonts on a dev
  deploy.
