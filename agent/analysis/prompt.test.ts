/**
 * Tests for buildUserPrompt's Repository Review Rules block.
 */
import { describe, it, expect } from 'bun:test';
import { buildUserPrompt } from './prompt.js';
import type { PrMetadata } from '../github/types.js';

const PR: PrMetadata = {
  owner: 'astropods',
  repo: 'astro',
  number: 2141,
  title: 'feat(events): subscribe the client to the account event stream',
  author: 'mattcolozzo',
  baseRef: 'main',
  headRef: 'feat/account-events',
  baseSha: 'aaaaaaa',
  headSha: 'bbbbbbb',
  installationId: 1,
};

describe('buildUserPrompt rules block', () => {
  it('omits the rules section when a repo has configured none', () => {
    expect(buildUserPrompt(PR, 'diff', undefined, [])).not.toContain('Repository Review Rules');
    expect(buildUserPrompt(PR, 'diff')).not.toContain('Repository Review Rules');
  });

  it('renders each rule under its number so a finding can cite it', () => {
    const prompt = buildUserPrompt(PR, 'diff', undefined, [
      { ruleNumber: 5, rule: 'A new feature landing without public docs is at least medium.' },
    ]);
    expect(prompt).toContain('**Rule #5:** A new feature landing without public docs is at least medium.');
  });

  it('tells the reviewer a rule cannot set severity on its own', () => {
    const prompt = buildUserPrompt(PR, 'diff', undefined, [
      { ruleNumber: 5, rule: 'A new feature landing without public docs is at least medium.' },
    ]);
    expect(prompt).toContain("Severity comes from the finding's impact on this PR");
    expect(prompt).toContain('only where its premise actually holds');
    expect(prompt).toContain('argue in its body that it may not apply');
  });
});
