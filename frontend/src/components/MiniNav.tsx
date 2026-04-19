import { useState, useEffect } from 'react';
import type { Section } from '../api';

interface MiniNavProps {
  sections: Section[];
}

export function MiniNav({ sections }: MiniNavProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Track which section is in view using Intersection Observer
  useEffect(() => {
    const elements = sections.map((_, i) =>
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
  }, [sections]);

  function scrollTo(index: number) {
    const el = document.getElementById(`section-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (sections.length <= 1) return null;

  return (
    <nav className="fixed right-6 top-1/2 -translate-y-1/2 z-30 hidden xl:block">
      <div className="flex flex-col items-end gap-1">
        {sections.map((section, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className={`group flex items-center gap-3 py-1 transition-all ${
              i === activeIndex ? 'opacity-100' : 'opacity-40 hover:opacity-70'
            }`}
          >
            <span className={`text-xs text-right max-w-[160px] truncate transition-colors ${
              i === activeIndex ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`}>
              {section.title}
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${
              i === activeIndex
                ? 'bg-[var(--accent)] scale-125'
                : 'bg-[var(--text-secondary)]/40 group-hover:bg-[var(--text-secondary)]'
            }`} />
          </button>
        ))}
      </div>
    </nav>
  );
}
