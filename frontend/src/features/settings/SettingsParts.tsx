import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

/** The title and description at the top of a settings section */
export function SectionHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 border-b border-line pb-7">
      <h1 className="text-[28px] leading-9 font-semibold tracking-tight text-fg-strong">{title}</h1>
      <p className="max-w-[600px] text-sm leading-[22px] text-fg-muted">{children}</p>
    </header>
  );
}

/** A label and hint on the left, controls on the right */
export function SettingRow({ label, hint, aside, children, last }: {
  label: string;
  hint?: ReactNode;
  /** Extra content under the hint, like a reset link */
  aside?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section className={cx('flex flex-col gap-4 py-7 md:flex-row md:gap-8', !last && 'border-b border-line')}>
      <div className="flex flex-shrink-0 flex-col gap-1 md:w-60">
        <h2 className="text-sm leading-5 font-semibold text-fg-strong">{label}</h2>
        {hint && <p className="text-[13px] leading-5 text-fg-muted">{hint}</p>}
        {aside && <div className="pt-2">{aside}</div>}
      </div>
      <div className="flex min-w-0 flex-grow flex-col gap-4">{children}</div>
    </section>
  );
}

/** An inline notice at the top of a section */
export function Notice({ tone, children }: { tone: 'success' | 'danger' | 'accent'; children: ReactNode }) {
  const classes = {
    success: 'border-success/40 bg-success/10 text-success',
    danger: 'border-danger/40 bg-danger/10 text-danger-fg',
    accent: 'border-accent-emphasis/40 bg-accent-emphasis/15 text-accent-strong',
  }[tone];
  return <div role="status" className={cx('mt-6 rounded-lg border px-4 py-3 text-sm', classes)}>{children}</div>;
}
