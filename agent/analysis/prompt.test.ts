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

  it('truncates the diff by Unicode code point, not UTF-16 code unit', () => {
    // The Go port in cli/user_prompt.go slices by rune. If the TS side
    // slices by UTF-16 code unit (i.e. plain `.slice`), multi-byte
    // characters would produce a different truncation position and the
    // two languages would silently disagree — exactly the drift this
    // cross-language test is here to prevent. A matching Go test lives
    // in cli/user_prompt_test.go (TestBuildUserPromptTruncationIsRuneSafe).
    const maxDiffChars = 100_000;
    const pr: PrMetadata = {
      owner: 'acme',
      repo: 'app',
      number: 0,
      title: 'big',
      author: 'chris',
      baseRef: 'main',
      headRef: 'feat/x',
      baseSha: 'aaa',
      headSha: 'bbb',
      installationId: 0,
    };
    // A diff exactly one code-point over the limit, made of a
    // supplementary-plane character (U+1F6A2 SHIP) so `str.length`
    // (UTF-16 code units) diverges from `[...str].length` (code points).
    const oversized = '🚢'.repeat(maxDiffChars + 1);
    const got = buildUserPrompt(pr, oversized, undefined, undefined);

    expect(got).toContain('[diff truncated');

    // Extract the fenced diff block and count code points — must be
    // exactly maxDiffChars.
    const openIdx = got.indexOf('```diff\n');
    expect(openIdx).toBeGreaterThanOrEqual(0);
    const payloadStart = openIdx + '```diff\n'.length;
    const notice = '\n\n... [diff truncated';
    const noticeIdx = got.indexOf(notice, payloadStart);
    expect(noticeIdx).toBeGreaterThan(payloadStart);
    const payload = got.slice(payloadStart, noticeIdx);
    expect([...payload].length).toBe(maxDiffChars);
  });
});
