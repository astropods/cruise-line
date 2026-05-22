/**
 * Tests for the repo-access permission system:
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
  verifySessionToken: mock(),
}));

mock.module(path.resolve(import.meta.dir, './db/sessions.ts'), () => ({
  isSessionRevoked: mock(),
}));

// Suppress console.error from the error-path tests
spyOn(console, 'error').mockImplementation(() => {});

const { verifyRepoAccess } = await import('./github/client.js');
const { requireRepoAccess } = await import('./middleware/session.js');

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

// Default: getRepoInstallation always succeeds
function setupInstallationMock() {
  mockGetRepoInstallation.mockResolvedValue({ data: { id: 12345 } });
}

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
