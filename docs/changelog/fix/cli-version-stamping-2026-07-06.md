# CLI update notices weren't firing

## Summary

The CLI's lazy update check was silently doing nothing on real deploys.
Users would never see the "cruise-line X.Y.Z is available — run
`cruise-line upgrade` to update" notice they were supposed to get after
a new version shipped.

## Design

Root cause: the Dockerfile stamped every deployed binary with the
literal string `dev` (its `ARG BUILD_VERSION` default, unset by
astropods), and the server's `/api/cli/latest` returned the same `dev`
by reading a Dockerfile-baked `VERSION` file. Both ends of the version
comparison were always the same string — the update check couldn't
detect a new release.

The fix rebuilds the version-identity path on top of a signal astropods
already provides: `ASTRO_AGENT_BUILD` — the runtime env var Astropods
injects, documented for use as OpenTelemetry `service.version`. It
changes exactly when a new deploy actually ships and stays stable across
identical rebuilds.

### Server: return `ASTRO_AGENT_BUILD`, drop the VERSION file

`/api/cli/latest` now returns `process.env.ASTRO_AGENT_BUILD ?? 'dev'`.
The old `dist/cli/VERSION` file is gone from both the Dockerfile and the
server code. The Dockerfile's `cli-builder` stage no longer takes a
`BUILD_VERSION` build-arg or bakes anything via `-ldflags` — the CLI
binary carries no version stamp at all.

### CLI: track "what I installed" in local config

Since the binary has no baked version, the CLI reads its identity from
`config.installed_version` at `~/.config/cruise-line/config.json`:

- `cruise-line upgrade` writes the server's current version to
  `installed_version` after the atomic rename succeeds. That's the
  primary path — every subsequent update check compares against it.
- Fresh installs (curl|sh) don't touch the config. The first successful
  update check adopts the server's current version as the installed
  version (bootstrap) — a reasonable assumption for a curl|sh flow
  that pulled straight from the same server.
- `cruise-line version` prints `config.installed_version` when set,
  otherwise the literal `dev` — the fallback that also covers local
  `go build .` binaries.
- `notifyIfOutdated` compares `cfg.InstalledVersion` against a fresh
  `/api/cli/latest`. Different strings → nag. Stays silent when either
  side is missing (fresh install pre-bootstrap, offline, config
  unreadable) rather than nagging on incomplete info.
- `CRUISE_LINE_NO_UPDATE_CHECK=1` still suppresses all nagging as an
  escape hatch for developers hacking on the CLI.

### Why this is deterministic

- `ASTRO_AGENT_BUILD` is a build hash astropods sets at deploy time,
  not a timestamp. A no-op rebuild of the same source produces the same
  value, so users don't get spuriously nagged after infra-triggered
  redeploys.
- The binary itself is version-free. No Docker-build-time value can
  drift out of sync with the server's runtime signal — there's just one
  authoritative source (the server), and the CLI's config remembers what
  it saw at install/upgrade.

## Migration

Users on the currently-broken deployment (`version == "dev"` on both
sides) will get one nag from this fix the first time they run a command
after the new deploy lands: the server will start returning
`ASTRO_AGENT_BUILD`, their config's `installed_version` will still be
unset, and the update check will bootstrap it — silently on that first
call. From the second call onwards, if the server has moved past that
snapshot, the nag fires. One `cruise-line upgrade` later, they're on
current and the loop works as designed for every future deploy.

No repo-side action needed. Astropods sets `ASTRO_AGENT_BUILD` on its
own; there's nothing to configure in `astropods.yml`.
