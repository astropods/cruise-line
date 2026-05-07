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

# Stage 3: Runtime
FROM --platform=linux/amd64 oven/bun:1-slim

# Git is required for cloning repos during analysis
# curl is needed to install Claude Code
# musl is needed for the Claude Code native binary
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl musl \
    && ln -sf /usr/lib/x86_64-linux-musl/libc.so /lib/ld-musl-x86_64.so.1 \
    && rm -rf /var/lib/apt/lists/*

# Persistent data directory for clones and session data
RUN mkdir -p /data/repos /data/sessions

WORKDIR /app

# Copy backend
COPY --from=backend-deps /app/node_modules ./node_modules
COPY agent/ ./agent/
COPY package.json ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Install Claude Code native binary — must run AFTER node_modules are copied
# so the binary lands in the correct SDK package directories.
# Then copy to nested node_modules path where the SDK also looks.
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    for dir in /app/node_modules/@anthropic-ai/claude-agent-sdk-linux-*/; do \
      nested="/app/node_modules/@anthropic-ai/claude-agent-sdk/node_modules/@anthropic-ai/$(basename "$dir")"; \
      if [ ! -f "$nested/claude" ]; then \
        mkdir -p "$nested" && cp "$dir/claude" "$nested/claude" && chmod +x "$nested/claude"; \
      fi; \
    done

# Non-root user
RUN chown -R bun:bun /app /data
USER bun

EXPOSE 80

CMD ["bun", "run", "agent/index.ts"]
