import { describe, expect, test } from 'bun:test';
import { toolCallDetail } from './toolCallDetail';

describe('toolCallDetail', () => {
  test('drops the tool prefix', () => {
    expect(toolCallDetail('Bash: git log --oneline')).toBe('git log --oneline');
  });

  test('drops a local clone path', () => {
    expect(toolCallDetail('Read: /Users/me/cruise-line/.cruise-data/repos/acme/api/42/src/index.ts')).toBe('src/index.ts');
  });

  test('drops a sandbox clone path', () => {
    expect(toolCallDetail('Read: /data/repos/acme/api/src/index.ts')).toBe('src/index.ts');
  });

  test('handles missing content', () => {
    expect(toolCallDetail(undefined)).toBe('');
  });
});
