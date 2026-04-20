/**
 * A minimal line-art cruise ship illustration for the chat empty state.
 * Uses the app's accent color via currentColor.
 */
export function CruiseIllustration({ size = 140, className = '' }: { size?: number; className?: string }) {
  const w = size;
  const h = size * 0.7;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 140 98"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Water / waves */}
      <path
        d="M0 78 Q12 72, 24 78 Q36 84, 48 78 Q60 72, 72 78 Q84 84, 96 78 Q108 72, 120 78 Q132 84, 140 78"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.2"
      />
      <path
        d="M0 88 Q12 82, 24 88 Q36 94, 48 88 Q60 82, 72 88 Q84 94, 96 88 Q108 82, 120 88 Q132 94, 140 88"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.1"
      />

      {/* Hull */}
      <path
        d="M25 72 L30 58 L110 58 L115 72 Z"
        fill="currentColor"
        opacity="0.08"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeOpacity="0.3"
      />

      {/* Deck / cabin block */}
      <rect
        x="40" y="40" width="60" height="18" rx="2"
        fill="currentColor"
        opacity="0.06"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      />

      {/* Cabin windows — portholes */}
      <circle cx="52" cy="49" r="2.5" fill="currentColor" opacity="0.15" />
      <circle cx="62" cy="49" r="2.5" fill="currentColor" opacity="0.15" />
      <circle cx="72" cy="49" r="2.5" fill="currentColor" opacity="0.15" />
      <circle cx="82" cy="49" r="2.5" fill="currentColor" opacity="0.15" />

      {/* Smokestack */}
      <rect
        x="62" y="24" width="16" height="16" rx="2"
        fill="currentColor"
        opacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      />

      {/* Code brackets on smokestack */}
      <text
        x="70" y="37"
        textAnchor="middle"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        fontWeight="600"
        fill="currentColor"
        opacity="0.4"
      >
        {'{/}'}
      </text>

      {/* Smoke wisps */}
      <path
        d="M68 24 Q66 18, 68 12 Q70 6, 66 0"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.12"
      />
      <path
        d="M72 24 Q74 16, 72 10 Q70 4, 74 -2"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.08"
      />

      {/* Bow flag / antenna */}
      <line
        x1="108" y1="40" x2="108" y2="28"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.25"
      />
      <path
        d="M108 28 L118 32 L108 36"
        fill="currentColor"
        opacity="0.15"
      />

      {/* Magnifying glass — review motif, floating near bow */}
      <circle
        cx="122" cy="18" r="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.2"
        fill="currentColor"
        fillOpacity="0.04"
      />
      <line
        x1="127" y1="23" x2="132" y2="28"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.2"
      />
    </svg>
  );
}
