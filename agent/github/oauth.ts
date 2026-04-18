import { SignJWT, jwtVerify, importJWK } from 'jose';
import { config } from '../config.js';

const ALGORITHM = 'HS256';

async function getSecretKey() {
  const encoder = new TextEncoder();
  return await importJWK(
    { kty: 'oct', k: Buffer.from(encoder.encode(config.session.secret)).toString('base64url') },
    ALGORITHM,
  );
}

export interface SessionPayload {
  githubToken: string;
  userId: number;
  login: string;
  avatarUrl: string;
}

/**
 * Build the GitHub OAuth authorization URL.
 */
export function getAuthorizeUrl(state: string, redirectUri: string): string {
  const base = config.github.htmlUrl;
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: redirectUri,
    state,
    scope: '',
  });
  return `${base}/login/oauth/authorize?${params}`;
}

/**
 * Exchange an OAuth code for an access token.
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
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

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`OAuth token exchange failed: ${data.error ?? 'unknown error'}`);
  }
  return data.access_token;
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
 * Create a signed session JWT cookie value.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const key = await getSecretKey();
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

/**
 * Verify and decode a session JWT.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const key = await getSecretKey();
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
