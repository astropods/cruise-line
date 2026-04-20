import { useState, useEffect } from 'react';
import type { Finding, Severity } from '../api';

interface MiniNavProps {
  findings: Finding[];
}

const severityDot: Record<Severity, string> = {
  critical: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-blue-400',
  info: 'bg-[var(--text-secondary)]/40',
};

/**
 * Fixed left sidebar navigation for findings.
 * Visibility controlled by container query via .cruise-finding-sidebar.
 */
export function MiniNav({ findings }: MiniNavProps) {
  const [activeIndex, setActiveIndex] = useState(0);

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

  function scrollTo(index: number) {
    const el = document.getElementById(`section-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (findings.length <= 1) return null;

  return (
    <nav className="cruise-finding-sidebar fixed left-4 top-1/2 -translate-y-1/2 z-30 max-w-[18rem]">
      <div className="flex flex-col gap-0.5">
        {findings.map((finding, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className={`group flex items-center gap-2.5 py-1.5 transition-all ${
              i === activeIndex ? 'opacity-100' : 'opacity-40 hover:opacity-70'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${
              i === activeIndex
                ? `${severityDot[finding.severity]} scale-125`
                : `${severityDot[finding.severity]} group-hover:scale-110`
            }`} />
            <span className={`text-xs text-left truncate transition-colors ${
              i === activeIndex ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`}>
              {finding.title}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
