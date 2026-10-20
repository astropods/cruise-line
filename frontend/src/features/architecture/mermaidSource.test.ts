import { describe, expect, test } from 'bun:test';
import { normalizeMermaidSource } from './mermaidSource';

describe('normalizeMermaidSource', () => {
  test('strips a mermaid fence', () => {
    expect(normalizeMermaidSource('```mermaid\nflowchart TD\n  A --> B\n```')).toBe('flowchart TD\n  A --> B');
  });

  test('strips a bare fence', () => {
    expect(normalizeMermaidSource('```\nsequenceDiagram\n```')).toBe('sequenceDiagram');
  });

  test('leaves unfenced source alone apart from trimming', () => {
    expect(normalizeMermaidSource('  flowchart LR\n  A --> B  ')).toBe('flowchart LR\n  A --> B');
  });
});
