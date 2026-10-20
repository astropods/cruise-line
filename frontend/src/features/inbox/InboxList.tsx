import { useState } from 'react';
import type { PrSummary } from '../../api';
import { useNow } from '../../lib/useNow';
import { useStartReview } from '../review/useStartReview';
import { InboxRow } from './InboxRow';
import { prKey, prPath } from './inboxModel';

interface InboxListProps {
  prs: readonly PrSummary[];
  selectedKey: string | null;
  /** Appended to row links so the inbox tab survives opening a PR */
  search: string;
}

export function InboxList({ prs, selectedKey, search }: InboxListProps) {
  const now = useNow(60_000);
  const start = useStartReview();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function startReview(pr: PrSummary) {
    const key = prKey(pr);
    setErrors(({ [key]: _, ...rest }) => rest);
    start.mutate(
      { owner: pr.owner, repo: pr.repo, number: pr.number, force: pr.status === 'failed' },
      { onError: (err) => setErrors((e) => ({ ...e, [key]: err.message })) },
    );
  }

  return (
    <ul>
      {prs.map((pr) => {
        const key = prKey(pr);
        const v = start.variables;
        return (
          <InboxRow
            key={key}
            pr={pr}
            to={`${prPath(pr)}${search}`}
            selected={key === selectedKey}
            now={now}
            onStart={() => startReview(pr)}
            starting={start.isPending && !!v && prKey(v) === key}
            startError={errors[key]}
          />
        );
      })}
    </ul>
  );
}
