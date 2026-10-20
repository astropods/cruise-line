import { useEffect, useState } from 'react';

export interface CodeToken {
  content: string;
  color?: string;
}

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

const plain = (lines: string[]): CodeToken[][] => lines.map((content) => [{ content }]);

/**
 * Shiki tokens for each line. Starts as plain text and stays that way if
 * Shiki fails to load or doesn't know the language. Tokens render as React
 * text, never HTML, since the lines come from the PR.
 */
export function useHighlightedLines(lines: string[], language: string): CodeToken[][] {
  const code = lines.join('\n');
  const [tokens, setTokens] = useState<{ code: string; lines: CodeToken[][] } | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    import('shiki')
      .then(({ codeToTokens }) => codeToTokens(code, { lang: language as never, theme: 'github-dark' }))
      .then((result) => {
        if (cancelled) return;
        setTokens({
          code,
          lines: result.tokens.map((line) =>
            line.map((t) => ({ content: t.content, color: t.color && HEX_COLOR.test(t.color) ? t.color : undefined })),
          ),
        });
      })
      .catch(() => { /* plain text it is */ });
    return () => { cancelled = true; };
  }, [code, language]);

  // Highlighting from a previous `code` doesn't apply to these lines
  return tokens?.code === code ? tokens.lines : plain(lines);
}

export function CodeLine({ tokens }: { tokens: CodeToken[] }) {
  return (
    <span className="flex-1 whitespace-pre-wrap break-all px-4">
      {tokens.map((t, i) => (
        <span key={i} style={t.color ? { color: t.color } : undefined}>{t.content}</span>
      ))}
    </span>
  );
}
