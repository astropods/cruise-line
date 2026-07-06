/**
 * Cross-language golden test for buildUserPrompt.
 *
 * The Cruise Line CLI has its own Go port of this function in
 * cli/user_prompt.go — used to assemble the local pre-PR review prompt
 * on the caller's machine. Both implementations render against the
 * shared golden file at testdata/user-prompt-pre-pr-golden.txt; a
 * matching test in cli/user_prompt_test.go pins the Go side.
 *
 * If this test fails, either the TS or the Go implementation changed
 * (or the golden file did). Whichever direction the fix goes, both
 * languages MUST end up matching the golden — that's what makes "runs
 * the same review as the server" true for local reviews.
 *
 * The fixture inputs below are duplicated by hand into
 * cli/user_prompt_test.go — keep them identical if you edit either.
 */
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildUserPrompt } from './prompt.js';
import type { PrMetadata } from '../github/types.js';

describe('buildUserPrompt — cross-language golden', () => {
  it('matches the pre-PR golden used by the CLI', () => {
    const pr: PrMetadata = {
      owner: 'acme',
      repo: 'app',
      number: 0, // pre-PR local review
      title: 'refactor auth handling',
      author: 'chris',
      baseRef: 'main',
      headRef: 'feat/auth',
      baseSha: 'aaa',
      headSha: 'bbb',
      installationId: 0,
    };
    const diff = 'diff --git a/foo b/foo\n@@ -1 +1 @@\n-old\n+new';
    const rules = [
      { ruleNumber: 1, rule: 'Always use tagged-template SQL' },
      { ruleNumber: 2, rule: 'Never duplicate SQL queries' },
    ];

    const got = buildUserPrompt(pr, diff, undefined, rules);

    const goldenPath = join(import.meta.dir, 'testdata', 'user-prompt-pre-pr-golden.txt');
    const expected = readFileSync(goldenPath, 'utf-8');

    if (got !== expected) {
      // Long assertion so failure output makes it obvious which side moved.
      console.error(`\n--- expected (from ${goldenPath}) ---\n${expected}\n--- got ---\n${got}\n`);
    }
    expect(got).toBe(expected);
  });
});
