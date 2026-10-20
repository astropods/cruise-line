import type { InboxTab } from '../../domain/prStatus';
import { cx } from '../../lib/cx';
import { INBOX_TABS } from './inboxModel';

interface InboxTabsProps {
  value: InboxTab;
  onChange: (tab: InboxTab) => void;
  counts: Record<InboxTab, number> | null;
}

export function InboxTabs({ value, onChange, counts }: InboxTabsProps) {
  return (
    <div role="tablist" aria-label="Inbox" className="flex gap-5 border-b border-line px-4">
      {INBOX_TABS.map((tab) => {
        const selected = tab.value === value;
        const count = counts?.[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cx(
              '-mb-px flex items-center gap-1.5 border-b-2 pt-2 pb-2.5 text-[13px] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              selected ? 'border-accent font-medium text-fg-strong' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
            {count != null && tab.value !== 'done' && (
              tab.value === 'attention' && count > 0 ? (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-[18px] text-canvas">{count}</span>
              ) : (
                <span className="text-xs text-fg-muted">{count}</span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
