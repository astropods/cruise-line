/**
 * Development server script.
 *
 * Runs the backend on the host (not in Docker) with hot reload via `bun --watch`.
 * Expects `ast dev` to be running for infrastructure (Postgres).
 *
 * Usage:
 *   Terminal 1: ast dev           (starts Postgres)
 *   Terminal 2: bun run dev       (starts backend on port 3002 with auto-reload)
 *   Terminal 3: bun run dev:sandbox  (starts sandbox on port 3000)
 *   Terminal 4: cd frontend && bun run dev  (starts Vite on port 5173 with HMR)
 *
 * Open http://localhost:5173 in browser.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Load Astropods project config for API keys
try {
  const configPath = join(homedir(), '.ast', 'project-configs.json');
  const allConfigs = JSON.parse(readFileSync(configPath, 'utf-8'));
  const projectConfig = allConfigs['cruise-line'];
  if (projectConfig?.variables) {
    for (const [key, value] of Object.entries(projectConfig.variables)) {
      if (typeof value === 'string' && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
} catch {
  // No ast config found, that's fine
}

// Point at local Postgres from `ast dev`
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_PORT ??= '5432';
process.env.POSTGRES_DB ??= 'cruise_line';

// Dev server port (different from production port 80)
process.env.PORT ??= '3002';

// Default app URL for dev
process.env.APP_URL ??= 'http://localhost:5173';

// Sandbox runs locally in dev
process.env.KNOWLEDGE_CHAT_SANDBOX_HOST ??= 'localhost';
process.env.KNOWLEDGE_CHAT_SANDBOX_PORT ??= '3001';

// Now import and start the server
await import('../agent/index.js');
