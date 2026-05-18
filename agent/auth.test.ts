/**
 * Tests for the repo-access permission system:
 *   - verifyRepoAccess (GitHub API permission check)
 *   - requireRepoAccess (Hono middleware that gates routes)
 */
import { describe, it, expect, mock, beforeEach, spyOn } from 'bun:test';
import path from 'path';
import type { SessionPayload } from './github/oauth.js';
import { AppError } from './middleware/error.js';

// --- Mocks -----------------------------------------------------------

const mockReposGet = mock();

mock.module('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    repos = { get: mockReposGet };
  },
}));

mock.module(path.resolve(import.meta.dir, './config.ts'), () => ({
  config: {
    github: { baseUrl: 'https://api.github.com' },
    session: { cookieName: 'cruise_session' },
  },
}));

mock.module(path.resolve(import.meta.dir, './github/app.ts'), () => ({
  getInstallationToken: mock(),
  createInstallationOctokit: mock(),
}));

mock.module(path.resolve(import.meta.dir, './github/oauth.ts'), () => ({
  verifySessionToken: mock(),
}));

mock.module(path.resolve(import.meta.dir, './db/sessions.ts'), () => ({
  isSessionRevoked: mock(),
}));

// Suppress console.error from the error-path tests
spyOn(console, 'error').mockImplementation(() => {});

const { verifyRepoAccess } = await import('./github/client.ts');
const { requireRepoAccess } = await import('./middleware/session.ts');

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

// =====================================================================
// verifyRepoAccess — unit tests for the GitHub API permission check
// =====================================================================

describe('verifyRepoAccess', () => {
  beforeEach(() => {
    mockReposGet.mockReset();
  });

  // --- should grant access ---

  it('grants access to collaborators with push permission', async () => {
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: true, pull: true } },
    });

    expect(await verifyRepoAccess('tok', 'acme', 'app')).toBe(true);
  });

  it('grants access to admins', async () => {
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: true, push: true, pull: true } },
    });

    expect(await verifyRepoAccess('tok', 'acme', 'app')).toBe(true);
  });

  // --- should deny access ---

  it('denies access to users with only read/pull permission (public repo viewer)', async () => {
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: false, pull: true } },
    });

    expect(await verifyRepoAccess('tok', 'acme', 'app')).toBe(false);
  });

  it('denies access when permissions field is undefined', async () => {
    mockReposGet.mockResolvedValueOnce({ data: {} });

    expect(await verifyRepoAccess('tok', 'acme', 'app')).toBe(false);
  });

  it('denies access when permissions field is null', async () => {
    mockReposGet.mockResolvedValueOnce({ data: { permissions: null } });

    expect(await verifyRepoAccess('tok', 'acme', 'app')).toBe(false);
  });

  it('denies access when the API returns 404 (private repo, no access)', async () => {
    mockReposGet.mockRejectedValueOnce({ status: 404, message: 'Not Found' });

    expect(await verifyRepoAccess('tok', 'acme', 'private-repo')).toBe(false);
  });

  it('denies access when the API returns 401 (bad or expired token)', async () => {
    mockReposGet.mockRejectedValueOnce({ status: 401, message: 'Bad credentials' });

    expect(await verifyRepoAccess('tok', 'acme', 'app')).toBe(false);
  });

  // --- correct API usage ---

  it('forwards owner and repo to the GitHub API call', async () => {
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: true, pull: true } },
    });

    await verifyRepoAccess('tok', 'my-org', 'my-repo');

    expect(mockReposGet).toHaveBeenCalledWith({ owner: 'my-org', repo: 'my-repo' });
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
    mockReposGet.mockReset();
  });

  it('calls next() when the user is a collaborator', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock().mockResolvedValue(undefined);
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: true, pull: true } },
    });

    await requireRepoAccess(createContext({ owner, repo }), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when the user is not a collaborator', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock();
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: false, pull: true } },
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

  it('throws 403 when the API call fails (private repo, no access)', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock();
    mockReposGet.mockRejectedValueOnce({ status: 404, message: 'Not Found' });

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
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: true, pull: true } },
    });

    // First call populates cache
    await requireRepoAccess(createContext({ owner, repo }), next);
    // Second call should hit cache — no extra API call
    await requireRepoAccess(createContext({ owner, repo }), next);

    expect(mockReposGet).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('does not cache denied access', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock().mockResolvedValue(undefined);

    // First call — denied (read-only)
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: false, pull: true } },
    });
    try {
      await requireRepoAccess(createContext({ owner, repo }), next);
    } catch { /* expected */ }

    // Promote the user to collaborator
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: true, pull: true } },
    });
    await requireRepoAccess(createContext({ owner, repo }), next);

    // Should have called the API both times (no stale deny cached)
    expect(mockReposGet).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('isolates cache per user', async () => {
    const { owner, repo } = uniqueRepo();
    const next = mock().mockResolvedValue(undefined);
    const otherSession: SessionPayload = { ...fakeSession, userId: 99 };

    // User 42 is a collaborator
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: true, pull: true } },
    });
    await requireRepoAccess(createContext({ owner, repo }, fakeSession), next);

    // User 99 is not — should still call the API, not reuse user 42's cache
    mockReposGet.mockResolvedValueOnce({
      data: { permissions: { admin: false, push: false, pull: true } },
    });
    try {
      await requireRepoAccess(createContext({ owner, repo }, otherSession), next);
    } catch { /* expected */ }

    expect(mockReposGet).toHaveBeenCalledTimes(2);
  });
});
