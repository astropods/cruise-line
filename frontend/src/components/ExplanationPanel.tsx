import { motion, AnimatePresence } from 'framer-motion';
import type { Step } from '../api';

interface ExplanationPanelProps {
  step: Step;
  stepKey: string;
  chapterTitle: string;
  chapterIntent: string;
}

export function ExplanationPanel({
  step,
  stepKey,
  chapterTitle,
  chapterIntent,
}: ExplanationPanelProps) {
  return (
    <div className="h-full overflow-auto p-6 bg-[var(--bg-primary)]">
      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {/* Chapter context */}
          <div className="mb-4 pb-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {chapterTitle}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {chapterIntent}
            </p>
          </div>

          {/* Step details */}
          <h3 className="text-base font-medium text-[var(--accent)] mb-3">
            {step.title}
          </h3>

          <div className="prose prose-invert prose-sm max-w-none text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
            {step.explanation}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
