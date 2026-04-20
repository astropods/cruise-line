export type Segment =
  | { type: 'markdown'; content: string }
  | { type: 'diff'; file: string; lines?: [number, number] }
  | { type: 'code'; file: string; lines?: [number, number] }
  | { type: 'file'; file: string }
  | { type: 'callout'; calloutType: 'info' | 'warning' | 'breaking' | 'security' | 'perf'; content: string }
  | { type: 'suggestion'; file: string; lines?: [number, number]; content: string }
  | { type: 'finding'; title: string; severity: string; category: string; fixPrompt?: string; body: string };

// Match directive on its own line — also tolerate leading/trailing whitespace.
// Braces are optional (for ::endfinding). Attribute values in quotes can contain }.
const DIRECTIVE_RE = /^\s*::(\w+)(?:\{((?:[^}"]*|"[^"]*")*)\})?\s*$/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

// Detect code fence boundaries (``` or ~~~, optionally with language)
const CODE_FENCE_RE = /^\s*(`{3,}|~{3,})/;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseLines(val: string): [number, number] | undefined {
  const m = val.match(/^(\d+)-(\d+)$/);
  if (!m) return undefined;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/**
 * Collect content lines for a block directive (callout, suggestion).
 * Terminates on:
 *  - A blank line followed by non-indented text (not more content)
 *  - A code fence boundary (``` or ~~~)
 *  - Another directive
 *  - End of input
 *  - Max 50 lines (safety cap)
 */
function collectBlockContent(lines: string[], startIndex: number): { content: string[]; endIndex: number } {
  const contentLines: string[] = [];
  let i = startIndex;
  let inCodeFence = false;
  let fenceMarker = '';
  const MAX_LINES = 50;

  while (i < lines.length && contentLines.length < MAX_LINES) {
    const line = lines[i];

    // Track code fences within the block content
    const fenceMatch = CODE_FENCE_RE.exec(line);
    if (fenceMatch) {
      if (!inCodeFence) {
        inCodeFence = true;
        fenceMarker = fenceMatch[1][0]; // ` or ~
        contentLines.push(line);
        i++;
        continue;
      } else if (line.trim().startsWith(fenceMarker.repeat(3))) {
        // Closing fence — include it and end the block
        inCodeFence = false;
        contentLines.push(line);
        i++;
        // After a closing code fence, the block directive is done
        break;
      }
    }

    // Inside a code fence, just collect lines
    if (inCodeFence) {
      contentLines.push(line);
      i++;
      continue;
    }

    // Blank line — check if this terminates the block
    if (line.trim() === '') {
      if (contentLines.length === 0) {
        // Leading blank line, skip it
        i++;
        continue;
      }

      // Look ahead: if the next non-blank line is a directive or looks like
      // regular prose (not indented code), terminate
      let nextNonEmpty = i + 1;
      while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') nextNonEmpty++;

      if (nextNonEmpty >= lines.length) break; // end of input
      if (DIRECTIVE_RE.test(lines[nextNonEmpty])) break; // next directive

      // If next non-empty line starts a new paragraph (not indented), terminate
      // This catches the common case where the agent forgets a blank line separator
      const nextLine = lines[nextNonEmpty];
      if (nextLine && !nextLine.startsWith(' ') && !nextLine.startsWith('\t')) {
        break;
      }
    }

    // Another directive — stop (don't consume it)
    if (contentLines.length > 0 && DIRECTIVE_RE.test(line)) {
      break;
    }

    contentLines.push(line);
    i++;
  }

  return { content: contentLines, endIndex: i };
}

/**
 * Parse a section body into segments of markdown and directives.
 *
 * Directives appear on their own line:
 *   ::diff{file="lib/search.ts" lines="29-50"}
 *   ::code{file="lib/collections.ts" lines="1-20"}
 *   ::file{file="server/api/collections.ts"}
 *   ::callout{type="warning"}
 *   Content lines until blank line...
 *   ::suggestion{file="path" lines="start-end"}
 *   replacement code...
 */
export function parseDirectives(body: string): Segment[] {
  // Pre-process: strip wrapping code fences around directives
  // Agents sometimes wrap directives in ```\n::directive{}\ncontent\n```
  const sanitized = sanitizeDirectives(body);

  const lines = sanitized.split('\n');
  const segments: Segment[] = [];
  let markdownBuf: string[] = [];

  function flushMarkdown() {
    if (markdownBuf.length > 0) {
      const content = markdownBuf.join('\n').trim();
      if (content) segments.push({ type: 'markdown', content });
      markdownBuf = [];
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = DIRECTIVE_RE.exec(line);

    if (!match) {
      markdownBuf.push(line);
      i++;
      continue;
    }

    flushMarkdown();

    const directive = match[1];
    const attrs = parseAttrs(match[2] ?? '');

    switch (directive) {
      case 'diff':
        segments.push({
          type: 'diff',
          file: attrs.file ?? '',
          lines: attrs.lines ? parseLines(attrs.lines) : undefined,
        });
        i++;
        break;

      case 'code':
        segments.push({
          type: 'code',
          file: attrs.file ?? '',
          lines: attrs.lines ? parseLines(attrs.lines) : undefined,
        });
        i++;
        break;

      case 'file':
        segments.push({ type: 'file', file: attrs.file ?? '' });
        i++;
        break;

      case 'callout': {
        const calloutType = (attrs.type ?? 'info') as 'info' | 'warning' | 'breaking' | 'security' | 'perf';
        i++;
        const { content, endIndex } = collectBlockContent(lines, i);
        i = endIndex;
        segments.push({
          type: 'callout',
          calloutType,
          content: content.join('\n').trim(),
        });
        break;
      }

      case 'suggestion': {
        i++;
        const { content, endIndex } = collectBlockContent(lines, i);
        i = endIndex;
        segments.push({
          type: 'suggestion',
          file: attrs.file ?? '',
          lines: attrs.lines ? parseLines(attrs.lines) : undefined,
          content: content.join('\n').trimEnd(),
        });
        break;
      }

      case 'finding': {
        i++;
        // Collect until ::endfinding or end of input
        const bodyLines: string[] = [];
        const END_RE = /^\s*::endfinding\b/;
        while (i < lines.length && !END_RE.test(lines[i])) {
          bodyLines.push(lines[i]);
          i++;
        }
        if (i < lines.length && END_RE.test(lines[i])) i++; // skip ::endfinding
        segments.push({
          type: 'finding',
          title: attrs.title ?? 'Finding',
          severity: attrs.severity ?? 'info',
          category: attrs.category ?? 'correctness',
          fixPrompt: attrs.fixPrompt || undefined,
          body: bodyLines.join('\n').trim(),
        });
        break;
      }

      case 'endfinding':
        // Stray endfinding without a matching finding — skip
        i++;
        break;

      default:
        // Unknown directive, treat as markdown
        markdownBuf.push(line);
        i++;
        break;
    }
  }

  flushMarkdown();
  return segments;
}

/**
 * Sanitize common agent mistakes before parsing:
 * - Directives wrapped in code fences: ```\n::suggestion{...}\ncode\n```
 * - Directives with trailing text on the same line
 */
function sanitizeDirectives(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect a code fence that immediately precedes a directive
    // Pattern: ```\n::directive{...}\n...\n```
    const fenceMatch = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      // Look ahead: is the next line a directive?
      if (i + 1 < lines.length && DIRECTIVE_RE.test(lines[i + 1])) {
        // Skip the opening fence
        i++;
        // Collect until closing fence
        while (i < lines.length) {
          const closeFence = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[i]);
          if (closeFence && closeFence[1][0] === fence[0] && closeFence[1].length >= fence.length) {
            i++; // skip closing fence
            break;
          }
          result.push(lines[i]);
          i++;
        }
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

/**
 * Process inline ::file{} directives within markdown text,
 * replacing them with a placeholder that react-markdown can render.
 * Returns markdown with ::file{} replaced by a custom link format.
 */
export function processInlineFileRefs(markdown: string): string {
  return markdown.replace(
    /::file\{file="([^"]+)"\}/g,
    (_, file) => `[${file}](::file::${file})`,
  );
}
