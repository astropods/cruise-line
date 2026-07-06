# CLI update notices weren't firing

## Summary

The CLI's lazy update check was silently doing nothing on real deploys.
Users would never see the "cruise-line X.Y.Z is available — run
`cruise-line upgrade` to update" notice they were supposed to get after
a new version shipped.

## Design

Two independent bugs, each individually incorrect, combined to silence
the notice entirely.

### The Dockerfile stamped every deploy with the literal string "dev"

The `cli-builder` stage had `ARG BUILD_VERSION=dev` — a placeholder for
the astropods pipeline to fill in. The pipeline doesn't currently pass
anything, so every deploy shipped binaries stamped `main.version="dev"`
and wrote `dev` into the `VERSION` file the server reads from.

Result: `/api/cli/latest` returned `{version: "dev"}` from every deploy,
and every downloaded CLI also reported `dev`. Two ends of the same
string comparison — always matched, always silent.

The fix: fall back to a UTC timestamp inside the `RUN` step when the
build arg is missing. Astropods can start passing a git SHA whenever
it's convenient; until then, every deploy ships a distinct version
string like `20260706T210702Z` and the update check has something real
to compare.

```
ARG BUILD_VERSION=
...
RUN VERSION="${BUILD_VERSION:-$(date -u +%Y%m%dT%H%M%SZ)}" && \
    go build ... -X main.version=${VERSION} ... && \
    echo "${VERSION}" > /out/VERSION
```

Both the `-ldflags` value and the on-disk `VERSION` file now use the
same resolved string.

### The CLI silenced "dev builds" unconditionally

`notifyIfOutdated` had a defensive rule: if `version == "dev"`, don't
nag. The intent was "someone who ran `go build .` locally doesn't want
their scratch binary complaining about updates." Correct in isolation
— but the pre-fix Dockerfile also stamped deployed binaries `dev`, so
the rule silenced the exact population that most needed to hear about
the upgrade.

The rule is now scoped to the case that motivated it. Silence only
when *both* the local binary and the server report `dev`; when the
local is `dev` and the server has a real version, nag once. That's the
one-time nudge existing `dev`-stamped installs need to pull a
properly-stamped binary. After the upgrade both sides are on real
versions and the normal exact-string comparison takes over.

## Migration

Users with existing installs will get one "cruise-line ... is available"
notice the next time they run any CLI command after this ships. They
run `cruise-line upgrade` once; from then on their binary reports a
real timestamp and the update check works as designed for every future
deploy.

No action needed from repo maintainers. Astropods can start passing a
`BUILD_VERSION` build-arg to Docker when it's convenient — the fallback
just goes away in favor of the passed value.
