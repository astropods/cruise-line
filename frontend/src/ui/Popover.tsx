import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

interface PopoverProps {
  /** Renders the trigger; spread `props` onto a button */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-controls': string }) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  panelClassName?: string;
}

/** A panel anchored under its trigger. Closes on outside click and Escape. */
export function Popover({ trigger, children, align = 'end', className, panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cx('relative', className)}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-controls': id })}
      {open && (
        <div
          id={id}
          className={cx(
            'absolute top-full z-40 mt-1.5 rounded-lg border border-line bg-surface p-3 shadow-xl shadow-black/40',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
