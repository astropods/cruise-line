/**
 * Signed tokens: the session cookie and the short-lived `state` values that
 * round-trip through GitHub. Kept apart from oauth.ts so tests can use the
 * real signing code while other tests mock the GitHub calls.
 */
import { SignJWT, jwtVerify, importJWK, type JWTPayload } from 'jose';
import { config } from '../config.js';

const ALGORITHM = 'HS256';

// Every token is signed with the session secret, so each kind carries its own
// audience and is only accepted where that audience is expected.
const SESSION_AUDIENCE = 'session';

async function getSecretKey() {
  const encoder = new TextEncoder();
  return await importJWK(
    { kty: 'oct', k: Buffer.from(encoder.encode(config.session.secret)).toString('base64url') },
    ALGORITHM,
  );
}

export interface SessionPayload {
  githubToken: string;
  /** GitHub refresh token for renewing expired user tokens */
  refreshToken?: string;
  /** Epoch seconds when the GitHub token expires */
  githubTokenExpiresAt?: number;
  userId: number;
  login: string;
  avatarUrl: string;
  /** JWT ID — used for session revocation */
  jti?: string;
  /** JWT expiration (epoch seconds) */
  exp?: number;
}

/**
 * Create a signed session JWT cookie value.
 * Includes a JTI claim for revocation support.
 */
export async function createSessionToken(payload: Omit<SessionPayload, 'jti' | 'exp'>): Promise<string> {
  const key = await getSecretKey();
  const jti = crypto.randomUUID();
  return new SignJWT({ ...payload, jti } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setAudience(SESSION_AUDIENCE)
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
    // Sessions issued before audiences were added have none; anything else
    // signed with this key (OAuth or setup state) has a different one.
    if (payload.aud !== undefined && payload.aud !== SESSION_AUDIENCE) return null;
    if (typeof payload.userId !== 'number') return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** A short-lived signed `state` for a round trip through GitHub */
export async function signStateToken(audience: string, claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime('10m')
    .sign(await getSecretKey());
}

/** The claims of a `state` from signStateToken, or null if it's invalid, expired, or for another audience */
export async function verifyStateToken(audience: string, token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getSecretKey(), { audience });
    return payload;
  } catch {
    return null;
  }
}
