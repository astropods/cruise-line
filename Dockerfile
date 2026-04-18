# Stage 1: Install backend dependencies
FROM oven/bun:1 AS backend-deps

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production

# Stage 2: Build frontend
FROM oven/bun:1 AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/bun.lockb* ./
RUN bun install
COPY frontend/ .
RUN bun run build

# Stage 3: Runtime
FROM oven/bun:1-slim

# Git is required for cloning repos during analysis
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend
COPY --from=backend-deps /app/node_modules ./node_modules
COPY agent/ ./agent/
COPY package.json ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Non-root user
RUN chown -R bun:bun /app
USER bun

EXPOSE 80

CMD ["bun", "run", "agent/index.ts"]
