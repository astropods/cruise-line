/**
 * Shared metadata about the CLI distribution — the platforms we ship for and
 * the version baked into this image. Kept in one module so both the download
 * routes and the /api/cli/latest handler agree on the target list.
 */
import { readFile } from 'fs/promises';
import { join } from 'path';

// Keep in sync with the cli-builder stage of the Dockerfile. Requesting a
// target outside this set from /download/* returns 404.
export const SUPPORTED_TARGETS = ['darwin-arm64', 'darwin-amd64'] as const;
export type SupportedTarget = (typeof SUPPORTED_TARGETS)[number];

const VERSION_FILE = join(process.cwd(), 'dist', 'cli', 'VERSION');

// Cached because it's file I/O that will never change during a single deploy.
let cachedVersion: string | null = null;

/**
 * Version baked into the CLI binaries by the docker build. Reads the VERSION
 * sidecar the cli-builder stage writes. Falls back to "dev" so `bun run dev`
 * (which doesn't produce a dist/cli directory) returns something sane.
 */
export async function readCliVersion(): Promise<string> {
  if (cachedVersion !== null) return cachedVersion;
  try {
    cachedVersion = (await readFile(VERSION_FILE, 'utf-8')).trim();
  } catch {
    cachedVersion = 'dev';
  }
  return cachedVersion;
}
