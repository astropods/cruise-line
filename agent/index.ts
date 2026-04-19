import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { config, updateGitHubConfig } from './config.js';
import { initDb } from './db/client.js';
import {
  getGitHubAppConfig,
  getOrCreateSessionSecret,
  getGitHubUrls,
  getAppUrl,
} from './db/app-config.js';
import { refreshWebhooks } from './github/webhooks.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhook.js';
import { authRoutes } from './routes/auth.js';
import { walkthroughRoutes } from './routes/walkthroughs.js';
import { commentRoutes } from './routes/comments.js';
import { chatRoutes } from './routes/chat.js';
import { setupRoutes } from './routes/setup.js';
import { errorHandler } from './middleware/error.js';

const isDev = config.port !== 80;

const app = new Hono();

// Global error handler
app.onError(errorHandler);

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
app.route('/api/setup', setupRoutes);

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

// Load app URL from DB if not set via env
const savedAppUrl = await getAppUrl();
if (savedAppUrl) config.appUrl = savedAppUrl;

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
} else {
  console.log('GitHub App not configured — visit /setup to connect');
}

Bun.serve({
  port: config.port,
  fetch: app.fetch,
  idleTimeout: 30, // Heartbeats every 5s keep SSE connections alive within this window
});

console.log(`Cruise Line listening on :${config.port}`);
