import type { Context, Next } from 'hono';
import { config, isGitHubConfigured } from '../config.js';

/**
 * Content Security Policy, built per request because the GitHub host can
 * change at setup (Enterprise). Images come only from the app and GitHub's
 * avatar hosts: reviews and chat render model-written markdown, and an
 * image from anywhere else is a beacon that fires on page load, carrying
 * whatever a prompt injection put in its URL.
 */
export async function contentSecurityPolicy(c: Context, next: Next) {
  await next();
  const github = new URL(config.github.htmlUrl);
  // github.com serves avatars from avatars.githubusercontent.com; Enterprise
  // serves them from its own host, or an avatars. subdomain with subdomain isolation
  const imgSrc = [
    "'self'",
    'data:',
    'https://avatars.githubusercontent.com',
    github.origin,
    `${github.protocol}//avatars.${github.host}`,
  ].join(' ');
  // First-time setup POSTs the App manifest form to GitHub. Before the App
  // exists the GitHub host isn't settled (the setup form can switch it to an
  // Enterprise host after this page loaded), and there's no model-written
  // content to inject a form, so any https target is allowed until then.
  const formAction = isGitHubConfigured() ? "'self'" : "'self' https:";
  c.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src ${imgSrc}`,
    "connect-src 'self'",
    "frame-src 'none'",
    `form-action ${formAction}`,
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '));
}
