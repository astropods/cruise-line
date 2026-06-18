import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '../config.js';
import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getGitHubUser,
  createSessionToken,
  setSessionCookie,
  verifySessionToken,
} from '../github/oauth.js';
import { revokeSession } from '../db/sessions.js';
import { claimOwner, getOwner, isOwnerClaimed } from '../db/app-config.js';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '../middleware/error.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const authRoutes = new Hono();

// 10 requests per minute per IP for auth endpoints
const authLimiter = rateLimit('auth', { windowMs: 60_000, max: 10 });

// Encode the CSRF state + return_to into a signed JWT that round-trips via GitHub's state param
async function encodeState(returnTo: string): Promise<string> {
  const secret = new TextEncoder().encode(config.session.secret);
  return new SignJWT({ returnTo })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

async function decodeState(state: string): Promise<{ returnTo: string } | null> {
  try {
    const secret = new TextEncoder().encode(config.session.secret);
    const { payload } = await jwtVerify(state, secret);
    return { returnTo: (payload.returnTo as string) ?? '/' };
  } catch {
    return null;
  }
}

authRoutes.get('/github', authLimiter, async (c) => {
  const returnTo = c.req.query('return_to') ?? '/';
  const state = await encodeState(returnTo);
  const redirectUri = `${config.appUrl}/api/auth/callback`;
  const authorizeUrl = getAuthorizeUrl(state, redirectUri);

  return c.redirect(authorizeUrl);
});

authRoutes.get('/callback', authLimiter, async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    throw new AppError(400, 'Missing code or state parameter');
  }

  // Verify state is a valid signed JWT (CSRF protection without cookies)
  const decoded = await decodeState(state);
  if (!decoded) {
    throw new AppError(400, 'Invalid or expired OAuth state');
  }

  // Exchange code for token
  const tokenResult = await exchangeCodeForToken(code);
  const user = await getGitHubUser(tokenResult.accessToken);

  // First user to authenticate after setup claims ownership. The DB upsert is
  // race-free, so concurrent first logins resolve to a single owner.
  if (!(await isOwnerClaimed())) {
    const claimed = await claimOwner({
      userId: user.id,
      login: user.login,
      avatarUrl: user.avatar_url,
    });
    if (claimed) {
      console.log(`Cruise Line ownership claimed by ${user.login} (${user.id})`);
    }
  }

  // Create session JWT
  const sessionToken = await createSessionToken({
    githubToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken,
    githubTokenExpiresAt: tokenResult.expiresAt,
    userId: user.id,
    login: user.login,
    avatarUrl: user.avatar_url,
  });

  // Set session cookie on this domain
  setSessionCookie(c, sessionToken);

  // In dev, the frontend is on a different origin (Vite).
  // Pass the token via query param so the frontend can set its own cookie.
  const returnTo = decoded.returnTo;
  const isDev = config.port !== 80;
  if (isDev) {
    const frontendUrl = `http://localhost:5173/auth/complete?token=${encodeURIComponent(sessionToken)}&return_to=${encodeURIComponent(returnTo)}`;
    return c.redirect(frontendUrl);
  }

  return c.redirect(returnTo);
});

authRoutes.get('/me', async (c) => {
  const token = getCookie(c, config.session.cookieName);

  if (!token) {
    throw new AppError(401, 'Not authenticated');
  }

  const session = await verifySessionToken(token);
  if (!session) {
    throw new AppError(401, 'Invalid or expired session');
  }

  const owner = await getOwner();

  return c.json({
    userId: session.userId,
    login: session.login,
    avatarUrl: session.avatarUrl,
    isOwner: owner !== null && owner.userId === session.userId,
    ownerLogin: owner?.login ?? null,
  });
});

authRoutes.post('/logout', async (c) => {
  // Revoke the session so it can't be reused even if the cookie is captured
  const token = getCookie(c, config.session.cookieName);
  if (token) {
    const session = await verifySessionToken(token);
    if (session?.jti && session?.exp) {
      await revokeSession(session.jti, new Date(session.exp * 1000));
    }
  }

  c.header(
    'Set-Cookie',
    `${config.session.cookieName}=; Path=/; HttpOnly; Max-Age=0`,
  );
  return c.json({ ok: true });
});
