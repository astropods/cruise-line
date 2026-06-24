import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { config, updateGitHubConfig, isGitHubConfigured } from '../config.js';
import {
  saveGitHubAppConfig,
  getGitHubAppConfig,
  deleteGitHubAppConfig,
  saveGitHubUrls,
  saveAppUrl,
} from '../db/app-config.js';
import { claimOwnerIfNone, countUsersByRole, touchUser } from '../db/users.js';
import { AppError } from '../middleware/error.js';
import { refreshWebhooks } from '../github/webhooks.js';
import { requireAuth, requireOwner } from '../middleware/session.js';
import { validateGitHubUrl, validateAppUrl } from '../middleware/validation.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { AppEnv } from '../env.js';

export const setupRoutes = new Hono<AppEnv>();

// 5 requests per minute per IP for setup operations
const setupLimiter = rateLimit<AppEnv>('setup', { windowMs: 60_000, max: 5 });

/**
 * Conditional auth for setup. Three states:
 *   - Not configured: allow through (OAuth isn't usable until the GitHub App
 *     credentials exist, so first-time setup is unauthenticated by necessity).
 *   - Configured: require auth AND ownership. The first OAuth login after
 *     setup claims ownership, so any authenticated user is either the owner
 *     (allowed) or a non-owner (denied).
 */
async function requireSetupAuth(c: Context<AppEnv>, next: Next) {
  if (!isGitHubConfigured()) {
    await next();
    return;
  }
  return requireAuth(c, () => requireOwner(c, next));
}

/**
 * GET /api/setup/status
 * Check whether GitHub App is configured.
 */
setupRoutes.get('/status', async (c) => {
  const configured = isGitHubConfigured();
  const dbConfig = await getGitHubAppConfig();
  const ownerCount = await countUsersByRole('owner');

  // Build the install URL based on owner type
  let installUrl: string | null = null;
  if (dbConfig) {
    installUrl = dbConfig.ownerType === 'Organization'
      ? `${config.github.htmlUrl}/organizations/${dbConfig.ownerLogin}/settings/apps/${dbConfig.appSlug}/installations`
      : `${config.github.htmlUrl}/apps/${dbConfig.appSlug}/installations/new`;
  }

  return c.json({
    configured,
    appSlug: dbConfig?.appSlug ?? null,
    appUrl: config.appUrl,
    githubUrl: config.github.htmlUrl,
    installUrl,
    hasOwner: ownerCount > 0,
  });
});

/**
 * POST /api/setup/github
 * Initiates the GitHub App Manifest flow.
 * Redirects the user to GitHub with a pre-filled app manifest.
 */
setupRoutes.post('/github', setupLimiter, requireSetupAuth, async (c) => {
  const body = await c.req.json<{ githubUrl?: string; appUrl?: string; org?: string }>().catch((): { githubUrl?: string; appUrl?: string; org?: string } => ({}));

  // Validate and set app URL if provided
  if (body.appUrl) {
    config.appUrl = validateAppUrl(body.appUrl);
  }

  // Persist the app URL
  await saveAppUrl(config.appUrl);

  // Allow overriding GitHub URL for GHE — validated to prevent SSRF
  if (body.githubUrl && body.githubUrl !== 'https://github.com') {
    const validatedUrl = validateGitHubUrl(body.githubUrl);
    config.github.htmlUrl = validatedUrl;
    config.github.baseUrl = `${validatedUrl}/api/v3`;
  } else {
    config.github.htmlUrl = 'https://github.com';
    config.github.baseUrl = 'https://api.github.com';
  }

  // Persist GitHub URLs
  await saveGitHubUrls(config.github.baseUrl, config.github.htmlUrl);

  const webhookUrl = `${config.appUrl}/api/webhook/github`;
  const callbackUrl = `${config.appUrl}/api/setup/github/callback`;
  const setupUrl = `${config.appUrl}/settings`;

  const manifest = {
    name: 'Cruise Line',
    url: config.appUrl,
    hook_attributes: {
      url: webhookUrl,
      active: true,
    },
    callback_urls: [
      `${config.appUrl}/api/auth/callback`,
    ],
    redirect_url: callbackUrl,
    setup_url: setupUrl,
    setup_on_update: true,
    public: false,
    default_permissions: {
      contents: 'read',
      pull_requests: 'write',
      issues: 'write',
      metadata: 'read',
      members: 'read',
    },
    default_events: [
      'pull_request',
    ],
  };

  // GitHub's manifest creation URL — use org path if an organization is specified
  const manifestUrl = body.org
    ? `${config.github.htmlUrl}/organizations/${encodeURIComponent(body.org)}/settings/apps/new`
    : `${config.github.htmlUrl}/settings/apps/new`;

  // Return the manifest and URL so the frontend can POST a form to GitHub
  return c.json({
    manifestUrl,
    manifest: JSON.stringify(manifest),
  });
});

/**
 * GET /api/setup/github/callback?code=<code>
 * GitHub redirects here after the user creates the app.
 * We exchange the code for the app's credentials.
 */
setupRoutes.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.json({ error: 'Missing code parameter' }, 400);
  }

  // Exchange the temporary code for the app configuration
  const res = await fetch(
    `${config.github.baseUrl}/app-manifests/${code}/conversions`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error('GitHub manifest conversion failed:', res.status, body);
    return c.redirect(`${config.appUrl}/settings?error=manifest_conversion_failed`);
  }

  const data = (await res.json()) as {
    id: number;
    slug: string;
    pem: string;
    webhook_secret: string;
    client_id: string;
    client_secret: string;
    html_url: string;
    owner: { login: string; type: string };
  };

  const appConfig = {
    appId: String(data.id),
    appSlug: data.slug,
    privateKey: data.pem,
    webhookSecret: data.webhook_secret,
    clientId: data.client_id,
    clientSecret: data.client_secret,
    ownerLogin: data.owner.login,
    ownerType: data.owner.type,
  };

  // Save to database
  await saveGitHubAppConfig(appConfig);

  // Update runtime config
  updateGitHubConfig(appConfig);

  // Recreate the webhook handler with the new secret
  refreshWebhooks();

  // Build the correct install URL — org apps need the org settings path
  const installUrl = data.owner.type === 'Organization'
    ? `${config.github.htmlUrl}/organizations/${data.owner.login}/settings/apps/${data.slug}/installations`
    : `${data.html_url}/installations/new`;

  // Redirect to setup page with success
  return c.redirect(
    `${config.appUrl}/settings?success=true&install_url=${encodeURIComponent(installUrl)}`,
  );
});

/**
 * GET /api/setup/install/callback
 * GitHub redirects here after the user installs the app on repos.
 */
setupRoutes.get('/install/callback', (c) => {
  const installationId = c.req.query('installation_id');
  console.log(`GitHub App installed, installation_id: ${installationId}`);
  return c.redirect(`${config.appUrl}/settings?installed=true`);
});

/**
 * DELETE /api/setup/github
 * Disconnect the current GitHub App so a new one can be connected.
 */
/**
 * POST /api/setup/claim
 * Claim ownership for the currently authenticated user. Migration backstop
 * for installs that predate the owner concept (e.g., org-owned Apps where
 * the boot-time auto-seed can't pick a human) and a recovery path if the
 * auto-seed fails for any reason.
 *
 * Requires auth but not requireOwner — by definition this is what runs
 * before an owner exists. Once an owner is set, the endpoint returns 409
 * with the current owner so the frontend can surface it.
 */
setupRoutes.post('/claim', setupLimiter, requireAuth, async (c) => {
  if (!isGitHubConfigured()) {
    throw new AppError(400, 'GitHub App must be configured before claiming ownership');
  }

  const session = c.get('session');

  // Make sure the calling user exists in the users table before granting the
  // role. requireAuth already fires touchUser, but it's fire-and-forget; we
  // can't depend on it having completed yet on this request.
  await touchUser({
    userId: session.userId,
    login: session.login,
    avatarUrl: session.avatarUrl,
  });

  const claimed = await claimOwnerIfNone(session.userId);

  if (!claimed) {
    return c.json({ error: 'Owner role is already held' }, 409);
  }

  console.log(`Cruise Line owner role manually claimed by ${session.login} (${session.userId})`);
  return c.json({
    ok: true,
    owner: { userId: session.userId, login: session.login, avatarUrl: session.avatarUrl },
  });
});

setupRoutes.delete('/github', setupLimiter, requireAuth, requireOwner, async (c) => {
  await deleteGitHubAppConfig();

  // Clear runtime config
  config.github.appId = '';
  config.github.privateKey = '';
  config.github.webhookSecret = '';
  config.github.clientId = '';
  config.github.clientSecret = '';

  // Reset GitHub URLs to defaults
  config.github.baseUrl = 'https://api.github.com';
  config.github.htmlUrl = 'https://github.com';

  console.log('GitHub App disconnected');
  return c.json({ ok: true });
});
