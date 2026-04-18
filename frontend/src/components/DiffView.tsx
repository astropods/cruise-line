import { useEffect, useState } from 'react';

interface DiffViewProps {
  before: string;
  after: string;
  language: string;
}

export function DiffView({ before, after, language }: DiffViewProps) {
  const [beforeHtml, setBeforeHtml] = useState('');
  const [afterHtml, setAfterHtml] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const { codeToHtml } = await import('shiki');
      const lang = language || 'text';
      const theme = 'github-dark';

      try {
        const [bHtml, aHtml] = await Promise.all([
          codeToHtml(before, { lang, theme }),
          codeToHtml(after, { lang, theme }),
        ]);
        if (!cancelled) {
          setBeforeHtml(bHtml);
          setAfterHtml(aHtml);
        }
      } catch {
        const [bHtml, aHtml] = await Promise.all([
          codeToHtml(before, { lang: 'text', theme }),
          codeToHtml(after, { lang: 'text', theme }),
        ]);
        if (!cancelled) {
          setBeforeHtml(bHtml);
          setAfterHtml(aHtml);
        }
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [before, after, language]);

  return (
    <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
      <div className="overflow-auto">
        <div className="px-3 py-1.5 text-xs text-[var(--text-secondary)] bg-[var(--diff-remove-bg)] border-b border-[var(--border)]">
          Before
        </div>
        <div
          className="[&_.shiki]:!bg-transparent"
          style={{ background: 'var(--diff-remove-bg)' }}
          dangerouslySetInnerHTML={{ __html: beforeHtml }}
        />
      </div>
      <div className="overflow-auto">
        <div className="px-3 py-1.5 text-xs text-[var(--text-secondary)] bg-[var(--diff-add-bg)] border-b border-[var(--border)]">
          After
        </div>
        <div
          className="[&_.shiki]:!bg-transparent"
          style={{ background: 'var(--diff-add-bg)' }}
          dangerouslySetInnerHTML={{ __html: afterHtml }}
        />
      </div>
    </div>
  );
}
