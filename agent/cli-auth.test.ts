/**
 * Tests for the CLI OAuth flow — the security-sensitive pieces:
 *   - isLoopbackRedirect: rejects everything that isn't 127.0.0.1/localhost over http
 *   - sha256Base64Url: the PKCE S256 hash — RFC 7636 test vector
 *   - validateAuthorizeParams: every rejection path
 *   - POST /api/cli/token: happy path + redirect_uri / verifier / code failure modes
 *
 * The single-use consumption guarantee lives in consumeAuthCode (an atomic
 * guarded UPDATE) and can't be exercised without a real Postgres — leave that
 * to a follow-up integration harness.
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import path from 'path';
import { Hono } from 'hono';

// --- Module mocks ---------------------------------------------------

const mockConsumeAuthCode = mock();
const mockCreateAuthCode = mock();
const mockIssueCliToken = mock();
const mockRevokeCliToken = mock();
const mockListCliTokensForUser = mock();
const mockGetUser = mock();
const mockResolveCliToken = mock(() => Promise.resolve(null as any));
const mockListInstallationsWithReposForUser = mock();

mock.module(path.resolve(import.meta.dir, './config.ts'), () => ({
  config: {
    github: { baseUrl: 'https://api.github.com' },
    session: { cookieName: 'cruise_session' },
    // db.url is read at import time by ./db/client.ts. Any string works
    // because no test path actually opens a real Postgres connection.
    db: { url: 'postgres://noop' },
  },
}));

// db/sessions.ts pulls in ./client.ts (real Postgres) unless we stub it —
// middleware/session.ts imports isSessionRevoked at module scope.
mock.module(path.resolve(import.meta.dir, './db/sessions.ts'), () => ({
  isSessionRevoked: mock(() => Promise.resolve(false)),
}));

mock.module(path.resolve(import.meta.dir, './db/cli-tokens.ts'), () => ({
  consumeAuthCode: mockConsumeAuthCode,
  createAuthCode: mockCreateAuthCode,
  issueCliToken: mockIssueCliToken,
  revokeCliToken: mockRevokeCliToken,
  listCliTokensForUser: mockListCliTokensForUser,
  resolveCliToken: mockResolveCliToken,
  touchCliTokenUsed: mock(() => Promise.resolve()),
}));

// Mock the CLI-scoped re-export rather than github/client.ts itself.
// A full-module mock on github/client.ts would clobber verifyRepoAccess
// process-wide and break the middleware tests in auth.test.ts.
mock.module(path.resolve(import.meta.dir, './cli-repos.ts'), () => ({
  listInstallationsWithReposForUser: mockListInstallationsWithReposForUser,
}));

mock.module(path.resolve(import.meta.dir, './db/users.ts'), () => ({
  getUser: mockGetUser,
  // Full import surface for middleware/session.ts, which pulls touchUser at
  // module scope for its trackActiveUser helper.
  touchUser: mock(() => Promise.resolve()),
}));

// requireAuth/requireCookieSession pull from db/cli-tokens.ts + db/users.ts
// (already mocked above). The middleware itself doesn't need a separate mock —
// the tests below hit /api/cli/token which is public.

const {
  isLoopbackRedirect,
  sha256Base64Url,
  validateAuthorizeParams,
  cliAuthRoutes,
} = await import('./routes/cli-auth.js');

const { errorHandler } = await import('./middleware/error.js');

// --- Pure helper tests ----------------------------------------------

describe('isLoopbackRedirect', () => {
  it('accepts http://127.0.0.1:<port>/callback', () => {
    expect(isLoopbackRedirect('http://127.0.0.1:12345/callback')).toBe(true);
  });

  it('accepts http://localhost:<port>/callback', () => {
    expect(isLoopbackRedirect('http://localhost:9999/callback')).toBe(true);
  });

  it('accepts a loopback URI with no path', () => {
    expect(isLoopbackRedirect('http://127.0.0.1:5000')).toBe(true);
  });

  it('rejects https:// even for loopback', () => {
    // The spec allows https on loopback, but our CLI uses plain http and this
    // is defense-in-depth against a redirect_uri that could be intercepted.
    expect(isLoopbackRedirect('https://127.0.0.1:12345/callback')).toBe(false);
  });

  it('rejects non-loopback hosts', () => {
    expect(isLoopbackRedirect('http://example.com/callback')).toBe(false);
    expect(isLoopbackRedirect('http://attacker.internal/callback')).toBe(false);
  });

  it('rejects IPv4 addresses that look loopback-adjacent but aren\'t', () => {
    expect(isLoopbackRedirect('http://127.0.0.2:12345/callback')).toBe(false);
    expect(isLoopbackRedirect('http://192.168.1.1:12345/callback')).toBe(false);
  });

  it('rejects malformed URIs', () => {
    expect(isLoopbackRedirect('not-a-url')).toBe(false);
    expect(isLoopbackRedirect('')).toBe(false);
  });

  it('rejects file:// and other schemes', () => {
    expect(isLoopbackRedirect('file:///etc/passwd')).toBe(false);
    expect(isLoopbackRedirect('javascript:alert(1)')).toBe(false);
  });
});

describe('sha256Base64Url — PKCE S256 challenge', () => {
  it('matches the RFC 7636 test vector', async () => {
    // From RFC 7636 Appendix B: given this specific verifier, the challenge
    // MUST be this exact string. Regressing here means our S256 impl
    // disagrees with the spec — no other client will interoperate.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(await sha256Base64Url(verifier)).toBe(expected);
  });

  it('produces url-safe base64 with no padding', async () => {
    const out = await sha256Base64Url('cruise-line');
    expect(out).not.toContain('+');
    expect(out).not.toContain('/');
    expect(out).not.toContain('=');
    // SHA-256 is 32 bytes → 43 base64url chars without padding.
    expect(out.length).toBe(43);
  });

  it('is deterministic', async () => {
    const a = await sha256Base64Url('same input');
    const b = await sha256Base64Url('same input');
    expect(a).toBe(b);
  });

  it('differs for different inputs', async () => {
    const a = await sha256Base64Url('input A');
    const b = await sha256Base64Url('input B');
    expect(a).not.toBe(b);
  });
});

describe('validateAuthorizeParams', () => {
  const good = {
    responseType: 'code',
    clientId: 'cli',
    redirectUri: 'http://127.0.0.1:12345/callback',
    state: 'abcdef012345',
    codeChallenge: 'a'.repeat(43),
    codeChallengeMethod: 'S256',
  };

  it('accepts fully-valid params and echoes them back', () => {
    const out = validateAuthorizeParams(good);
    expect(out).toEqual(good);
  });

  it('rejects response_type other than "code"', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, responseType: 'token' }),
    ).toThrow(/response_type/);
  });

  it('rejects unknown client_id', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, clientId: 'attacker-app' }),
    ).toThrow(/client_id/);
  });

  it('rejects non-loopback redirect_uri', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, redirectUri: 'https://example.com/cb' }),
    ).toThrow(/loopback/);
  });

  it('rejects a missing redirect_uri', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, redirectUri: undefined }),
    ).toThrow(/loopback/);
  });

  it('rejects state that is too short', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, state: 'short' }),
    ).toThrow(/state/);
  });

  it('rejects state that is too long', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, state: 'x'.repeat(513) }),
    ).toThrow(/state/);
  });

  it('rejects a code_challenge that is too short', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, codeChallenge: 'a'.repeat(42) }),
    ).toThrow(/code_challenge/);
  });

  it('rejects a code_challenge that is too long', () => {
    expect(() =>
      validateAuthorizeParams({ ...good, codeChallenge: 'a'.repeat(129) }),
    ).toThrow(/code_challenge/);
  });

  it('rejects code_challenge_method="plain" (S256 only)', () => {
    // Accepting "plain" would defeat PKCE — an intercepted code could be
    // exchanged without knowing the verifier.
    expect(() =>
      validateAuthorizeParams({ ...good, codeChallengeMethod: 'plain' }),
    ).toThrow(/S256/);
  });
});

// --- /api/cli/token integration ---------------------------------------

describe('POST /api/cli/token', () => {
  const app = new Hono();
  // Match the real app's error handling — without this, AppError bubbles up
  // to Hono's default 500 handler instead of the JSON-with-statusCode shape
  // the client expects.
  app.onError(errorHandler);
  app.route('/api/cli', cliAuthRoutes);

  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  const redirectUri = 'http://127.0.0.1:12345/callback';
  const fakeUser = {
    userId: 42,
    login: 'testuser',
    avatarUrl: 'https://example.com/a.png',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    loginCount: 1,
    role: 'user' as const,
  };

  async function exchange(body: Record<string, unknown>) {
    return app.request('/api/cli/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': '1.2.3.4', // stops the rate limiter from collapsing to one bucket
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mockConsumeAuthCode.mockReset();
    mockIssueCliToken.mockReset();
    mockGetUser.mockReset();
  });

  it('exchanges a valid code + verifier for a bearer token', async () => {
    mockConsumeAuthCode.mockResolvedValueOnce({
      userId: 42,
      codeChallenge: challenge,
      redirectUri,
    });
    mockGetUser.mockResolvedValueOnce(fakeUser);
    mockIssueCliToken.mockResolvedValueOnce({
      id: 'tok_1',
      token: 'cl_live_new',
      prefix: 'cl_live_new',
    });

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'auth_code_xyz',
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; token_type: string; token_id: string };
    expect(body.access_token).toBe('cl_live_new');
    expect(body.token_type).toBe('Bearer');
    expect(body.token_id).toBe('tok_1');
    expect(mockConsumeAuthCode).toHaveBeenCalledWith('auth_code_xyz');
    expect(mockIssueCliToken).toHaveBeenCalledWith({ userId: 42 });
  });

  it('rejects grant_type other than "authorization_code"', async () => {
    const res = await exchange({
      grant_type: 'password',
      code: 'x',
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    expect(res.status).toBe(400);
    expect(mockConsumeAuthCode).not.toHaveBeenCalled();
  });

  it('rejects a request missing code_verifier', async () => {
    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'x',
      redirect_uri: redirectUri,
    });
    expect(res.status).toBe(400);
    expect(mockConsumeAuthCode).not.toHaveBeenCalled();
  });

  it('rejects an unknown or expired code', async () => {
    mockConsumeAuthCode.mockResolvedValueOnce(null);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'expired_or_used',
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/expired|invalid/i);
    expect(mockIssueCliToken).not.toHaveBeenCalled();
  });

  it('rejects a redirect_uri that does not match the one bound at authorize time', async () => {
    mockConsumeAuthCode.mockResolvedValueOnce({
      userId: 42,
      codeChallenge: challenge,
      redirectUri, // 127.0.0.1:12345
    });

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'auth_code_xyz',
      code_verifier: verifier,
      redirect_uri: 'http://127.0.0.1:99999/callback', // wrong port
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/redirect_uri/);
    // Code is already consumed by this point (server can't un-consume) —
    // but no token gets issued.
    expect(mockIssueCliToken).not.toHaveBeenCalled();
  });

  it('rejects a code_verifier whose S256 hash does not match the bound challenge', async () => {
    mockConsumeAuthCode.mockResolvedValueOnce({
      userId: 42,
      codeChallenge: challenge,
      redirectUri,
    });

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'auth_code_xyz',
      code_verifier: 'a-different-verifier-that-hashes-to-something-else',
      redirect_uri: redirectUri,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/code_verifier/);
    expect(mockIssueCliToken).not.toHaveBeenCalled();
  });

  it('rejects when the user referenced by the code was deleted', async () => {
    mockConsumeAuthCode.mockResolvedValueOnce({
      userId: 42,
      codeChallenge: challenge,
      redirectUri,
    });
    mockGetUser.mockResolvedValueOnce(null);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'auth_code_xyz',
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    expect(res.status).toBe(400);
    expect(mockIssueCliToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// GET /api/cli/repos
// ---------------------------------------------------------------------

describe('GET /api/cli/repos', () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/api/cli', cliAuthRoutes);

  const bearerUser = {
    userId: 42,
    login: 'testuser',
    avatarUrl: '',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    loginCount: 1,
    role: 'user' as const,
  };

  beforeEach(() => {
    mockResolveCliToken.mockReset();
    mockGetUser.mockReset();
    mockListInstallationsWithReposForUser.mockReset();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await app.request('/api/cli/repos');
    expect(res.status).toBe(401);
    expect(mockListInstallationsWithReposForUser).not.toHaveBeenCalled();
  });

  it('scopes the response by calling listInstallationsWithReposForUser with the caller login', async () => {
    // This is the security regression fix: the underlying helper must
    // receive the caller's login so it can filter to repos they can see.
    // A regression here (e.g. reverting to listInstallationsWithRepos) would
    // silently leak cross-tenant private repo names.
    mockResolveCliToken.mockResolvedValueOnce({ id: 'tok', userId: 42 });
    mockGetUser.mockResolvedValueOnce(bearerUser);
    mockListInstallationsWithReposForUser.mockResolvedValueOnce([
      {
        id: 1,
        account: { login: 'acme', type: 'Organization', avatarUrl: '', htmlUrl: '' },
        repositories: [
          { id: 100, name: 'app', fullName: 'acme/app', private: true, htmlUrl: '' },
        ],
      },
    ]);

    const res = await app.request('/api/cli/repos', {
      headers: { authorization: 'Bearer cl_live_test' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { installations: unknown[] };
    expect(body.installations).toHaveLength(1);

    // The scoping check: passed login must match the authenticated user.
    expect(mockListInstallationsWithReposForUser).toHaveBeenCalledTimes(1);
    expect(mockListInstallationsWithReposForUser).toHaveBeenCalledWith('testuser');
  });

  it('returns whatever the scoped helper returns (including empty)', async () => {
    // A user with no accessible repos should get [], not the full list.
    mockResolveCliToken.mockResolvedValueOnce({ id: 'tok', userId: 42 });
    mockGetUser.mockResolvedValueOnce(bearerUser);
    mockListInstallationsWithReposForUser.mockResolvedValueOnce([]);

    const res = await app.request('/api/cli/repos', {
      headers: { authorization: 'Bearer cl_live_test' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { installations: unknown[] };
    expect(body.installations).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// GET /api/cli/review-prompt
// ---------------------------------------------------------------------

describe('GET /api/cli/review-prompt', () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/api/cli', cliAuthRoutes);

  const bearerUser = {
    userId: 42,
    login: 'testuser',
    avatarUrl: '',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    loginCount: 1,
    role: 'user' as const,
  };

  beforeEach(() => {
    mockResolveCliToken.mockReset();
    mockGetUser.mockReset();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await app.request('/api/cli/review-prompt');
    expect(res.status).toBe(401);
  });

  it('returns the SYSTEM_PROMPT to authed bearer callers', async () => {
    mockResolveCliToken.mockResolvedValueOnce({ id: 'tok', userId: 42 });
    mockGetUser.mockResolvedValueOnce(bearerUser);

    const res = await app.request('/api/cli/review-prompt', {
      headers: { authorization: 'Bearer cl_live_test' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { prompt: string };
    // Lock in that the endpoint returns the actual server prompt, not a
    // placeholder — the phrase below is the opening line of SYSTEM_PROMPT.
    // A refactor that swapped the source without updating this test would
    // catch our attention.
    expect(body.prompt).toContain('senior engineer reviewing a pull request');
    // Prompt is non-trivial — a length sanity check guards against a
    // regression that ships an empty string.
    expect(body.prompt.length).toBeGreaterThan(1000);
  });
});
