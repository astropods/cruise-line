import { describe, expect, mock, it } from 'bun:test';
import path from 'path';
import { Hono } from 'hono';

// Module mocks are process-wide, and other files mock config with partial
// objects, so this file brings its own
const mockConfig = { github: { htmlUrl: 'https://github.com' } };
let appConfigured = true;
mock.module(path.resolve(import.meta.dir, './config.ts'), () => ({
  config: mockConfig,
  isGitHubConfigured: () => appConfigured,
}));
const { contentSecurityPolicy } = await import('./middleware/csp.js');

async function policyFor(htmlUrl: string, { configured = true } = {}): Promise<string> {
  mockConfig.github.htmlUrl = htmlUrl;
  appConfigured = configured;
  const app = new Hono().use('*', contentSecurityPolicy).get('/', (c) => c.text('ok'));
  const res = await app.request('/');
  return res.headers.get('Content-Security-Policy') ?? '';
}

describe('contentSecurityPolicy', () => {
  it('allows images only from the app and GitHub avatar hosts', async () => {
    const csp = await policyFor('https://github.com');
    const imgSrc = csp.split('; ').find((d) => d.startsWith('img-src'));
    expect(imgSrc).toBe("img-src 'self' data: https://avatars.githubusercontent.com https://github.com https://avatars.github.com");
  });

  it('follows an Enterprise host, including its avatars subdomain', async () => {
    const csp = await policyFor('https://ghe.example.com');
    expect(csp).toContain('https://ghe.example.com https://avatars.ghe.example.com');
  });

  it('lets the web fonts load', async () => {
    const csp = await policyFor('https://github.com');
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('font-src');
  });

  it('lets first-time setup post the App manifest to any GitHub host', async () => {
    const csp = await policyFor('https://github.com', { configured: false });
    expect(csp).toContain("form-action 'self' https:");
  });

  it('keeps forms on the app once the GitHub App exists', async () => {
    const csp = await policyFor('https://github.com');
    expect(csp).toContain("form-action 'self';");
  });
});
