import { mkdir, rm, symlink, readlink, lstat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';
import { getInstallationToken } from '../github/app.js';

// Per-PR mutex to prevent concurrent clone operations
const cloneLocks = new Map<string, Promise<string>>();

function lockKey(owner: string, repo: string, prNumber: number): string {
  return `${owner}/${repo}#${prNumber}`;
}

function getDataRoot(): string {
  return config.port === 80 ? '/data' : join(process.cwd(), '.cruise-data');
}

export function getRepoDir(owner: string, repo: string, prNumber: number): string {
  return join(getDataRoot(), 'repos', owner, repo, String(prNumber));
}

export function getSessionDir(owner: string, repo: string, prNumber: number): string {
  return join(getDataRoot(), 'sessions', owner, repo, String(prNumber));
}

async function exec(cmd: string[], cwd?: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const result = await exec(['git', 'rev-parse', '--git-dir'], dir);
    return result.ok;
  } catch {
    return false;
  }
}

async function getCurrentSha(dir: string): Promise<string | null> {
  const result = await exec(['git', 'rev-parse', 'HEAD'], dir);
  return result.ok ? result.stdout : null;
}

async function ensureSymlink(repoDir: string, sessionDir: string): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  const linkPath = join(repoDir, '.claude');

  try {
    const stat = await lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const target = await readlink(linkPath);
      if (target === sessionDir) return; // Already correct
    }
    // Wrong target or not a symlink — remove and recreate
    await rm(linkPath, { recursive: true, force: true });
  } catch {
    // Doesn't exist, that's fine
  }

  await symlink(sessionDir, linkPath);
}

async function cloneFresh(
  repoDir: string,
  owner: string,
  repo: string,
  headRef: string,
  installationId: number,
): Promise<void> {
  const token = await getInstallationToken(installationId);
  const host = new URL(config.github.htmlUrl).host;
  const cloneUrl = `https://x-access-token:${token}@${host}/${owner}/${repo}.git`;

  // Ensure parent directory exists
  await mkdir(repoDir, { recursive: true });
  // Remove any remnants
  await rm(repoDir, { recursive: true, force: true });
  await mkdir(repoDir, { recursive: true });

  const result = await exec(
    ['git', 'clone', '--depth=50', '--single-branch', '--branch', headRef, cloneUrl, '.'],
    repoDir,
  );

  if (!result.ok) {
    throw new Error(`git clone failed: ${result.stderr}`);
  }
}

async function updateClone(repoDir: string, headSha: string): Promise<boolean> {
  // Fetch all refs
  const fetchResult = await exec(['git', 'fetch', 'origin', '--depth=50'], repoDir);
  if (!fetchResult.ok) return false;

  // Try to checkout the target SHA
  const checkoutResult = await exec(['git', 'checkout', headSha], repoDir);
  return checkoutResult.ok;
}

/**
 * Ensure a clone exists at the correct SHA. Self-heals on missing, stale, or corrupted clones.
 * Returns the absolute path to the ready-to-use clone directory.
 */
export async function ensureClone(
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  headRef: string,
  installationId: number,
): Promise<string> {
  const key = lockKey(owner, repo, prNumber);

  // Mutex: if a clone operation is already in progress for this PR, wait for it
  const existing = cloneLocks.get(key);
  if (existing) {
    await existing;
  }

  const repoDir = getRepoDir(owner, repo, prNumber);
  const sessionDir = getSessionDir(owner, repo, prNumber);

  const doWork = async (): Promise<string> => {
    try {
      // Check if clone exists and is a git repo
      if (await isGitRepo(repoDir)) {
        const currentSha = await getCurrentSha(repoDir);

        if (currentSha === headSha) {
          // Clone is at correct SHA — just ensure symlink
          await ensureSymlink(repoDir, sessionDir);
          return repoDir;
        }

        // Clone exists but at wrong SHA — try to update
        console.log(`Updating clone for ${owner}/${repo}#${prNumber} to ${headSha.slice(0, 7)}`);
        const updated = await updateClone(repoDir, headSha);
        if (updated) {
          await ensureSymlink(repoDir, sessionDir);
          return repoDir;
        }

        // Update failed — fall through to fresh clone
        console.warn(`Update failed for ${owner}/${repo}#${prNumber}, recloning`);
      }

      // Clone missing or corrupted — clone fresh
      console.log(`Cloning ${owner}/${repo}#${prNumber} at ${headSha.slice(0, 7)}`);
      await cloneFresh(repoDir, owner, repo, headRef, installationId);

      // Fetch base branch for diff context
      await exec(['git', 'fetch', 'origin', '--depth=50'], repoDir);

      await ensureSymlink(repoDir, sessionDir);
      return repoDir;
    } catch (err) {
      // If anything goes wrong, try one more time with a clean slate
      console.error(`Clone error for ${owner}/${repo}#${prNumber}, retrying:`, err);
      await rm(repoDir, { recursive: true, force: true }).catch(() => {});
      await cloneFresh(repoDir, owner, repo, headRef, installationId);
      await ensureSymlink(repoDir, sessionDir);
      return repoDir;
    }
  };

  const promise = doWork().finally(() => {
    cloneLocks.delete(key);
  });

  cloneLocks.set(key, promise);
  return promise;
}

/**
 * Clean up a clone and its session data. Called when a PR is closed.
 */
export async function cleanupClone(owner: string, repo: string, prNumber: number): Promise<void> {
  const repoDir = getRepoDir(owner, repo, prNumber);
  const sessionDir = getSessionDir(owner, repo, prNumber);

  await rm(repoDir, { recursive: true, force: true }).catch(() => {});
  await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

  console.log(`Cleaned up clone for ${owner}/${repo}#${prNumber}`);
}
