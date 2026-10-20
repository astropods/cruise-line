/** The Cruise Line mark: a hull over a wave */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-shrink-0 items-center justify-center rounded-md bg-accent"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 16 16" fill="none" stroke="var(--color-canvas)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 10.5c2 1.5 4 1.5 6 0s4-1.5 6 0M3 7l5-4 5 4" />
      </svg>
    </span>
  );
}
