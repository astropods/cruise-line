import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line px-1 font-mono text-[11px] text-fg-muted">
      {children}
    </kbd>
  );
}
