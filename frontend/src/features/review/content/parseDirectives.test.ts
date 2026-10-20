import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import { fileFromHref, processInlineFileRefs, processRuleRefs, ruleFromHref } from './parseDirectives';

/** The hrefs react-markdown keeps after its URL sanitizer */
function renderedHrefs(markdown: string): string[] {
  const html = renderToStaticMarkup(createElement(ReactMarkdown, null, markdown));
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

describe('file and rule pills', () => {
  test('survive react-markdown and round-trip', () => {
    const md = processRuleRefs(processInlineFileRefs('See ::file{file="src/a b(1).ts"} and Rule #3.'));
    const [fileHref, ruleHref] = renderedHrefs(md);
    expect(fileFromHref(fileHref)).toBe('src/a b(1).ts');
    expect(ruleFromHref(ruleHref)).toBe(3);
  });

  test('leave code alone', () => {
    const md = 'Use `Rule #3` here.\n\n```\n::file{file="x.ts"} Rule #4\n```\n\nBut Rule #5 counts.';
    expect(processRuleRefs(processInlineFileRefs(md))).toBe(
      'Use `Rule #3` here.\n\n```\n::file{file="x.ts"} Rule #4\n```\n\nBut [Rule #5](#cl-rule=5) counts.',
    );
  });

  test('ignore ordinary links', () => {
    expect(fileFromHref('https://example.com')).toBeNull();
    expect(ruleFromHref('#section')).toBeNull();
  });
});
