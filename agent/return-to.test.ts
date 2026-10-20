import { describe, it, expect } from 'bun:test';
import { safeReturnTo } from './routes/return-to.js';

describe('safeReturnTo', () => {
  it('keeps paths on this site, with their query', () => {
    expect(safeReturnTo('/settings')).toBe('/settings');
    expect(safeReturnTo('/cli/authorize?client_id=x&state=y')).toBe('/cli/authorize?client_id=x&state=y');
  });

  it('falls back to / for anything that leaves the site', () => {
    for (const raw of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/\t/evil.example',
      ' /settings',
      '',
      null,
      undefined,
    ]) {
      expect(safeReturnTo(raw)).toBe('/');
    }
  });
});
