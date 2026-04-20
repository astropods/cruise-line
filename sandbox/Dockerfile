# Minimal sandbox container — no app code, no database drivers, no GitHub SDK
FROM oven/bun:1-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /sandbox

COPY sandbox/package.json sandbox/bun.lockb* ./
RUN bun install --production

COPY sandbox/index.ts ./

# Shared data volume (repos + sessions)
RUN mkdir -p /data/repos /data/sessions

USER bun
EXPOSE 3000

CMD ["bun", "run", "index.ts"]
