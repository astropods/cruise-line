import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useMatch, useSearchParams } from 'react-router';
import { GearSix, MagnifyingGlass, Tray } from '@phosphor-icons/react';
import { useCurrentUser } from '../app/session';
import type { InboxTab } from '../domain/prStatus';
import { InboxList } from '../features/inbox/InboxList';
import { InboxTabs } from '../features/inbox/InboxTabs';
import { filterInbox, parseInboxTab, prKey, tabCounts } from '../features/inbox/inboxModel';
import { usePrList } from '../features/inbox/usePrList';
import { cx } from '../lib/cx';
import { Button, EmptyState, Kbd } from '../ui';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';

const EMPTY: Record<InboxTab, { title: string; body: string }> = {
  attention: { title: 'Nothing needs you right now', body: 'Every open pull request is reviewed and has nothing blocking.' },
  open: { title: 'No open pull requests', body: 'Pull requests show up here as they’re opened on connected repositories.' },
  done: { title: 'Nothing merged or closed yet', body: 'Merged and closed pull requests move here.' },
};

export function Sidebar({ className }: { className?: string }) {
  const [params, setParams] = useSearchParams();
  const tab = parseInboxTab(params.get('inbox'));
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const list = usePrList();
  const { data: user } = useCurrentUser();

  const match = useMatch('/:owner/:repo/pull/:pr');
  const selectedKey = match
    ? prKey({ owner: match.params.owner!, repo: match.params.repo!, number: Number(match.params.pr) })
    : null;

  const prs = list.data?.prs;
  const counts = useMemo(() => (prs ? tabCounts(prs) : null), [prs]);
  const visible = useMemo(() => (prs ? filterInbox(prs, tab, query) : []), [prs, tab, query]);

  function setTab(next: InboxTab) {
    setParams((p) => {
      const nextParams = new URLSearchParams(p);
      if (next === 'attention') nextParams.delete('inbox');
      else nextParams.set('inbox', next);
      return nextParams;
    }, { replace: true });
  }

  // "/" focuses search, unless the user is already typing somewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const search = tab === 'attention' ? '' : `?inbox=${tab}`;

  return (
    <aside className={cx('flex h-full w-full flex-shrink-0 flex-col border-r border-line bg-sunken md:w-80', className)}>
      <div className="flex h-14 flex-shrink-0 items-center px-4">
        <Link to={`/${search}`} className="flex items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-accent">
          <Logo />
          <span className="text-sm font-semibold tracking-tight text-fg-strong">Cruise Line</span>
        </Link>
      </div>

      <div className="flex-shrink-0 px-3 pb-3">
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-canvas px-2.5 focus-within:border-accent-emphasis">
          <MagnifyingGlass size={14} className="flex-shrink-0 text-fg-muted" aria-hidden="true" />
          <span className="sr-only">Search pull requests</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            placeholder="Search pull requests"
            className="min-w-0 flex-grow bg-transparent text-[13px] text-fg placeholder:text-fg-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {!query && <Kbd>/</Kbd>}
        </label>
      </div>

      <InboxTabs value={tab} onChange={setTab} counts={counts} />

      <div className="min-h-0 flex-grow overflow-y-auto">
        {list.isPending ? (
          <RowSkeletons />
        ) : list.isError && !prs ? (
          <EmptyState
            title="Couldn’t load pull requests"
            action={<Button size="sm" onClick={() => list.refetch()}>Try again</Button>}
          >
            {list.error.message}
          </EmptyState>
        ) : visible.length === 0 ? (
          query.trim()
            ? <EmptyState title={`No pull requests match “${query.trim()}”`} />
            : <EmptyState icon={<Tray size={24} />} title={EMPTY[tab].title}>{EMPTY[tab].body}</EmptyState>
        ) : (
          <InboxList prs={visible} selectedKey={selectedKey} search={search} />
        )}
      </div>

      <div className="flex flex-shrink-0 flex-col gap-0.5 border-t border-line p-2">
        {user?.isOwner && (
          <Link
            to="/settings"
            className="flex h-9 items-center gap-2.5 rounded-md px-2 text-sm text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            <GearSix size={16} className="text-fg-muted" aria-hidden="true" />
            Settings
          </Link>
        )}
        {user && <AccountMenu user={user} />}
      </div>
    </aside>
  );
}

function RowSkeletons() {
  return (
    <div aria-busy="true" aria-label="Loading pull requests">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 border-b border-line px-4 py-4">
          <div className="h-4 w-4 flex-shrink-0 rounded-full bg-raised" />
          <div className="flex flex-grow flex-col gap-2">
            <div className="h-3 w-2/5 rounded bg-raised" />
            <div className="h-3.5 w-4/5 rounded bg-raised" />
            <div className="h-4 w-1/3 rounded bg-raised/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
