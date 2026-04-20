import { useState, useEffect, useCallback } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import type { Finding, Severity } from '../api';

interface FindingNavProps {
  findings: Finding[];
}

const severityColor: Record<Severity, string> = {
  critical: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-blue-400',
  info: 'bg-[var(--text-secondary)]/40',
};

/**
 * Compact finding navigator shown in the header when the container is too
 * narrow for the sidebar. Visibility controlled by container query via
 * .cruise-finding-header-nav.
 */
export function FindingNav({ findings }: FindingNavProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const elements = findings.map((_, i) =>
      document.getElementById(`section-${i}`)
    ).filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.getAttribute('data-section-index') ?? '0', 10);
            setActiveIndex(idx);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [findings]);

  const scrollTo = useCallback((index: number) => {
    const el = document.getElementById(`section-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  }, []);

  const activeFinding = findings[activeIndex];
  if (!activeFinding) return null;

  return (
    <div className="cruise-finding-header-nav absolute top-0 left-0 right-0 z-10 bg-[var(--bg-primary)] border-b border-[var(--border)]">
      <div className="max-w-[800px] mx-auto px-8 py-2 relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 w-full text-left group"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${severityColor[activeFinding.severity]}`} />
          <span className="text-xs text-[var(--text-secondary)] truncate flex-1">
            <span className="text-[var(--text-secondary)]/50">{activeIndex + 1}/{findings.length}</span>
            {' '}
            {activeFinding.title}
          </span>
          <CaretDown size={12} className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity text-[var(--text-secondary)]" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-0 right-0 top-full mt-2 mx-8 max-h-[50vh] overflow-auto rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xl z-30 py-1">
              {findings.map((finding, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(i)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                    i === activeIndex
                      ? 'text-[var(--accent)] bg-[var(--accent)]/5'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${severityColor[finding.severity]}`} />
                  <span className="truncate">{finding.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
