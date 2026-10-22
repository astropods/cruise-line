import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from './config.js';
import { contentSecurityPolicy } from './middleware/csp.js';

async function policyFor(htmlUrl: string): Promise<string> {
  // Other test files mock config with a partial object that can lack github
  (config as any).github ??= {};
  const previous = config.github.htmlUrl;
  config.github.htmlUrl = htmlUrl;
  try {
    const app = new Hono().use('*', contentSecurityPolicy).get('/', (c) => c.text('ok'));
    const res = await app.request('/');
    return res.headers.get('Content-Security-Policy') ?? '';
  } finally {
    config.github.htmlUrl = previous;
  }
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
});
