import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

type IconButtonVariant = 'outline' | 'ghost' | 'accent';

const VARIANTS: Record<IconButtonVariant, string> = {
  outline: 'border border-line text-fg-muted hover:bg-raised hover:text-fg',
  ghost: 'text-fg-muted hover:bg-raised hover:text-fg',
  accent: 'bg-accent-emphasis text-white hover:bg-accent-emphasis/85',
};

const SIZES = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10 rounded-lg' } as const;

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name, also shown as the tooltip */
  label: string;
  icon: ReactNode;
  size?: keyof typeof SIZES;
  /** Bordered (default), bare, or filled for a primary action like Send */
  variant?: IconButtonVariant;
}

export function IconButton({ label, icon, size = 'md', variant = 'outline', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex flex-shrink-0 items-center justify-center rounded-md transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
