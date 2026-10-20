import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 text-fg-muted">{icon}</div>}
      <p className="text-sm font-medium text-fg-strong">{title}</p>
      {children && <div className="mt-1 max-w-72 text-[13px] leading-5 text-fg-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
