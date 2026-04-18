import { Hono } from 'hono';
import { config } from '../config.js';
import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getGitHubUser,
  createSessionToken,
  verifySessionToken,
} from '../github/oauth.js';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '../middleware/error.js';

export const authRoutes = new Hono();

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

authRoutes.get('/github', async (c) => {
  const returnTo = c.req.query('return_to') ?? '/';
  const state = await encodeState(returnTo);
  const redirectUri = `${config.appUrl}/api/auth/callback`;
  const authorizeUrl = getAuthorizeUrl(state, redirectUri);

  return c.redirect(authorizeUrl);
});

authRoutes.get('/callback', async (c) => {
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
  const githubToken = await exchangeCodeForToken(code);
  const user = await getGitHubUser(githubToken);

  // Create session JWT
  const sessionToken = await createSessionToken({
    githubToken,
    userId: user.id,
    login: user.login,
    avatarUrl: user.avatar_url,
  });

  // Set session cookie on this domain
  const secure = config.appUrl.startsWith('https') ? '; Secure' : '';
  c.header(
    'Set-Cookie',
    `${config.session.cookieName}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure}`,
  );

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
  const cookieHeader = c.req.header('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`${config.session.cookieName}=([^;]*)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!token) {
    throw new AppError(401, 'Not authenticated');
  }

  const session = await verifySessionToken(token);
  if (!session) {
    throw new AppError(401, 'Invalid or expired session');
  }

  return c.json({
    userId: session.userId,
    login: session.login,
    avatarUrl: session.avatarUrl,
  });
});

authRoutes.post('/logout', (c) => {
  c.header(
    'Set-Cookie',
    `${config.session.cookieName}=; Path=/; HttpOnly; Max-Age=0`,
  );
  return c.json({ ok: true });
});
