import type { Chapter } from '../api';

interface ChapterNavProps {
  chapters: Chapter[];
  currentChapter: number;
  currentStep: number;
  onNavigate: (chapter: number, step: number) => void;
}

export function ChapterNav({
  chapters,
  currentChapter,
  currentStep,
  onNavigate,
}: ChapterNavProps) {
  return (
    <nav className="w-72 h-full overflow-auto bg-[var(--bg-secondary)] border-r border-[var(--border)] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
        Chapters
      </h2>

      <ul className="space-y-1">
        {chapters.map((chapter, ci) => (
          <li key={ci}>
            <button
              onClick={() => onNavigate(ci, 0)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                ci === currentChapter
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <span className="font-medium">{chapter.title}</span>
              <span className="block text-xs mt-0.5 opacity-70">
                {chapter.steps.length} step{chapter.steps.length !== 1 ? 's' : ''}
              </span>
            </button>

            {/* Step indicators for current chapter */}
            {ci === currentChapter && (
              <ul className="ml-4 mt-1 space-y-0.5">
                {chapter.steps.map((step, si) => (
                  <li key={si}>
                    <button
                      onClick={() => onNavigate(ci, si)}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                        si === currentStep
                          ? 'text-[var(--accent)] bg-[var(--accent)]/5'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {step.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
