import { describe, it, expect, mock } from 'bun:test';
import path from 'path';

// db/client evaluates postgres(config.db.url) at import; stub so it loads.
mock.module(path.resolve(import.meta.dir, './config.ts'), () => ({
  config: {
    db: { url: 'postgres://mock@localhost:5432/mock' },
  },
}));

const { normalizeScopePath, normalizeScopePaths, anyFileMatchesScope } =
  await import('./db/repo-settings.js');
const { normalizeScopePathClient } = await import(
  '../frontend/src/lib/scopePath.js'
);

describe('normalizeScopePath', () => {
  it('trims whitespace', () => {
    expect(normalizeScopePath('  agent  ')).toBe('agent');
  });

  it('returns "" for blank input', () => {
    expect(normalizeScopePath('')).toBe('');
    expect(normalizeScopePath('   ')).toBe('');
  });

  it('strips leading "./"', () => {
    expect(normalizeScopePath('./agent')).toBe('agent');
  });

  it('strips leading "/"', () => {
    expect(normalizeScopePath('/agent')).toBe('agent');
    expect(normalizeScopePath('///agent')).toBe('agent');
  });

  it('collapses repeated slashes', () => {
    expect(normalizeScopePath('agent//foo')).toBe('agent/foo');
    expect(normalizeScopePath('a///b///c')).toBe('a/b/c');
  });

  it('strips trailing slashes so directory and file entries share a form', () => {
    expect(normalizeScopePath('agent/')).toBe('agent');
    expect(normalizeScopePath('agent//')).toBe('agent');
  });

  it('preserves file-shaped entries verbatim', () => {
    expect(normalizeScopePath('Makefile')).toBe('Makefile');
    expect(normalizeScopePath('.github/workflows/deploy.yml')).toBe(
      '.github/workflows/deploy.yml',
    );
  });
});

describe('normalizeScopePaths', () => {
  it('filters out blank entries', () => {
    expect(normalizeScopePaths(['agent', '', '   ', 'frontend'])).toEqual([
      'agent',
      'frontend',
    ]);
  });

  it('deduplicates after normalization', () => {
    expect(normalizeScopePaths(['agent', 'agent/', './agent', '/agent'])).toEqual([
      'agent',
    ]);
  });

  it('preserves order of first occurrence', () => {
    expect(normalizeScopePaths(['frontend', 'agent', 'frontend/'])).toEqual([
      'frontend',
      'agent',
    ]);
  });
});

describe('anyFileMatchesScope', () => {
  it('matches every file when scope is empty', () => {
    expect(anyFileMatchesScope(['whatever.ts'], [])).toBe(true);
    expect(anyFileMatchesScope([], [])).toBe(true);
  });

  it('returns false when scope is set but no files match', () => {
    expect(anyFileMatchesScope(['frontend/foo.ts'], ['agent'])).toBe(false);
  });

  it('matches directory scope by prefix', () => {
    expect(anyFileMatchesScope(['agent/foo.ts'], ['agent'])).toBe(true);
    expect(anyFileMatchesScope(['agent/db/x.ts', 'other.ts'], ['agent'])).toBe(true);
  });

  it('does NOT treat a scope as a plain string prefix — no sibling false positives', () => {
    // `agent-other/` starts with `agent` textually, but is a different directory.
    // The old implementation with a plain `startsWith` would have matched this.
    expect(anyFileMatchesScope(['agent-other/foo.ts'], ['agent'])).toBe(false);
  });

  it('matches an exact file scope', () => {
    expect(anyFileMatchesScope(['Makefile'], ['Makefile'])).toBe(true);
    expect(anyFileMatchesScope(['docs/other.md'], ['Makefile'])).toBe(false);
  });

  it('does not match file-scope entries against differently-named siblings', () => {
    // Guards against `Makefile.old`, `Makefile-generated`, etc.
    expect(anyFileMatchesScope(['Makefile.old'], ['Makefile'])).toBe(false);
  });

  it('supports mixed directory + file scopes', () => {
    const scope = ['agent', '.github/workflows/deploy.yml'];
    expect(anyFileMatchesScope(['agent/index.ts'], scope)).toBe(true);
    expect(anyFileMatchesScope(['.github/workflows/deploy.yml'], scope)).toBe(true);
    expect(anyFileMatchesScope(['.github/workflows/other.yml'], scope)).toBe(false);
  });

  it('matches when any single file in a multi-file PR falls in scope', () => {
    expect(
      anyFileMatchesScope(
        ['docs/README.md', 'agent/foo.ts', 'frontend/bar.tsx'],
        ['agent'],
      ),
    ).toBe(true);
  });
});

describe('client/server normalize parity', () => {
  const inputs = [
    '',
    '   ',
    'agent',
    '  agent  ',
    'agent/',
    'agent//',
    './agent',
    '/agent',
    '///agent',
    'agent//foo',
    'a///b///c',
    'Makefile',
    '.github/workflows/deploy.yml',
    'packages/api/',
    './packages/api/',
    '/packages/api',
    'a/b/c/',
  ];

  for (const input of inputs) {
    it(`agrees on ${JSON.stringify(input)}`, () => {
      expect(normalizeScopePathClient(input)).toBe(normalizeScopePath(input));
    });
  }
});
