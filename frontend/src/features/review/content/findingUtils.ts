/**
 * Extract the first ::diff or ::code directive's file and start line from a
 * finding body. Used to anchor the "Post as comment" action when a structured
 * commentAnchor isn't available (chat findings, legacy walkthroughs).
 */
export function extractCommentTargetFromBody(body: string): { file: string; line: number } | null {
  const match = body.match(/::(?:diff|code)\{[^}]*file="([^"]+)"[^}]*lines="(\d+)-\d+"[^}]*\}/);
  if (!match) return null;
  return { file: match[1], line: parseInt(match[2], 10) };
}

/**
 * Strip ::directive{} blocks from markdown so a finding body can be used as
 * the prefill text for a GitHub review comment. Block directives (callout,
 * suggestion) consume the lines that follow until the next blank line or
 * directive.
 */
export function stripDirectives(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  const directiveRe = /^::(\w+)\{[^}]*\}\s*$/;
  let i = 0;
  while (i < lines.length) {
    const match = directiveRe.exec(lines[i]);
    if (match) {
      const directive = match[1];
      if (directive === 'callout' || directive === 'suggestion') {
        i++;
        while (i < lines.length) {
          if (lines[i].trim() === '') {
            let nextNonEmpty = i + 1;
            while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') nextNonEmpty++;
            if (nextNonEmpty >= lines.length || directiveRe.test(lines[nextNonEmpty])) break;
          }
          i++;
        }
      } else {
        i++;
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
