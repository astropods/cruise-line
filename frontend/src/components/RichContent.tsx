import { useMemo } from 'react';
import { Md } from './Md';
import { parseDirectives, processInlineFileRefs, processRuleRefs } from '../lib/parseDirectives';
import { resolveFilePath } from '../lib/resolvePath';
import { InlineDiff } from './InlineDiff';
import { InlineCode } from './InlineCode';
import { InlineSuggestion } from './InlineSuggestion';
import { LazyFileEmbed } from './LazyFileEmbed';
import { InlineFinding } from './InlineFinding';
import { FilePill } from './FilePill';
import { Callout } from './Callout';
import type { FileContent } from '../api';

export interface RuleRef {
  ruleNumber: number;
  rule: string;
}

interface RichContentProps {
  /** Markdown text that may contain ::diff{}, ::code{}, ::file{}, ::callout{} directives */
  content: string;
  /** File contents for rendering code/diff embeds. Missing files are fetched on demand. */
  files?: Record<string, FileContent>;
  /** Additional CSS class on the markdown wrapper */
  className?: string;
  /** Callback when a "Rule #N" reference is clicked */
  onRuleClick?: (ruleNumber: number) => void;
  /** Rules list for showing rule text on hover */
  rules?: RuleRef[];
}

/**
 * Renders markdown content with embedded interactive directives.
 * Used by both the analysis FindingRenderer and the chat panel.
 */
export function RichContent({ content, files = {}, className = 'cruise-markdown', onRuleClick, rules = [] }: RichContentProps) {
  const segments = parseDirectives(content);
  const knownPaths = useMemo(() => Object.keys(files), [files]);

  /** Look up a file by path, handling mismatches (leading ./, absolute paths, etc.) */
  function resolveFile(path: string): { resolvedPath: string; fc: FileContent | undefined } {
    const resolvedPath = resolveFilePath(path, knownPaths);
    return { resolvedPath, fc: files[resolvedPath] };
  }

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
                        const { resolvedPath } = resolveFile(file);
                        return <FilePill file={resolvedPath} />;
                      }
                      if (href?.startsWith('::rule::')) {
                        const ruleNum = parseInt(href.replace('::rule::', ''), 10);
                        const ruleText = rules.find((r) => r.ruleNumber === ruleNum)?.rule;
                        return (
                          <span className="relative inline-block group">
                            <button
                              onClick={() => onRuleClick?.(ruleNum)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium hover:bg-[var(--accent)]/20 transition-colors cursor-pointer"
                            >
                              {children}
                            </button>
                            {ruleText && (
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xl text-xs text-[var(--text-primary)] w-64 hidden group-hover:block z-50 pointer-events-none">
                                {ruleText}
                              </span>
                            )}
                          </span>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {processRuleRefs(processInlineFileRefs(segment.content))}
                </Md>
              </div>
            );

          case 'diff': {
            const { resolvedPath, fc } = resolveFile(segment.file);
            if (!fc) return <LazyFileEmbed key={i} type="diff" file={resolvedPath} lines={segment.lines} />;
            return (
              <InlineDiff
                key={i}
                file={resolvedPath}
                lines={segment.lines}
                fileContent={fc}
              />
            );
          }

          case 'code': {
            const { resolvedPath, fc } = resolveFile(segment.file);
            if (!fc) return <LazyFileEmbed key={i} type="code" file={resolvedPath} lines={segment.lines} />;
            return (
              <InlineCode
                key={i}
                file={resolvedPath}
                lines={segment.lines}
                fileContent={fc}
              />
            );
          }

          case 'file': {
            const { resolvedPath } = resolveFile(segment.file);
            return (
              <div key={i} className="my-2">
                <FilePill file={resolvedPath} />
              </div>
            );
          }

          case 'callout':
            return (
              <Callout
                key={i}
                type={segment.calloutType}
                content={segment.content}
              />
            );

          case 'suggestion': {
            const { resolvedPath, fc } = resolveFile(segment.file);
            if (!fc) return <LazyFileEmbed key={i} type="suggestion" file={resolvedPath} lines={segment.lines} suggestion={segment.content} />;
            return (
              <InlineSuggestion
                key={i}
                file={resolvedPath}
                lines={segment.lines}
                suggestion={segment.content}
                fileContent={fc}
              />
            );
          }

          case 'finding':
            return (
              <InlineFinding
                key={i}
                title={segment.title}
                severity={segment.severity}
                category={segment.category}
                body={segment.body}
                fixPrompt={segment.fixPrompt}
                files={files}
              />
            );

          default:
            return null;
        }
      })}
    </>
  );
}
