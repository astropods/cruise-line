# Deployed CLI distribution & self-upgrade

## Summary

The `cruise-line` CLI previously had no distribution story — users (and coding
agents) had to clone the repo and build it themselves. This change bundles
the CLI with the deployed agent image and gives it a one-liner installer, an
`upgrade` command, and a passive update check.

The design pin: **the CLI a deployment serves is the CLI a deployment expects
to talk to**. There's no separate CLI release train, no version drift between
client and server, no need to publish anywhere external.

## Design

### The CLI ships inside the agent image

A new `cli-builder` stage in the Dockerfile cross-compiles Go binaries for
the platforms we support (currently `darwin-arm64` and `darwin-amd64`) and
copies them plus SHA-256 sidecars into the runtime image at `/app/dist/cli/`.
CGO is off so cross-compile has no toolchain complications.

The current version is baked into every binary through the linker:

```
GOOS=$os GOARCH=$arch CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w -X main.version=${BUILD_VERSION}" ...
```

The `BUILD_VERSION` docker build arg propagates from the astropods deploy
pipeline. `cruise-line version` reports exactly what the running server ships,
which is what the update check compares against — the server's version and
the CLI's version are guaranteed to line up because they came out of the same
image build.

A `VERSION` file next to the binaries records the same string so the server
can echo it back without shelling out to the binary.

### Public distribution endpoints

Three unauthenticated routes on the agent:

- `GET /install.sh` — templated shell installer, described below.
- `GET /download/cruise-line-<os>-<arch>[.sha256]` — streams the binary or
  its checksum sidecar.
- `GET /api/cli/latest` — JSON `{ version, downloadUrls: { "<os>-<arch>": ... } }`
  that both `cruise-line upgrade` and the lazy check hit.

Public by necessity: someone installing the CLI has no credentials yet.

### One-liner installer

The classic pattern:

```
curl -fsSL https://cruise-line.example.com/install.sh | sh
```

Works because `/install.sh` templates the requesting deployment's host into
the script at render time. The script then downloads binaries from the same
host. There's no "which deployment do I install from?" step for the user.

The install script:

- Detects OS + arch, refuses non-supported combinations with a clear message
  rather than silently downloading a broken binary.
- Prefers `/usr/local/bin` if writable, falls back to `~/.local/bin`. Neither
  requires `sudo` and neither surprises the user by writing somewhere odd.
- Verifies the download against `curl'd` sidecar SHA-256 before it lands on
  disk. Missing `shasum` on the client is a warning, not a fatal — some
  minimal containers omit it.
- Warns if the chosen directory isn't in `PATH` and prints the export line
  the user needs.

### Self-upgrade

`cruise-line upgrade` performs the same download+verify dance the installer
does, but from inside the running binary:

1. Read host from config, fetch `/api/cli/latest`.
2. If server version matches local version, no-op (with `--force` to override).
3. Fetch the SHA-256 sidecar first — a bad sidecar aborts before any bytes
   are streamed. Then download the binary, streaming through a running
   `sha256.Sum256` so verification happens in the same pass as the write.
4. Atomic `os.Rename` over the current executable path. This works while the
   binary is executing because Unix file handles reference the inode, not
   the path. Symlinks are resolved so we replace the real file, not e.g. a
   Homebrew symlink.

Failure cases (mismatch checksum, non-writable destination, download error)
never leave a partial binary behind — every intermediate file lives in
`os.TempDir()` and is unlinked on failure.

### Lazy update check

Every command except `version`, `help`, `upgrade`, and `login` starts by
loading the config and calling `maybeCheckForUpdate`. If the last check was
more than 24h ago (or no cache exists), it hits `/api/cli/latest` with an
800ms timeout. The result — success or failure — is cached in
`config.update_check`.

If the fetched version differs from the running version, a one-line notice
is printed to `stderr` **after** the command completes:

```
(cruise-line 0.2.1 is available; you're on 0.2.0. Run `cruise-line upgrade` to update.)
```

Print-after-command matters: users (and coding agents) commonly pipe
`cruise-line pr walkthrough` output into `jq` or a file, and interleaving an
upgrade nag with structured JSON would break that. Stderr keeps it out of
those pipes too.

Two deliberate silences:

- **Dev builds** (`version == "dev"`) never nag. A locally-built binary has
  no upstream to be older than.
- **Offline / server-down** returns `nil` from the check, and
  `notifyIfOutdated(nil)` is a no-op. The user sees zero difference.

### Coding-agent shape

The intended flow:

```
curl -fsSL https://cl.example.com/install.sh | sh
cruise-line login https://cl.example.com
cruise-line pr status owner/repo#N --wait
cruise-line pr walkthrough owner/repo#N | jq ...
```

Days or weeks later, the agent runs another command, sees a new version on
the deploy it's talking to, and prints the notice. The agent (or user)
runs `cruise-line upgrade` and is back in sync — no external release
channel involved.

## Migration

Nothing required for existing users. The CLI still builds locally via
`go build ./...`; the new distribution channel is additive. Fresh
installers should point at their deployment's host, e.g.
`curl -fsSL https://cruise-line.your-org.dev/install.sh | sh`.

Deployments will start serving `/install.sh`, `/download/*`, and
`/api/cli/latest` automatically once this branch is deployed — no config
changes needed.
