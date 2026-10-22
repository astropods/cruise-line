/**
 * Path and credential checks for the sandbox. Everything that turns caller
 * input into a filesystem path or a git invocation goes through here.
 */

import { readFile, realpath, stat } from 'fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'path';

/** Whether `path` is `root` or somewhere under it */
export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * The checkout directory for an `owner/repo/pr` path (relative, or absolute
 * under reposRoot), or null for anything else, including reposRoot itself.
 */
export function repoDirFor(reposRoot: string, repoPath: string | undefined): string | null {
  if (!repoPath) return null;
  const dir = resolve(reposRoot, repoPath);
  if (!isInside(reposRoot, dir)) return null;
  const parts = relative(reposRoot, dir).split(sep);
  if (parts.length !== 3 || !/^\d+$/.test(parts[2])) return null;
  return dir;
}

// Git internals hold remotes and hooks; .claude is the SDK session symlink
const HIDDEN_ROOTS = new Set(['.git', '.claude']);

/** A clean repo-relative file path, or null if it climbs out or points at git or session data */
export function repoFilePath(filePath: string | undefined): string | null {
  if (!filePath) return null;
  const path = filePath.replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\/+/g, '/');
  const parts = path.split('/');
  if (!path || parts.some((p) => p === '..' || p === '.')) return null;
  if (HIDDEN_ROOTS.has(parts[0])) return null;
  return path;
}

/**
 * Read a file from a checkout. Symlinks are followed only while they stay
 * inside the checkout and out of .git, since a PR can commit a link to
 * /proc/self/environ or another checkout.
 */
export async function readRepoFile(repoDir: string, filePath: string): Promise<string | undefined> {
  try {
    const root = await realpath(repoDir);
    const real = await realpath(join(root, filePath));
    if (!isInside(root, real) || HIDDEN_ROOTS.has(relative(root, real).split(sep)[0])) return undefined;
    if (!(await stat(real)).isFile()) return undefined;
    return await readFile(real, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Whether a Read, Glob, or Grep call stays inside the checkout. The SDK's
 * own tools accept absolute paths, so without this a prompt-injected agent
 * could read the API key from /proc or another tenant's checkout.
 */
export async function toolStaysInRepo(repoDir: string, toolName: string, input: Record<string, unknown>): Promise<boolean> {
  // A glob is matched against the search path, so an absolute or climbing one escapes it
  const glob = toolName === 'Glob' ? input.pattern : input.glob;
  if (typeof glob === 'string' && (!isPlainPath(glob) || isAbsolute(glob) || glob.split('/').includes('..'))) return false;

  const target = input.file_path ?? input.path;
  if (target === undefined || target === '') return true;
  if (typeof target !== 'string') return false;
  // The SDK trims a path and expands ~ before using it; this check has to see
  // the same path it will, so anything it would rewrite is refused outright
  if (!isPlainPath(target)) return false;

  const root = await realpath(repoDir).catch(() => resolve(repoDir));
  const resolved = resolve(root, target);
  const real = await realpath(resolved).catch(() => resolved);
  return isInside(root, real) && relative(root, real).split(sep)[0] !== '.git';
}

/**
 * A path the SDK will use exactly as written: no surrounding whitespace, no
 * leading ~ (which it expands to the home directory), no NUL bytes.
 */
function isPlainPath(path: string): boolean {
  return path === path.trim() && !path.startsWith('~') && !path.includes('\0');
}

/** An https clone URL with any embedded credentials split out */
export function splitCloneUrl(cloneUrl: string | undefined): { url: string; token?: string } | null {
  if (!cloneUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(cloneUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const token = parsed.password ? decodeURIComponent(parsed.password) : undefined;
  parsed.username = '';
  parsed.password = '';
  return { url: parsed.toString(), token };
}

/**
 * The environment for every git command. A checkout's .git is writable by
 * whatever runs in the sandbox (chat's Bash), so git must not run hooks or
 * fsmonitor from it, or read global and system config that could be planted
 * there. Config goes through the environment, so the token never lands in
 * .git/config or a process list, and the auth header is scoped to the
 * remote's origin: a URL rewrite can't send it anywhere else.
 */
export function gitEnv(auth?: { token: string; remoteUrl: string }): Record<string, string> {
  const config: [string, string][] = [
    ['core.hooksPath', '/dev/null'],
    ['core.fsmonitor', 'false'],
    // Only https remotes: no ext::, file://, or ssh commands
    ['protocol.allow', 'never'],
    ['protocol.https.allow', 'always'],
  ];
  if (auth) {
    const basic = Buffer.from(`x-access-token:${auth.token}`).toString('base64');
    config.push([`http.${new URL(auth.remoteUrl).origin}/.extraHeader`, `Authorization: Basic ${basic}`]);
  }
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: String(config.length),
  };
  config.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = value;
  });
  return env;
}

/**
 * A checkout's .git/config reduced to the remote. Anything else in it (URL
 * rewrites, includes, credential helpers) was written by something in the
 * sandbox, not by us.
 */
export function cleanGitConfig(remoteUrl: string): string {
  return [
    '[core]',
    '\trepositoryformatversion = 0',
    '\tfilemode = true',
    '\tbare = false',
    '[remote "origin"]',
    `\turl = ${remoteUrl}`,
    '\tfetch = +refs/heads/*:refs/remotes/origin/*',
    '',
  ].join('\n');
}

/** Strip credentials from text that's going back to a caller, like git's stderr */
export function redactCredentials(text: string, token?: string): string {
  let out = text.replace(/(https?:\/\/)[^/\s@]+@/g, '$1');
  if (token) out = out.split(token).join('[redacted]');
  return out;
}
