import { sql } from './client.js';

export interface GitHubAppConfig {
  appId: string;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
}

const CONFIG_PREFIX = 'github_app.';

export async function saveGitHubAppConfig(config: GitHubAppConfig): Promise<void> {
  const entries = Object.entries(config) as [keyof GitHubAppConfig, string][];

  await sql.begin(async (tx) => {
    for (const [key, value] of entries) {
      await tx`
        INSERT INTO app_config (key, value)
        VALUES (${CONFIG_PREFIX + key}, ${value})
        ON CONFLICT (key)
        DO UPDATE SET value = ${value}, updated_at = NOW()
      `;
    }
  });
}

export async function getGitHubAppConfig(): Promise<GitHubAppConfig | null> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM app_config WHERE key LIKE ${CONFIG_PREFIX + '%'}
  `;

  if (rows.length === 0) return null;

  const map = new Map(rows.map((r) => [r.key.replace(CONFIG_PREFIX, ''), r.value]));

  const appId = map.get('appId');
  const privateKey = map.get('privateKey');
  const clientId = map.get('clientId');
  const clientSecret = map.get('clientSecret');
  const webhookSecret = map.get('webhookSecret');

  if (!appId || !privateKey || !clientId || !clientSecret || !webhookSecret) {
    return null;
  }

  return {
    appId,
    appSlug: map.get('appSlug') ?? '',
    privateKey,
    webhookSecret,
    clientId,
    clientSecret,
  };
}

export async function deleteGitHubAppConfig(): Promise<void> {
  await sql`DELETE FROM app_config WHERE key LIKE ${CONFIG_PREFIX + '%'}`;
  // Also clear the GitHub URL settings so the next setup starts fresh
  await sql`DELETE FROM app_config WHERE key IN ('github_base_url', 'github_html_url')`;
}

export async function isGitHubAppConfigured(): Promise<boolean> {
  const config = await getGitHubAppConfig();
  return config !== null;
}

/**
 * Get or create a persistent session secret.
 * Auto-generated on first run and stored in DB so it survives restarts.
 */
export async function getOrCreateSessionSecret(): Promise<string> {
  const [existing] = await sql<{ value: string }[]>`
    SELECT value FROM app_config WHERE key = 'session_secret'
  `;

  if (existing) return existing.value;

  // Generate a random 64-char hex string
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await sql`
    INSERT INTO app_config (key, value)
    VALUES ('session_secret', ${secret})
    ON CONFLICT (key) DO NOTHING
  `;

  return secret;
}

/**
 * Get or store the app URL. Can be set by the user during setup
 * or auto-detected from the first request.
 */
export async function getAppUrl(): Promise<string | null> {
  const [row] = await sql<{ value: string }[]>`
    SELECT value FROM app_config WHERE key = 'app_url'
  `;
  return row?.value ?? null;
}

export async function saveAppUrl(url: string): Promise<void> {
  await sql`
    INSERT INTO app_config (key, value)
    VALUES ('app_url', ${url})
    ON CONFLICT (key)
    DO UPDATE SET value = ${url}, updated_at = NOW()
  `;
}

/**
 * Save GitHub URL settings (for GHE support).
 */
export async function saveGitHubUrls(baseUrl: string, htmlUrl: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO app_config (key, value) VALUES ('github_base_url', ${baseUrl})
      ON CONFLICT (key) DO UPDATE SET value = ${baseUrl}, updated_at = NOW()
    `;
    await tx`
      INSERT INTO app_config (key, value) VALUES ('github_html_url', ${htmlUrl})
      ON CONFLICT (key) DO UPDATE SET value = ${htmlUrl}, updated_at = NOW()
    `;
  });
}

export async function getGitHubUrls(): Promise<{ baseUrl: string; htmlUrl: string } | null> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM app_config WHERE key IN ('github_base_url', 'github_html_url')
  `;
  if (rows.length < 2) return null;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    baseUrl: map.get('github_base_url')!,
    htmlUrl: map.get('github_html_url')!,
  };
}
