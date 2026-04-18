interface StaleIndicatorProps {
  onRegenerate: () => void;
}

export function StaleIndicator({ onRegenerate }: StaleIndicatorProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-yellow-900/20 border-b border-yellow-700/50 text-sm">
      <span className="text-yellow-400">
        This walkthrough is for an older version of the PR. New commits have been pushed.
      </span>
      <button
        onClick={onRegenerate}
        className="ml-4 px-3 py-1 text-xs font-medium rounded border border-yellow-600 text-yellow-400 hover:bg-yellow-900/30 transition-colors"
      >
        Regenerate
      </button>
    </div>
  );
}
