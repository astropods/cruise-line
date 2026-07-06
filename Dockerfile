# Stage 1: Install backend dependencies
FROM --platform=linux/amd64 oven/bun:1 AS backend-deps

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production

# Stage 2: Build frontend
FROM --platform=linux/amd64 oven/bun:1 AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/bun.lockb* ./
RUN bun install
COPY frontend/ .
RUN bun run build

# Stage 3: Cross-compile the CLI for the platforms we distribute.
# Only pure-stdlib Go, so cross-compile has no CGO complications. Binaries
# are what `curl <host>/install.sh | sh` downloads; the server serves them
# straight off the runtime image's disk.
FROM --platform=linux/amd64 golang:1.25-alpine AS cli-builder

# BUILD_VERSION is baked into the binary via -ldflags so `cruise-line version`
# reports something meaningful. The astropods build system can pass a git
# SHA here. When empty, the RUN step below falls back to a UTC timestamp
# so every deploy still ships a distinct version string — otherwise the
# server would return the same value forever and the CLI's update check
# would never notice new releases.
ARG BUILD_VERSION=

WORKDIR /src

COPY cli/go.mod cli/go.sum* ./
RUN go mod download || true

COPY cli/ ./

# Produce a binary + sha256 checksum for each target. The .sha256 files are
# what `cruise-line upgrade` verifies against before atomic-renaming.
# Keep this list in sync with SUPPORTED_TARGETS in agent/cli-dist.ts — the
# server rejects downloads for anything not in that TS list, so a target
# built here but missing there is unreachable, and vice versa.
RUN mkdir -p /out && \
    VERSION="${BUILD_VERSION:-$(date -u +%Y%m%dT%H%M%SZ)}" && \
    echo "Building CLI at version: ${VERSION}" && \
    for target in "darwin/arm64" "darwin/amd64"; do \
      os=$(echo "$target" | cut -d/ -f1); \
      arch=$(echo "$target" | cut -d/ -f2); \
      out="/out/cruise-line-${os}-${arch}"; \
      GOOS=$os GOARCH=$arch CGO_ENABLED=0 \
        go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o "$out" . && \
      sha256sum "$out" | awk '{print $1}' > "${out}.sha256"; \
    done && \
    echo "${VERSION}" > /out/VERSION

# Stage 4: Runtime
FROM --platform=linux/amd64 oven/bun:1-slim

WORKDIR /app

# Copy backend
COPY --from=backend-deps /app/node_modules ./node_modules
COPY agent/ ./agent/
COPY package.json ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy the CLI binaries + sha256 sidecars + VERSION file. The download
# handlers stream directly from this directory.
COPY --from=cli-builder /out ./dist/cli

# Non-root user
RUN chown -R bun:bun /app
USER bun

EXPOSE 80

CMD ["bun", "run", "agent/index.ts"]
