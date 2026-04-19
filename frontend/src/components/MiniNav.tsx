import { useState, useEffect } from 'react';
import { useSlideout } from '../contexts/SlideoutContext';
import type { Section } from '../api';

interface MiniNavProps {
  sections: Section[];
}

export function MiniNav({ sections }: MiniNavProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const { activeSlideout } = useSlideout();

  const collapsed = !!activeSlideout;

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

  // Close menu when slideout closes
  useEffect(() => {
    if (!collapsed) setMenuOpen(false);
  }, [collapsed]);

  function scrollTo(index: number) {
    const el = document.getElementById(`section-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  }

  if (sections.length <= 1) return null;

  // Collapsed mode: floating pill
  if (collapsed) {
    return (
      <div className="fixed left-4 bottom-4 z-30">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors shadow-lg"
        >
          <span className="text-[var(--accent)] font-medium">{activeIndex + 1}/{sections.length}</span>
          <span className="truncate max-w-[280px]">{sections[activeIndex]?.title}</span>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xl z-30 py-1 max-h-[50vh] overflow-auto">
              {sections.map((section, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(i)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    i === activeIndex
                      ? 'text-[var(--accent)] bg-[var(--accent)]/5'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Expanded mode: fixed sidebar
  return (
    <nav className="fixed left-4 top-1/2 -translate-y-1/2 z-30 hidden xl:block max-w-[18rem]">
      <div className="flex flex-col gap-0.5">
        {sections.map((section, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className={`group flex items-center gap-2.5 py-1.5 transition-all ${
              i === activeIndex ? 'opacity-100' : 'opacity-40 hover:opacity-70'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${
              i === activeIndex
                ? 'bg-[var(--accent)] scale-125'
                : 'bg-[var(--text-secondary)]/40 group-hover:bg-[var(--text-secondary)]'
            }`} />
            <span className={`text-xs text-left truncate transition-colors ${
              i === activeIndex ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`}>
              {section.title}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
