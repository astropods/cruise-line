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
     * Astropods provider injects: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
     * Custom container injects: KNOWLEDGE_{NAME}_HOST, KNOWLEDGE_{NAME}_PORT
     * Falls back to Docker service name 'knowledge-cruise-db' for local dev.
     */
    host: optionalEnv('POSTGRES_HOST',
      optionalEnv('KNOWLEDGE_CRUISE_DB_HOST', 'knowledge-cruise-db')),
    port: Number(optionalEnv('POSTGRES_PORT',
      optionalEnv('KNOWLEDGE_CRUISE_DB_PORT', '5432'))),
    database: optionalEnv('POSTGRES_DB', 'cruise_line'),
    user: optionalEnv('POSTGRES_USER', 'postgres'),
    password: process.env.POSTGRES_PASSWORD ?? '',
    get url(): string {
      if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
      const userInfo = config.db.password
        ? `${config.db.user}:${config.db.password}`
        : config.db.user;
      return `postgres://${userInfo}@${config.db.host}:${config.db.port}/${config.db.database}`;
    },
  },

  claude: {
    model: optionalEnv('CLAUDE_MODEL', 'claude-opus-4-8'),
    maxConcurrentJobs: Number(optionalEnv('MAX_CONCURRENT_JOBS', '3')),
  },

  sandbox: {
    host: optionalEnv('KNOWLEDGE_CHAT_SANDBOX_HOST', 'localhost'),
    port: Number(optionalEnv('KNOWLEDGE_CHAT_SANDBOX_PORT', '3000')),
    get url(): string {
      return `http://${config.sandbox.host}:${config.sandbox.port}`;
    },
  },

  session: {
    /** Auto-generated on first run and stored in DB. No env var needed. */
    secret: '',
    cookieName: 'cruise_session',
  },

  /**
   * Public-facing URL. On Astro the platform injects ASTRO_EXTERNAL_AGENT_URL,
   * which always reflects the current deployment URL and takes precedence over
   * APP_URL and any value cached in the DB during setup (see index.ts).
   */
  appUrl: optionalEnv('ASTRO_EXTERNAL_AGENT_URL', optionalEnv('APP_URL', 'http://localhost:80')),
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
