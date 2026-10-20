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
  // Per row: a mutation's own state and mutate() callbacks only follow its
  // latest call, so starting B would hide A's spinner and A's error
  const [starting, setStarting] = useState<ReadonlySet<string>>(new Set());

  function startReview(pr: PrSummary) {
    const key = prKey(pr);
    setErrors(({ [key]: _, ...rest }) => rest);
    setStarting((s) => new Set(s).add(key));
    start
      .mutateAsync({ owner: pr.owner, repo: pr.repo, number: pr.number, force: pr.status === 'failed' })
      .catch((err: Error) => setErrors((e) => ({ ...e, [key]: err.message })))
      .finally(() => setStarting((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      }));
  }

  return (
    <ul>
      {prs.map((pr) => {
        const key = prKey(pr);
        return (
          <InboxRow
            key={key}
            pr={pr}
            to={`${prPath(pr)}${search}`}
            selected={key === selectedKey}
            now={now}
            onStart={() => startReview(pr)}
            starting={starting.has(key)}
            startError={errors[key]}
          />
        );
      })}
    </ul>
  );
}
