import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/cx';

export type MenuItem =
  | { kind?: 'action'; label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }
  | { kind: 'link'; label: string; icon?: ReactNode; to: string }
  | { kind: 'external'; label: string; icon?: ReactNode; href: string }
  | { kind: 'divider' };

interface MenuProps {
  /** Renders the trigger; spread `props` onto a button */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-controls': string; 'aria-haspopup': 'menu' }) => ReactNode;
  items: readonly MenuItem[];
  /** Open above the trigger (for footers) or below it */
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  className?: string;
}

const itemClass = cx(
  'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-fg transition-colors',
  'hover:bg-raised hover:text-fg-strong focus-visible:bg-raised focus-visible:outline-none',
  'disabled:pointer-events-none disabled:opacity-40',
);

/** A small popover menu. Closes on selection, outside click, and Escape. */
export function Menu({ trigger, items, side = 'bottom', align = 'end', className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Claim the Escape so a slideout or dialog underneath stays open
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className={cx('relative', className)}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-controls': id, 'aria-haspopup': 'menu' })}
      {open && (
        <div
          id={id}
          role="menu"
          className={cx(
            'absolute z-40 min-w-48 rounded-lg border border-line bg-surface py-1 shadow-xl shadow-black/40',
            side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => {
            if (item.kind === 'divider') return <div key={i} role="separator" className="my-1 border-t border-line" />;
            if (item.kind === 'link') {
              return (
                <Link key={i} role="menuitem" to={item.to} onClick={close} className={itemClass}>
                  {item.icon}{item.label}
                </Link>
              );
            }
            if (item.kind === 'external') {
              return (
                <a key={i} role="menuitem" href={item.href} target="_blank" rel="noopener noreferrer" onClick={close} className={itemClass}>
                  {item.icon}{item.label}
                </a>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { close(); item.onSelect(); }}
                className={itemClass}
              >
                {item.icon}{item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
