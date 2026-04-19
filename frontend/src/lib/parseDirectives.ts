export type Segment =
  | { type: 'markdown'; content: string }
  | { type: 'diff'; file: string; lines?: [number, number] }
  | { type: 'code'; file: string; lines?: [number, number] }
  | { type: 'file'; file: string }
  | { type: 'callout'; calloutType: 'info' | 'warning' | 'breaking'; content: string };

const DIRECTIVE_RE = /^::(\w+)\{([^}]*)\}\s*$/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

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
 * Parse a section body into segments of markdown and directives.
 *
 * Directives appear on their own line:
 *   ::diff{file="lib/search.ts" lines="29-50"}
 *   ::code{file="lib/collections.ts" lines="1-20"}
 *   ::file{file="server/api/collections.ts"}
 *   ::callout{type="warning"}
 *   Content lines until blank line...
 */
export function parseDirectives(body: string): Segment[] {
  const lines = body.split('\n');
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
      // Check for inline ::file{} directives within a markdown line
      markdownBuf.push(line);
      i++;
      continue;
    }

    flushMarkdown();

    const directive = match[1];
    const attrs = parseAttrs(match[2]);

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
        const calloutType = (attrs.type ?? 'info') as 'info' | 'warning' | 'breaking';
        const contentLines: string[] = [];
        i++;
        // Collect content until blank line or next directive
        while (i < lines.length) {
          if (lines[i].trim() === '' && i + 1 < lines.length && DIRECTIVE_RE.test(lines[i + 1])) {
            break;
          }
          if (lines[i].trim() === '' && contentLines.length > 0) {
            // Check if next non-empty line is a directive
            let nextNonEmpty = i + 1;
            while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') nextNonEmpty++;
            if (nextNonEmpty >= lines.length || DIRECTIVE_RE.test(lines[nextNonEmpty])) break;
          }
          contentLines.push(lines[i]);
          i++;
        }
        segments.push({
          type: 'callout',
          calloutType,
          content: contentLines.join('\n').trim(),
        });
        break;
      }

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
