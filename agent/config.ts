function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: Number(optionalEnv('PORT', '80')),

  /** GitHub credentials — populated via setup flow (stored in DB) */
  github: {
    appId: '',
    privateKey: '',
    webhookSecret: '',
    clientId: '',
    clientSecret: '',
    /** GitHub API base URL — change for GHE (e.g., https://github.example.com/api/v3) */
    baseUrl: optionalEnv('GITHUB_BASE_URL', 'https://api.github.com'),
    /** GitHub web URL — change for GHE (e.g., https://github.example.com) */
    htmlUrl: optionalEnv('GITHUB_HTML_URL', 'https://github.com'),
  },

  db: {
    /**
     * Astropods injects different env vars depending on provider vs custom container:
     *   Built-in provider: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB
     *   Custom container:  KNOWLEDGE_{NAME}_HOST, KNOWLEDGE_{NAME}_PORT
     * Falls back to Docker service name 'knowledge-cruise-db' if neither is set.
     */
    host: optionalEnv('POSTGRES_HOST',
      optionalEnv('KNOWLEDGE_CRUISE_DB_HOST', 'knowledge-cruise-db')),
    port: Number(optionalEnv('POSTGRES_PORT',
      optionalEnv('KNOWLEDGE_CRUISE_DB_PORT', '5432'))),
    database: optionalEnv('POSTGRES_DB', 'cruise_line'),
    get url(): string {
      return process.env.DATABASE_URL ??
        `postgres://postgres@${config.db.host}:${config.db.port}/${config.db.database}`;
    },
  },

  claude: {
    model: optionalEnv('CLAUDE_MODEL', 'claude-sonnet-4-5'),
    maxConcurrentJobs: Number(optionalEnv('MAX_CONCURRENT_JOBS', '3')),
  },

  session: {
    /** Auto-generated on first run and stored in DB. No env var needed. */
    secret: '',
    cookieName: 'cruise_session',
  },

  /** Public-facing URL — auto-detected or set via APP_URL */
  appUrl: optionalEnv('APP_URL', 'http://localhost:80'),
};

/**
 * Update GitHub config at runtime (after setup flow populates DB).
 */
export function updateGitHubConfig(updates: {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
}): void {
  config.github.appId = updates.appId;
  config.github.privateKey = updates.privateKey;
  config.github.webhookSecret = updates.webhookSecret;
  config.github.clientId = updates.clientId;
  config.github.clientSecret = updates.clientSecret;
}

/**
 * Check whether GitHub is configured (either via env vars or setup flow).
 */
export function isGitHubConfigured(): boolean {
  return !!(
    config.github.appId &&
    config.github.privateKey &&
    config.github.webhookSecret &&
    config.github.clientId &&
    config.github.clientSecret
  );
}
