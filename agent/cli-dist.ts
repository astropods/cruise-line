/**
 * Shared metadata about the CLI distribution — the platforms we ship for
 * and the deploy's build identifier. Both the download routes and the
 * /api/cli/latest handler read from here so they agree on the target list.
 */

// Keep in sync with the cli-builder stage of the Dockerfile. Requesting a
// target outside this set from /download/* returns 404.
export const SUPPORTED_TARGETS = ['darwin-arm64', 'darwin-amd64'] as const;
export type SupportedTarget = (typeof SUPPORTED_TARGETS)[number];

/**
 * Version identifier for the currently-deployed image. Sourced from
 * `ASTRO_AGENT_BUILD` — Astropods sets this at runtime to a stable build
 * hash (the same one OpenTelemetry uses for service.version), so it
 * changes exactly when a new build is actually deployed. Falls back to
 * "dev" for local `bun run dev`, where the env var isn't set.
 *
 * We used to write a VERSION file at Docker build time and read it back
 * here, but that value drifted with cache-invalidating rebuilds even
 * when the source hadn't changed. `ASTRO_AGENT_BUILD` is deterministic
 * across identical builds and free of that failure mode.
 */
export function readCliVersion(): string {
  return process.env.ASTRO_AGENT_BUILD ?? 'dev';
}
