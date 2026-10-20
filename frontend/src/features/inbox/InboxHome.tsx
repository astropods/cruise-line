import { GitPullRequest } from '@phosphor-icons/react';
import { EmptyState } from '../../ui';
import { tabCounts } from './inboxModel';
import { usePrList } from './usePrList';

/** The main area before a PR is picked */
export function InboxHome() {
  const list = usePrList();
  const prs = list.data?.prs;
  const attention = prs ? tabCounts(prs).attention : null;

  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={<GitPullRequest size={28} />} title={prs?.length === 0 ? 'No pull requests yet' : 'Pick a pull request'}>
        {prs?.length === 0
          ? 'Cruise Line lists pull requests as they’re opened on connected repositories.'
          : attention
            ? `${attention} ${attention === 1 ? 'needs' : 'need'} your attention.`
            : 'Choose one from the inbox to see its review.'}
      </EmptyState>
    </div>
  );
}
