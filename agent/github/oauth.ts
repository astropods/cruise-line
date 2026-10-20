import { config } from '../config.js';

export { createSessionToken, verifySessionToken, signStateToken, verifyStateToken, type SessionPayload } from './tokens.js';

/**
 * Build the GitHub OAuth authorization URL.
 */
export function getAuthorizeUrl(state: string, redirectUri: string): string {
  const base = config.github.htmlUrl;
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'repo',
  });
  return `${base}/login/oauth/authorize?${params}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  /** Epoch seconds when the access token expires (undefined if tokens don't expire) */
  expiresAt?: number;
}

/**
 * Exchange an OAuth code for an access token.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenExchangeResult> {
  const base = config.github.htmlUrl;
  const res = await fetch(`${base}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!data.access_token) {
    throw new Error(`OAuth token exchange failed: ${data.error ?? 'unknown error'}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : undefined,
  };
}

/**
 * Use a refresh token to obtain a new access token.
 */
export async function refreshGitHubToken(refreshToken: string): Promise<TokenExchangeResult> {
  const base = config.github.htmlUrl;
  const res = await fetch(`${base}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${data.error ?? 'unknown error'}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : undefined,
  };
}

/**
 * Fetch the authenticated GitHub user's profile.
 */
export async function getGitHubUser(
  token: string,
): Promise<{ id: number; login: string; avatar_url: string }> {
  const res = await fetch(`${config.github.baseUrl}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub user');
  return (await res.json()) as { id: number; login: string; avatar_url: string };
}

/**
 * Set (or clear) the session cookie on a Hono response context.
 */
export function setSessionCookie(c: { header: (name: string, value: string) => void }, token: string): void {
  const secure = config.appUrl.startsWith('https') ? '; Secure' : '';
  c.header(
    'Set-Cookie',
    `${config.session.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure}`,
  );
}

