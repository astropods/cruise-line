import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { config, updateGitHubConfig } from './config.js';
import { initDb } from './db/client.js';
import {
  getGitHubAppConfig,
  getOrCreateSessionSecret,
  getGitHubUrls,
  getAppUrl,
} from './db/app-config.js';
import { refreshWebhooks } from './github/webhooks.js';
import { cleanupExpiredRevocations } from './db/sessions.js';
import { attemptAutoSeedOwner } from './owner.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhook.js';
import { authRoutes } from './routes/auth.js';
import { walkthroughRoutes } from './routes/walkthroughs.js';
import { commentRoutes } from './routes/comments.js';
import { chatRoutes } from './routes/chat.js';
import { fileRoutes } from './routes/files.js';
import { ruleRoutes } from './routes/rules.js';
import { setupRoutes } from './routes/setup.js';
import { settingsRoutes } from './routes/settings.js';
import { debugRoutes } from './routes/debug.js';
import { cliAuthRoutes } from './routes/cli-auth.js';
import { downloadRoutes } from './routes/download.js';
import { errorHandler } from './middleware/error.js';

const isDev = config.port !== 80;

const app = new Hono();

// Global error handler
app.onError(errorHandler);

// Security headers (production only — dev skips CSP to avoid Vite HMR conflicts)
if (!isDev) {
  app.use('*', secureHeaders({
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    referrerPolicy: 'strict-origin-when-cross-origin',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'https:', 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  }));
}

// CORS for Vite dev server
if (isDev) {
  app.use('/api/*', cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
    credentials: true,
  }));
}

// API routes
app.route('/', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/webhook', webhookRoutes);
app.route('/api/walkthroughs', walkthroughRoutes);
app.route('/api/comments', commentRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/files', fileRoutes);
app.route('/api/rules', ruleRoutes);
app.route('/api/setup', setupRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/debug', debugRoutes);
app.route('/api/cli', cliAuthRoutes);
// CLI download surface: /install.sh, /download/*, /api/cli/latest.
// Mounted at root so /install.sh and /download/* aren't buried under /api.
app.route('/', downloadRoutes);

if (isDev) {
  // In dev, redirect non-API page requests to Vite dev server
  app.get('/*', (c) => {
    const viteUrl = `http://localhost:5173${c.req.path}${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''}`;
    return c.redirect(viteUrl);
  });
} else {
  // In production, serve built frontend
  app.use('/*', serveStatic({ root: './frontend/dist' }));
  app.get('/*', serveStatic({ root: './frontend/dist', path: 'index.html' }));
}

// Start
await initDb();

// Auto-generate and persist session secret
config.session.secret = await getOrCreateSessionSecret();

// Load app URL from DB if not set via env.
// ASTRO_EXTERNAL_AGENT_URL is injected by the Astro platform and always reflects
// the current deployment URL — never let a stale DB value (cached during a prior
// setup at a different URL) override it.
const savedAppUrl = await getAppUrl();
if (savedAppUrl && !process.env.ASTRO_EXTERNAL_AGENT_URL) config.appUrl = savedAppUrl;

// Load GitHub URLs from DB (GHE settings)
const savedUrls = await getGitHubUrls();
if (savedUrls) {
  config.github.baseUrl = savedUrls.baseUrl;
  config.github.htmlUrl = savedUrls.htmlUrl;
}

// Load GitHub App credentials from DB
const dbConfig = await getGitHubAppConfig();
if (dbConfig) {
  updateGitHubConfig(dbConfig);
  refreshWebhooks();
  console.log(`GitHub App loaded from database (${dbConfig.appSlug})`);

  // Existing installs created before the owner concept won't have an owner
  // claimed. Try to auto-seed from the App owner; fall back to manual claim.
  const seed = await attemptAutoSeedOwner();
  if (seed.status === 'claimed') {
    console.log(`Owner auto-seeded from GitHub App owner: ${seed.login} (${seed.userId})`);
  } else if (seed.status === 'failed') {
    console.warn(`Owner auto-seed failed: ${seed.reason}. Use POST /api/setup/claim to claim manually.`);
  }
} else {
  console.log('GitHub App not configured — visit /settings to connect');
}

Bun.serve({
  port: config.port,
  fetch: app.fetch,
  idleTimeout: 30, // Heartbeats every 5s keep SSE connections alive within this window
});

// Periodic cleanup of expired session revocations (hourly)
const cleanupInterval = setInterval(async () => {
  try {
    await cleanupExpiredRevocations();
  } catch (e) {
    console.warn('Session cleanup failed:', e);
  }
}, 60 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

console.log(`Cruise Line listening on :${config.port}`);
