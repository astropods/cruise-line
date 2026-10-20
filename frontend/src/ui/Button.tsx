import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-success-emphasis text-white hover:bg-success-emphasis/85',
  accent: 'bg-accent-emphasis text-white hover:bg-accent-emphasis/85',
  secondary: 'border border-line text-fg hover:bg-raised hover:text-fg-strong',
  ghost: 'text-fg-muted hover:bg-raised hover:text-fg',
  danger: 'border border-danger/40 text-danger-fg hover:bg-danger/10',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 gap-1.5 text-xs',
  md: 'h-8 px-3 gap-2 text-[13px]',
};

/** Button classes, for links that should look like buttons */
export function buttonClass({ variant = 'secondary', size = 'md' }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cx(
    'inline-flex flex-shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
    VARIANTS[variant],
    SIZES[size],
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon */
  icon?: ReactNode;
}

export function Button({ variant, size, icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClass({ variant, size }), className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
