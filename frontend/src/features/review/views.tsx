import { ChatCircle, FileText, TreeStructure } from '@phosphor-icons/react';
import type { Segment } from '../../ui';

export type ReviewView = 'analysis' | 'architecture' | 'chat';

export function parseReviewView(value: string | undefined): ReviewView {
  return value === 'architecture' || value === 'chat' ? value : 'analysis';
}

/** The PR's URL for a view; Analysis is the bare PR path */
export function reviewViewPath(owner: string, repo: string, number: number, view: ReviewView): string {
  const base = `/${owner}/${repo}/pull/${number}`;
  return view === 'analysis' ? base : `${base}/${view}`;
}

export function reviewViewSegments({ hasReview }: { hasReview: boolean }): Segment<ReviewView>[] {
  return [
    { value: 'analysis', label: 'Analysis', icon: <FileText size={14} aria-hidden="true" /> },
    {
      value: 'architecture',
      label: 'Architecture',
      icon: <TreeStructure size={14} aria-hidden="true" />,
      // Architecture comes from the review; there's nothing to show before one exists
      disabled: !hasReview,
    },
    { value: 'chat', label: 'Chat', icon: <ChatCircle size={14} aria-hidden="true" /> },
  ];
}
