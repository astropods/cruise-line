import { describe, it, expect, mock } from 'bun:test';
import path from 'path';

// db/client evaluates postgres(config.db.url) at import; stub so it loads.
mock.module(path.resolve(import.meta.dir, './config.ts'), () => ({
  config: {
    db: { url: 'postgres://mock@localhost:5432/mock' },
  },
}));

const { replaceNul } = await import('./db/walkthroughs.js');

describe('replaceNul', () => {
  it('replaces raw NUL bytes in nested patch strings', () => {
    const patch = '-  .join("\u0000")\n+  .join("\\u0000")';
    const out = replaceNul({ files: { 'a.tsx': { patch, language: 'tsx' } } });
    expect(out.files['a.tsx'].patch).toBe('-  .join("␀")\n+  .join("\\u0000")');
    expect(out.files['a.tsx'].patch.length).toBe(patch.length);
  });

  it('leaves the literal text \\u0000 alone', () => {
    expect(replaceNul('join("\\u0000")')).toBe('join("\\u0000")');
  });

  it('serializes to JSON without a \\u0000 escape', () => {
    const json = JSON.stringify(replaceNul({ a: ['x\u0000y'], 'k\u0000': 1, n: null, b: true }));
    expect(json).not.toContain('\\u0000');
    expect(JSON.parse(json)).toEqual({ a: ['x␀y'], 'k␀': 1, n: null, b: true });
  });
});
