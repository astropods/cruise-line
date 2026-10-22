import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LockSimple, WarningCircle } from '@phosphor-icons/react';
import { ApiError } from '../../api';
import { useCurrentUser, useSetupStatus } from '../../app/session';
import { Button, buttonClass, EmptyState, Spinner } from '../../ui';

// Long enough that a normal load never shows the note
const SLOW_LOAD_MS = 600;

/**
 * The PR page before its access check returns. It shows nothing about the PR
 * beyond what the URL already says: the same shape for every PR, since the
 * visitor may not be allowed to see this one.
 */
export function PrPageSkeleton({ owner, repo }: { owner: string; repo: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" aria-label="Loading pull request" className="flex h-full flex-col bg-canvas">
      <div className="flex h-16 flex-shrink-0 items-center gap-3 border-b border-line px-4 md:px-10">
        <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-raised" />
        <div className="flex flex-grow flex-col gap-2">
          <div className="h-3.5 w-56 max-w-full animate-pulse rounded bg-raised" />
          <div className="h-2.5 w-32 animate-pulse rounded bg-raised" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-10 md:px-8">
        <div className="h-4 w-11/12 animate-pulse rounded bg-raised" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-raised" />
        <div className="mt-2 h-28 animate-pulse rounded-lg bg-surface" />
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
        <p className={`flex items-center gap-2 text-sm text-fg-muted transition-opacity duration-300 ${slow ? 'opacity-100' : 'opacity-0'}`}>
          <Spinner size={14} />
          Checking your access to {owner}/{repo} on GitHub…
        </p>
      </div>
    </div>
  );
}

interface PrUnavailableProps {
  owner: string;
  repo: string;
  number: number;
  error: Error;
  onRetry: () => void;
}

/**
 * The PR page when it couldn't load, in place of the whole page: no bar,
 * actions, or chat, since none of them can work. No access and no such PR
 * read the same, so a URL can't be used to learn which private repos exist
 * or have Cruise Line installed (the server doesn't tell them apart either).
 */
export function PrUnavailable({ owner, repo, number, error, onRetry }: PrUnavailableProps) {
  const status = error instanceof ApiError ? error.status : null;
  const { data: user } = useCurrentUser();
  const githubUrl = useSetupStatus().data?.githubUrl ?? 'https://github.com';

  // apiFetch is already sending the browser to GitHub sign-in
  if (status === 401) {
    return (
      <div role="status" className="flex h-full items-center justify-center gap-2 bg-canvas text-sm text-fg-muted">
        <Spinner size={16} />
        Signing you in…
      </div>
    );
  }

  if (status === 403 || status === 404) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <EmptyState
          icon={<LockSimple size={28} />}
          title="You don't have access to this pull request, or it doesn't exist"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/" className={buttonClass({ variant: 'secondary' })}>Back to inbox</Link>
              <a
                href={`${githubUrl}/${owner}/${repo}/pull/${number}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: 'ghost' })}
              >
                Open on GitHub
              </a>
            </div>
          }
        >
          <span className="font-mono">{owner}/{repo}#{number}</span>. Cruise Line shows a pull request to people with
          write access to its repository{user ? <>. You're signed in as <span className="font-medium text-fg">@{user.login}</span></> : null}.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <EmptyState
        icon={<WarningCircle size={28} className="text-danger" />}
        title="Couldn't load this pull request"
        action={<Button onClick={onRetry}>Try again</Button>}
      >
        Cruise Line or GitHub didn't respond.
      </EmptyState>
    </div>
  );
}
