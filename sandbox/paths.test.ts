import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  cleanGitConfig, gitEnv, readRepoFile, redactCredentials, repoDirFor, repoFilePath, splitCloneUrl, toolStaysInRepo,
} from './paths';

describe('repoDirFor', () => {
  const root = '/data/repos';

  test('accepts owner/repo/pr, relative or absolute', () => {
    expect(repoDirFor(root, 'acme/api/12')).toBe('/data/repos/acme/api/12');
    expect(repoDirFor(root, '/data/repos/acme/api/12')).toBe('/data/repos/acme/api/12');
  });

  test('rejects the root, partial paths, and escapes', () => {
    expect(repoDirFor(root, '.')).toBeNull();
    expect(repoDirFor(root, 'acme')).toBeNull();
    expect(repoDirFor(root, 'acme/api')).toBeNull();
    expect(repoDirFor(root, 'acme/api/not-a-number')).toBeNull();
    expect(repoDirFor(root, '../sessions/acme/api/12')).toBeNull();
    expect(repoDirFor(root, '/data/repos-old/acme/api/12')).toBeNull();
    expect(repoDirFor(root, undefined)).toBeNull();
  });
});

describe('repoFilePath', () => {
  test('normalizes leading ./ and slashes', () => {
    expect(repoFilePath('./src//index.ts')).toBe('src/index.ts');
    expect(repoFilePath('/src/index.ts')).toBe('src/index.ts');
  });

  test('rejects traversal and git or session data', () => {
    expect(repoFilePath('../other/x')).toBeNull();
    expect(repoFilePath('src/../../x')).toBeNull();
    expect(repoFilePath('.git/config')).toBeNull();
    expect(repoFilePath('./.git/config')).toBeNull();
    expect(repoFilePath('.claude/projects/x.jsonl')).toBeNull();
    expect(repoFilePath('')).toBeNull();
  });

  test('allows files that only look similar', () => {
    expect(repoFilePath('.github/workflows/ci.yml')).toBe('.github/workflows/ci.yml');
    expect(repoFilePath('docs/.git-notes.md')).toBe('docs/.git-notes.md');
  });
});

describe('files on disk', () => {
  let base: string;
  let repo: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'cl-paths-'));
    repo = join(base, 'repo');
    await mkdir(join(repo, 'src'), { recursive: true });
    await mkdir(join(repo, '.git'), { recursive: true });
    await writeFile(join(repo, 'src', 'a.ts'), 'inside');
    await writeFile(join(repo, '.git', 'config'), 'token');
    await writeFile(join(base, 'secret.txt'), 'outside');
    await symlink(join(base, 'secret.txt'), join(repo, 'escape.txt'));
    await symlink(join(repo, 'src', 'a.ts'), join(repo, 'alias.ts'));
    await symlink(join(repo, '.git', 'config'), join(repo, 'git-link'));
  });

  afterAll(() => rm(base, { recursive: true, force: true }));

  test('readRepoFile reads files and links that stay inside', async () => {
    expect(await readRepoFile(repo, 'src/a.ts')).toBe('inside');
    expect(await readRepoFile(repo, 'alias.ts')).toBe('inside');
  });

  test('readRepoFile refuses links out of the checkout or into .git', async () => {
    expect(await readRepoFile(repo, 'escape.txt')).toBeUndefined();
    expect(await readRepoFile(repo, 'git-link')).toBeUndefined();
    expect(await readRepoFile(repo, 'src')).toBeUndefined();
    expect(await readRepoFile(repo, 'missing.ts')).toBeUndefined();
  });

  test('toolStaysInRepo allows paths inside the checkout', async () => {
    expect(await toolStaysInRepo(repo, 'Read', { file_path: 'src/a.ts' })).toBe(true);
    expect(await toolStaysInRepo(repo, 'Read', { file_path: join(repo, 'src/a.ts') })).toBe(true);
    expect(await toolStaysInRepo(repo, 'Glob', { pattern: 'src/**/*.ts' })).toBe(true);
    expect(await toolStaysInRepo(repo, 'Grep', { pattern: '\\.\\./', path: 'src' })).toBe(true);
  });

  test('toolStaysInRepo denies paths that leave it', async () => {
    expect(await toolStaysInRepo(repo, 'Read', { file_path: '/proc/self/environ' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Read', { file_path: '../secret.txt' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Read', { file_path: 'escape.txt' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Read', { file_path: '.git/config' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Grep', { pattern: 'token', path: '/data' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Glob', { pattern: '/data/**/config' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Glob', { pattern: '../**' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Grep', { pattern: 'x', glob: '../**' })).toBe(false);
  });

  test('toolStaysInRepo denies paths the SDK would rewrite before using', async () => {
    // The SDK trims and expands ~, so these reach / and the home directory
    expect(await toolStaysInRepo(repo, 'Grep', { pattern: 'x', path: ' /data/repos' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Glob', { pattern: '*', path: '\t/' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Grep', { pattern: 'x', path: '~/.claude/projects' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Grep', { pattern: 'x', path: '~' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Read', { file_path: 'src/a.ts ' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Read', { file_path: 'src/a.ts\0' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Glob', { pattern: ' /data/**' })).toBe(false);
    expect(await toolStaysInRepo(repo, 'Glob', { pattern: '~/**' })).toBe(false);
  });
});

describe('clone credentials', () => {
  test('splitCloneUrl pulls the token out of the URL', () => {
    expect(splitCloneUrl('https://x-access-token:ghs_abc@github.com/acme/api.git')).toEqual({
      url: 'https://github.com/acme/api.git',
      token: 'ghs_abc',
    });
    expect(splitCloneUrl('https://github.com/acme/api.git')).toEqual({ url: 'https://github.com/acme/api.git', token: undefined });
  });

  test('splitCloneUrl only accepts https', () => {
    expect(splitCloneUrl('file:///etc')).toBeNull();
    expect(splitCloneUrl('--upload-pack=touch /tmp/x')).toBeNull();
    expect(splitCloneUrl('http://github.com/acme/api.git')).toBeNull();
  });

  test('gitEnv sends the token as a header scoped to the remote, never in config', () => {
    const env = gitEnv({ token: 'ghs_abc', remoteUrl: 'https://github.com/acme/api.git' });
    const entries = Object.fromEntries(
      Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, i) => [env[`GIT_CONFIG_KEY_${i}`], env[`GIT_CONFIG_VALUE_${i}`]]),
    );
    expect(entries['http.https://github.com/.extraHeader']).toBe(`Authorization: Basic ${Buffer.from('x-access-token:ghs_abc').toString('base64')}`);
    expect(entries['http.extraHeader']).toBeUndefined();
  });

  test('gitEnv turns off hooks, fsmonitor, other protocols, and global config', () => {
    const env = gitEnv();
    const keys = Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, i) => `${env[`GIT_CONFIG_KEY_${i}`]}=${env[`GIT_CONFIG_VALUE_${i}`]}`);
    expect(keys).toEqual(['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'protocol.allow=never', 'protocol.https.allow=always']);
    expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null');
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
  });

  test('cleanGitConfig keeps only the remote', () => {
    expect(cleanGitConfig('https://github.com/acme/api.git')).toContain('url = https://github.com/acme/api.git');
    expect(cleanGitConfig('https://github.com/acme/api.git')).not.toContain('insteadOf');
  });

  test('redactCredentials strips URL credentials and the token', () => {
    expect(redactCredentials("fatal: unable to access 'https://x-access-token:ghs_abc@github.com/a/b.git/'"))
      .toBe("fatal: unable to access 'https://github.com/a/b.git/'");
    expect(redactCredentials('Authorization: Basic ghs_abc', 'ghs_abc')).toBe('Authorization: Basic [redacted]');
  });
});
