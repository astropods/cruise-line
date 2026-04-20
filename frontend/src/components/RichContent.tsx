import { Md } from './Md';
import { parseDirectives, processInlineFileRefs } from '../lib/parseDirectives';
import { InlineDiff } from './InlineDiff';
import { InlineCode } from './InlineCode';
import { FilePill } from './FilePill';
import { Callout } from './Callout';
import type { FileContent } from '../api';

interface RichContentProps {
  /** Markdown text that may contain ::diff{}, ::code{}, ::file{}, ::callout{} directives */
  content: string;
  /** File contents for rendering code/diff embeds. If empty, embeds are skipped. */
  files?: Record<string, FileContent>;
  /** Additional CSS class on the markdown wrapper */
  className?: string;
}

/**
 * Renders markdown content with embedded interactive directives.
 * Used by both the walkthrough SectionRenderer and the chat panel.
 */
export function RichContent({ content, files = {}, className = 'cruise-markdown' }: RichContentProps) {
  const segments = parseDirectives(content);

  return (
    <>
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'markdown':
            return (
              <div key={i} className={className}>
                <Md
                  components={{
                    a: ({ href, children }) => {
                      if (href?.startsWith('::file::')) {
                        const file = href.replace('::file::', '');
                        return <FilePill file={file} />;
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {processInlineFileRefs(segment.content)}
                </Md>
              </div>
            );

          case 'diff': {
            const fc = files[segment.file];
            if (!fc) return <div key={i} className="my-2"><FilePill file={segment.file} /></div>;
            return (
              <InlineDiff
                key={i}
                file={segment.file}
                lines={segment.lines}
                fileContent={fc}
              />
            );
          }

          case 'code': {
            const fc = files[segment.file];
            if (!fc) return <div key={i} className="my-2"><FilePill file={segment.file} /></div>;
            return (
              <InlineCode
                key={i}
                file={segment.file}
                lines={segment.lines}
                fileContent={fc}
              />
            );
          }

          case 'file':
            return (
              <div key={i} className="my-2">
                <FilePill file={segment.file} />
              </div>
            );

          case 'callout':
            return (
              <Callout
                key={i}
                type={segment.calloutType}
                content={segment.content}
              />
            );

          default:
            return null;
        }
      })}
    </>
  );
}
