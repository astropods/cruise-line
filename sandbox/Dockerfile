# Minimal sandbox container — no app code, no database drivers, no GitHub SDK
FROM oven/bun:1-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl musl \
    && ln -sf /usr/lib/x86_64-linux-musl/libc.so /lib/ld-musl-x86_64.so.1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /sandbox

COPY sandbox/package.json sandbox/bun.lockb* ./
RUN bun install --production

COPY sandbox/index.ts sandbox/telemetry.ts ./

# Install Claude Code native binary — must run AFTER node_modules are copied
# so the binary lands in the correct SDK package directories.
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    for dir in /sandbox/node_modules/@anthropic-ai/claude-agent-sdk-linux-*/; do \
      nested="/sandbox/node_modules/@anthropic-ai/claude-agent-sdk/node_modules/@anthropic-ai/$(basename "$dir")"; \
      if [ ! -f "$nested/claude" ]; then \
        mkdir -p "$nested" && cp "$dir/claude" "$nested/claude" && chmod +x "$nested/claude"; \
      fi; \
    done

# Persistent data volume (repos + sessions)
RUN mkdir -p /data/repos /data/sessions && chown -R bun:bun /data

USER bun
EXPOSE 3000

CMD ["bun", "run", "index.ts"]
