import { Hono } from 'hono';
import { config, updateGitHubConfig, isGitHubConfigured } from '../config.js';
import {
  saveGitHubAppConfig,
  getGitHubAppConfig,
  deleteGitHubAppConfig,
  saveGitHubUrls,
  saveAppUrl,
} from '../db/app-config.js';
import { refreshWebhooks } from '../github/webhooks.js';

export const setupRoutes = new Hono();

/**
 * GET /api/setup/status
 * Check whether GitHub App is configured.
 */
setupRoutes.get('/status', async (c) => {
  const configured = isGitHubConfigured();
  const dbConfig = await getGitHubAppConfig();

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
  });
});

/**
 * POST /api/setup/github
 * Initiates the GitHub App Manifest flow.
 * Redirects the user to GitHub with a pre-filled app manifest.
 */
setupRoutes.post('/github', async (c) => {
  const body = await c.req.json<{ githubUrl?: string; appUrl?: string; org?: string }>().catch(() => ({}));

  // Detect app URL from the incoming request if not explicitly set
  if (body.appUrl) {
    config.appUrl = body.appUrl.replace(/\/+$/, '');
  } else if (config.appUrl === 'http://localhost:80') {
    // Auto-detect from the request
    const origin = c.req.header('origin') || c.req.header('referer');
    if (origin) {
      try {
        const url = new URL(origin);
        config.appUrl = url.origin;
      } catch { /* keep default */ }
    }
  }

  // Persist the app URL
  await saveAppUrl(config.appUrl);

  // Allow overriding GitHub URL for GHE
  if (body.githubUrl && body.githubUrl !== 'https://github.com') {
    config.github.htmlUrl = body.githubUrl.replace(/\/+$/, '');
    config.github.baseUrl = `${config.github.htmlUrl}/api/v3`;
  } else {
    config.github.htmlUrl = 'https://github.com';
    config.github.baseUrl = 'https://api.github.com';
  }

  // Persist GitHub URLs
  await saveGitHubUrls(config.github.baseUrl, config.github.htmlUrl);

  const webhookUrl = `${config.appUrl}/api/webhook/github`;
  const callbackUrl = `${config.appUrl}/api/setup/github/callback`;
  const setupUrl = `${config.appUrl}/setup`;

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
    return c.redirect(`${config.appUrl}/setup?error=manifest_conversion_failed`);
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
    `${config.appUrl}/setup?success=true&install_url=${encodeURIComponent(installUrl)}`,
  );
});

/**
 * GET /api/setup/install/callback
 * GitHub redirects here after the user installs the app on repos.
 */
setupRoutes.get('/install/callback', (c) => {
  const installationId = c.req.query('installation_id');
  console.log(`GitHub App installed, installation_id: ${installationId}`);
  return c.redirect(`${config.appUrl}/setup?installed=true`);
});

/**
 * DELETE /api/setup/github
 * Disconnect the current GitHub App so a new one can be connected.
 */
setupRoutes.delete('/github', async (c) => {
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
