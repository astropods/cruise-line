import { useCallback, useState } from 'react';
import type { FileContent, Finding } from '../../api';
import { useCommentsContext } from '../../contexts/CommentsContext';
import { useSlideout } from '../../contexts/SlideoutContext';
import { extractCommentTargetFromBody, stripDirectives } from '../../lib/findingUtils';

/** Where a finding points, its actions, and whether each is available */
export function useFindingActions(finding: Finding, files: Record<string, FileContent>) {
  const { openFile } = useSlideout();
  const { setActiveCommentLine } = useCommentsContext();
  const [copied, setCopied] = useState(false);

  // Prefer the structured anchor (new walkthroughs); fall back to body parsing for legacy data.
  const target = finding.commentAnchor
    ? { file: finding.commentAnchor.file, line: finding.commentAnchor.lineStart }
    : extractCommentTargetFromBody(finding.body);
  const location = target ?? (finding.files[0] ? { file: finding.files[0], line: null } : null);
  const canComment = !!(target && files[target.file]?.patch);

  const openLocation = useCallback(() => {
    if (!location) return;
    openFile(location.file, location.line ? [location.line, location.line] : undefined);
  }, [location, openFile]);

  const postAsComment = useCallback(() => {
    if (!target || !canComment) return;
    openFile(target.file, [target.line, target.line]);
    const prefill = `🚢 **${finding.title}**\n\n${stripDirectives(finding.body)}`;
    // Let the slideout open before focusing its comment box
    setTimeout(() => {
      setActiveCommentLine({ path: target.file, line: target.line, side: 'RIGHT', prefill });
    }, 300);
  }, [target, canComment, finding, openFile, setActiveCommentLine]);

  const copyFixPrompt = useCallback(() => {
    if (!finding.fixPrompt) return;
    navigator.clipboard.writeText(finding.fixPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [finding.fixPrompt]);

  return { location, openLocation, canComment, postAsComment, copyFixPrompt, copied };
}
