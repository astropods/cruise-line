interface StepControlsProps {
  currentGlobalStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function StepControls({
  currentGlobalStep,
  totalSteps,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: StepControlsProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="px-4 py-1.5 text-sm rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Prev
      </button>

      <span className="text-sm text-[var(--text-secondary)]">
        Step {currentGlobalStep + 1} of {totalSteps}
      </span>

      <button
        onClick={onNext}
        disabled={!hasNext}
        className="px-4 py-1.5 text-sm rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
}
