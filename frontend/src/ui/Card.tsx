import type { HTMLAttributes } from 'react';
import { cx } from '../lib/cx';

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...rest }: DivProps) {
  return <div className={cx('flex flex-col rounded-lg border border-line bg-canvas', className)} {...rest} />;
}

export function CardHeader({ className, ...rest }: DivProps) {
  return <div className={cx('flex items-center gap-3 border-b border-line px-4 py-3.5', className)} {...rest} />;
}

export function CardBody({ className, ...rest }: DivProps) {
  return <div className={cx('flex flex-col gap-3.5 p-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: DivProps) {
  return (
    <div
      className={cx('flex items-center justify-between gap-3 rounded-b-lg border-t border-line bg-surface px-4 py-3', className)}
      {...rest}
    />
  );
}
