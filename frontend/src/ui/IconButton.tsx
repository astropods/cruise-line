import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name, also shown as the tooltip */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
  /** Bordered (default) or bare */
  variant?: 'outline' | 'ghost';
}

export function IconButton({ label, icon, size = 'md', variant = 'outline', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex flex-shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors',
        'hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        variant === 'outline' && 'border border-line',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
