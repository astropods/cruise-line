/**
 * Tests for the auth & permission system:
 *   - requireAuth (session validation + GitHub token refresh)
 *   - verifyRepoAccess (GitHub App installation-based permission check)
 *   - requireRepoAccess (Hono middleware that gates routes)
 */
import { describe, it, expect, mock, beforeEach, spyOn } from 'bun:test';
import path from 'path';
import type { SessionPayload } from './github/oauth.js';
import { AppError } from './middleware/error.js';

// --- Mocks -----------------------------------------------------------

const mockGetPermissionLevel = mock();
const mockGetRepoInstallation = mock();
const mockVerifySessionToken = mock();
const mockRefreshGitHubToken = mock();
const mockCreateSessionToken = mock(() => Promise.resolve('fake-session-token'));
const mockSetSessionCookie = mock();
const mockIsSessionRevoked = mock();
const mockGetUser = mock();
const mockTouchUser = mock(() => Promise.resolve());
const mockResolveCliToken = mock(() => Promise.resolve(null as any));
const mockTouchCliTokenUsed = mock(() => Promise.resolve());

// Octokit constructor — used by getInstallationForRepo
mock.module('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    apps = { getRepoInstallation: mockGetRepoInstallation };
  },
}));

mock.module(path.resolve(import.meta.dir, './config.ts'), () => ({
  config: {
    github: { baseUrl: 'https://api.github.com' },
    session: { cookieName: 'cruise_session' },
  },
}));

mock.module(path.resolve(import.meta.dir, './github/app.ts'), () => ({
  generateAppJwt: mock(() => Promise.resolve('fake-jwt')),
  getInstallationToken: mock(() => Promise.resolve('fake-installation-token')),
  createInstallationOctokit: mock(() => ({
    repos: { getCollaboratorPermissionLevel: mockGetPermissionLevel },
  })),
}));

mock.module(path.resolve(import.meta.dir, './github/oauth.ts'), () => ({
  verifySessionToken: mockVerifySessionToken,
  refreshGitHubToken: mockRefreshGitHubToken,
  createSessionToken: mockCreateSessionToken,
  setSessionCookie: mockSetSessionCookie,
}));

mock.module(path.resolve(import.meta.dir, './db/sessions.ts'), () => ({
  isSessionRevoked: mockIsSessionRevoked,
}));

mock.module(path.resolve(import.meta.dir, './db/users.ts'), () => ({
  getUser: mockGetUser,
  touchUser: mockTouchUser,
}));

mock.module(path.resolve(import.meta.dir, './db/cli-tokens.ts'), () => ({
  resolveCliToken: mockResolveCliToken,
  touchCliTokenUsed: mockTouchCliTokenUsed,
}));

// Suppress console.error from the error-path tests
spyOn(console, 'error').mockImplementation(() => {});

const { verifyRepoAccess } = await import('./github/client.js');
const {
  requireAuth,
  requireOwner,
  requireRepoAccess,
  requireCookieSession,
} = await import('./middleware/session.js');

// --- Helpers ---------------------------------------------------------

const fakeSession: SessionPayload = {
  githubToken: 'ghp_fake',
  userId: 42,
  login: 'testuser',
  avatarUrl: 'https://example.com/avatar.png',
};

function createContext(
  params: Record<string, string> = {},
  session: SessionPayload = fakeSession,
) {
  const store = new Map<string, unknown>([['session', session]]);
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    req: { param: (name: string) => params[name] },
  } as any;
}

function createAuthContext(cookie?: string, requestHeaders: Record<string, string> = {}) {
  const headers = new Map<string, string>();
  const store = new Map<string, unknown>();
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    header: (name: string, value: string) => headers.set(name, value),
    _headers: headers,
    // getCookie reads from the cookie jar; we simulate via the mock config's cookieName
    req: {
      raw: {
        headers: new Headers(cookie ? { Cookie: `cruise_session=${cookie}` } : {}),
      },
      header: (name: string) => requestHeaders[name.toLowerCase()],
    },
  } as any;
}

// Default: getRepoInstallation always succeeds
function setupInstallationMock() {
  mockGetRepoInstallation.mockResolvedValue({ data: { id: 12345 } });
}

// =====================================================================
// requireAuth — session validation + GitHub token refresh
// =====================================================================

describe('requireAuth', () => {
  beforeEach(() => {
    mockVerifySessionToken.mockReset();
    mockRefreshGitHubToken.mockReset();
    mockCreateSessionToken.mockReset();
    mockSetSessionCookie.mockReset();
    mockIsSessionRevoked.mockReset();
    mockCreateSessionToken.mockResolvedValue('new-session-token');
    mockIsSessionRevoked.mockResolvedValue(false);
  });

  it('throws 401 when no cookie is present', async () => {
    const c = createAuthContext(); // no cookie
    const next = mock();

    try {
      await requireAuth(c, next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 401 when session token is invalid', async () => {
    mockVerifySessionToken.mockResolvedValueOnce(null);
    const c = createAuthContext('bad-token');
    const next = mock();

    try {
      await requireAuth(c, next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through without refresh when token is not expired', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    mockVerifySessionToken.mockResolvedValueOnce({
      ...fakeSession,
      refreshToken: 'rt_valid',
      githubTokenExpiresAt: futureExpiry,
    });
    const c = createAuthContext('valid-token');
    const next = mock().mockResolvedValue(undefined);

    await requireAuth(c, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRefreshGitHubToken).not.toHaveBeenCalled();
  });

  it('passes through without refresh for legacy sessions (no refresh token)', async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // expired 1 hour ago
    mockVerifySessionToken.mockResolvedValueOnce({
      ...fakeSession,
      githubTokenExpiresAt: pastExpiry,
      // no refreshToken
    });
    const c = createAuthContext('legacy-token');
    const next = mock().mockResolvedValue(undefined);

    await requireAuth(c, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRefreshGitHubToken).not.toHaveBeenCalled();
  });

  it('refreshes token when expired and sets a new cookie', async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 3600;
    mockVerifySessionToken.mockResolvedValueOnce({
      ...fakeSession,
      refreshToken: 'rt_old',
      githubTokenExpiresAt: pastExpiry,
    });
    mockRefreshGitHubToken.mockResolvedValueOnce({
      accessToken: 'ghp_new',
      refreshToken: 'rt_new',
      expiresAt: pastExpiry + 36000,
    });

    const c = createAuthContext('expiring-token');
    const next = mock().mockResolvedValue(undefined);

    await requireAuth(c, next);

    expect(mockRefreshGitHubToken).toHaveBeenCalledWith('rt_old');
    expect(mockCreateSessionToken).toHaveBeenCalledTimes(1);
    expect(mockSetSessionCookie).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refreshes token within the 5-minute buffer window', async () => {
    // Token expires in 2 minutes — within the 5-minute buffer
    const soonExpiry = Math.floor(Date.now() / 1000) + 120;
    mockVerifySessionToken.mockResolvedValueOnce({
      ...fakeSession,
      refreshToken: 'rt_soon',
      githubTokenExpiresAt: soonExpiry,
    });
    mockRefreshGitHubToken.mockResolvedValueOnce({
      accessToken: 'ghp_refreshed',
      refreshToken: 'rt_refreshed',
      expiresAt: soonExpiry + 28800,
    });

    const c = createAuthContext('soon-expiring-token');
    const next = mock().mockResolvedValue(undefined);

    await requireAuth(c, next);

    expect(mockRefreshGitHubToken).toHaveBeenCalledWith('rt_soon');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 401 when refresh fails', async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 3600;
    mockVerifySessionToken.mockResolvedValueOnce({
      ...fakeSession,
      refreshToken: 'rt_invalid',
      githubTokenExpiresAt: pastExpiry,
    });
    mockRefreshGitHubToken.mockRejectedValueOnce(new Error('Token refresh failed: bad_refresh_token'));

    const c = createAuthContext('expired-token');
    const next = mock();

    try {
      await requireAuth(c, next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
  });
});

// =====================================================================
// requireAuth — Bearer (CLI-token) branch
// =====================================================================

const fakeUserRecord = {
  userId: 42,
  login: 'testuser',
  avatarUrl: 'https://example.com/avatar.png',
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  loginCount: 1,
  role: 'user' as const,
};

describe('requireAuth — Bearer branch', () => {
  beforeEach(() => {
    mockResolveCliToken.mockReset();
    mockTouchCliTokenUsed.mockReset();
    mockTouchCliTokenUsed.mockResolvedValue(undefined);
    mockGetUser.mockReset();
    mockVerifySessionToken.mockReset();
  });

  it('accepts a valid Bearer token and synthesizes a session with empty githubToken', async () => {
    mockResolveCliToken.mockResolvedValueOnce({ id: 'tok_1', userId: 42 });
    mockGetUser.mockResolvedValueOnce(fakeUserRecord);

    const c = createAuthContext(undefined, { authorization: 'Bearer cl_live_abc' });
    const next = mock().mockResolvedValue(undefined);

    await requireAuth(c, next);

    expect(next).toHaveBeenCalledTimes(1);
    const session = c.get('session') as SessionPayload;
    expect(session.userId).toBe(42);
    // Bearer sessions never carry a GitHub OAuth token — this is what
    // requireCookieSession relies on to gate GitHub-write routes.
    expect(session.githubToken).toBe('');
    expect(c.get('authKind')).toBe('cli');
    expect(mockResolveCliToken).toHaveBeenCalledWith('cl_live_abc');
  });

  it('rejects unknown Bearer tokens with 401', async () => {
    mockResolveCliToken.mockResolvedValueOnce(null);

    const c = createAuthContext(undefined, { authorization: 'Bearer cl_live_bogus' });
    const next = mock();

    try {
      await requireAuth(c, next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a Bearer token whose user was deleted with 401', async () => {
    mockResolveCliToken.mockResolvedValueOnce({ id: 'tok_1', userId: 42 });
    mockGetUser.mockResolvedValueOnce(null);

    const c = createAuthContext(undefined, { authorization: 'Bearer cl_live_orphan' });
    const next = mock();

    try {
      await requireAuth(c, next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('bypasses cookie verification when a Bearer header is present', async () => {
    mockResolveCliToken.mockResolvedValueOnce({ id: 'tok_1', userId: 42 });
    mockGetUser.mockResolvedValueOnce(fakeUserRecord);

    // Cookie is also set, but Bearer takes precedence — verifySessionToken
    // must not be called on Bearer paths.
    const c = createAuthContext('some-cookie-value', {
      authorization: 'Bearer cl_live_abc',
    });
    const next = mock().mockResolvedValue(undefined);

    await requireAuth(c, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockVerifySessionToken).not.toHaveBeenCalled();
  });

  it('is case-insensitive on the Authorization header scheme', async () => {
    mockResolveCliToken.mockResolvedValueOnce({ id: 'tok_1', userId: 42 });
    mockGetUser.mockResolvedValueOnce(fakeUserRecord);

    const c = createAuthContext(undefined, { authorization: 'bearer cl_live_lc' });
    const next = mock().mockResolvedValue(undefined);

    await requireAuth(c, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockResolveCliToken).toHaveBeenCalledWith('cl_live_lc');
  });
});

// =====================================================================
// requireCookieSession — gates GitHub-write routes from Bearer callers
// =====================================================================

describe('requireCookieSession', () => {
  it('lets cookie sessions through', async () => {
    const c = createContext();
    c.set('authKind', 'cookie');
    const next = mock().mockResolvedValue(undefined);

    await requireCookieSession(c, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects CLI-token sessions with 403', async () => {
    const c = createContext();
    c.set('authKind', 'cli');
    const next = mock();

    try {
      await requireCookieSession(c, next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when authKind is unset (defense-in-depth)', async () => {
    const c = createContext(); // no authKind set
    const next = mock();

    try {
      await requireCookieSession(c, next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
    expect(next).not.toHaveBeenCalled();
  });
});

// =====================================================================
// verifyRepoAccess — unit tests for the GitHub App permission check
// =====================================================================

describe('verifyRepoAccess', () => {
  beforeEach(() => {
    mockGetPermissionLevel.mockReset();
    mockGetRepoInstallation.mockReset();
    setupInstallationMock();
  });

  // --- should grant access ---

  it('grants access to collaborators with write permission', async () => {
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'write' },
    });

    expect(await verifyRepoAccess('acme', 'app', 'testuser')).toBe(true);
  });

  it('grants access to maintainers', async () => {
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'maintain' },
    });

    expect(await verifyRepoAccess('acme', 'app', 'testuser')).toBe(true);
  });

  it('grants access to admins', async () => {
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'admin' },
    });

    expect(await verifyRepoAccess('acme', 'app', 'testuser')).toBe(true);
  });

  // --- should deny access ---

  it('denies access to users with only read permission (public repo viewer)', async () => {
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'read' },
    });

    expect(await verifyRepoAccess('acme', 'app', 'testuser')).toBe(false);
  });

  it('denies access to users with none permission', async () => {
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'none' },
    });

    expect(await verifyRepoAccess('acme', 'app', 'testuser')).toBe(false);
  });

  it('denies access when the API returns 404 (no access)', async () => {
    mockGetPermissionLevel.mockRejectedValueOnce({ status: 404, message: 'Not Found' });

    expect(await verifyRepoAccess('acme', 'private-repo', 'testuser')).toBe(false);
  });

  it('denies access when getInstallationForRepo fails (app not installed)', async () => {
    mockGetRepoInstallation.mockReset();
    mockGetRepoInstallation.mockRejectedValueOnce({ status: 404, message: 'Not Found' });

    expect(await verifyRepoAccess('acme', 'app', 'testuser')).toBe(false);
  });

  // --- correct API usage ---

  it('forwards owner, repo, and username to the GitHub API call', async () => {
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'write' },
    });

    await verifyRepoAccess('my-org', 'my-repo', 'someuser');

    expect(mockGetPermissionLevel).toHaveBeenCalledWith({
      owner: 'my-org',
      repo: 'my-repo',
      username: 'someuser',
    });
  });
});

// =====================================================================
// requireRepoAccess — middleware integration tests
// =====================================================================

describe('requireRepoAccess', () => {
  // Unique owner/repo per test so the module-level access cache doesn't bleed.
  let seq = 0;
  function uniqueRepo() {
    seq++;
    return { owner: `org-${seq}`, repo: `repo-${seq}` };
  }

  beforeEach(() => {
    mockGetPermissionLevel.mockReset();
    mockGetRepoInstallation.mockReset();
    setupInstallationMock();
  });

  it('calls next() when the user is a collaborator', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock().mockResolvedValue(undefined);
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'write' },
    });

    await requireRepoAccess(createContext({ owner, repo }), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when the user is not a collaborator', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock();
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'read' },
    });

    try {
      await requireRepoAccess(createContext({ owner, repo }), next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).message).toContain('collaborator');
    }

    expect(next).not.toHaveBeenCalled();
  });

  it('throws 403 when the API call fails (no access)', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock();
    mockGetPermissionLevel.mockRejectedValueOnce({ status: 404, message: 'Not Found' });

    try {
      await requireRepoAccess(createContext({ owner, repo }), next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }

    expect(next).not.toHaveBeenCalled();
  });

  it('throws 400 when owner param is missing', async () => {
    const next = mock();

    try {
      await requireRepoAccess(createContext({ repo: 'some-repo' }), next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }

    expect(next).not.toHaveBeenCalled();
  });

  it('throws 400 when repo param is missing', async () => {
    const next = mock();

    try {
      await requireRepoAccess(createContext({ owner: 'some-owner' }), next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }

    expect(next).not.toHaveBeenCalled();
  });

  it('uses cached result on repeated calls (skips GitHub API)', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock().mockResolvedValue(undefined);
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'write' },
    });

    // First call populates cache
    await requireRepoAccess(createContext({ owner, repo }), next);
    // Second call should hit cache — no extra API call
    await requireRepoAccess(createContext({ owner, repo }), next);

    expect(mockGetPermissionLevel).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('does not cache denied access', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock().mockResolvedValue(undefined);

    // First call — denied (read-only)
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'read' },
    });
    try {
      await requireRepoAccess(createContext({ owner, repo }), next);
    } catch { /* expected */ }

    // Promote the user to collaborator
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'write' },
    });
    await requireRepoAccess(createContext({ owner, repo }), next);

    // Should have called the API both times (no stale deny cached)
    expect(mockGetPermissionLevel).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('isolates cache per user', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock().mockResolvedValue(undefined);
    const otherSession: SessionPayload = { ...fakeSession, userId: 99, login: 'otheruser' };

    // User 42 is a collaborator
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'write' },
    });
    await requireRepoAccess(createContext({ owner, repo }, fakeSession), next);

    // User 99 is not — should still call the API, not reuse user 42's cache
    mockGetPermissionLevel.mockResolvedValueOnce({
      data: { permission: 'read' },
    });
    try {
      await requireRepoAccess(createContext({ owner, repo }, otherSession), next);
    } catch { /* expected */ }

    expect(mockGetPermissionLevel).toHaveBeenCalledTimes(2);
  });
});

// =====================================================================
// requireOwner — users.role === 'owner' is the gate
// =====================================================================

describe('requireOwner', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("calls next() when the session user holds the 'owner' role", async () => {
    mockGetUser.mockResolvedValueOnce({
      userId: fakeSession.userId,
      login: fakeSession.login,
      avatarUrl: fakeSession.avatarUrl,
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      loginCount: 1,
      role: 'owner',
    });
    const next = mock().mockResolvedValue(undefined);

    await requireOwner(createContext(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when the user has no row in the users table yet', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const next = mock();

    try {
      await requireOwner(createContext(), next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("throws 403 when the user exists but has the 'user' role", async () => {
    mockGetUser.mockResolvedValueOnce({
      userId: fakeSession.userId,
      login: fakeSession.login,
      avatarUrl: fakeSession.avatarUrl,
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      loginCount: 1,
      role: 'user',
    });
    const next = mock();

    try {
      await requireOwner(createContext(), next);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
    expect(next).not.toHaveBeenCalled();
  });
});
