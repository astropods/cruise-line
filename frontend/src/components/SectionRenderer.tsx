import { RichContent } from './RichContent';
import type { Section, FileContent } from '../api';

interface SectionRendererProps {
  section: Section;
  files: Record<string, FileContent>;
  index: number;
}

export function SectionRenderer({ section, files, index }: SectionRendererProps) {
  return (
    <section
      id={`section-${index}`}
      data-section-index={index}
      className="mb-16"
    >
      <h2 className="text-[1.6rem] font-semibold text-[var(--text-bright)] mb-8 pb-4 border-b border-[var(--border)] tracking-tight leading-tight">
        {section.title}
      </h2>

      <RichContent content={section.body} files={files} />
    </section>
  );
}
