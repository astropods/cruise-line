import { describe, it, expect } from 'bun:test';
// Imported from its own module: auth.test.ts mocks db/walkthroughs.ts for
// the whole test process, which would hide the real function.
import { replaceNul } from './db/replace-nul.js';

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
