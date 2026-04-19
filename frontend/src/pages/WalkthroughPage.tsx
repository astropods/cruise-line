import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import { useWalkthrough } from '../hooks/useWalkthrough';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { CodePanel } from '../components/CodePanel';
import { ExplanationPanel } from '../components/ExplanationPanel';
import { ChapterNav } from '../components/ChapterNav';
import { StepControls } from '../components/StepControls';
import { GenerateButton } from '../components/GenerateButton';
import { StaleIndicator } from '../components/StaleIndicator';
import { PageLoading, ErrorState } from '../components/LoadingStates';

export function WalkthroughPage() {
  const { owner, repo, pr } = useParams<{ owner: string; repo: string; pr: string }>();
  const prNumber = Number(pr);

  const {
    walkthrough,
    status,
    error,
    isStale,
    progress,
    generate,
    reload,
  } = useWalkthrough(owner!, repo!, prNumber);

  const [chapterIndex, setChapterIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  // Compute total steps and current global step index
  const { totalSteps, globalStepIndex } = useMemo(() => {
    if (!walkthrough) return { totalSteps: 0, globalStepIndex: 0 };
    let total = 0;
    let global = 0;
    for (let ci = 0; ci < walkthrough.chapters.length; ci++) {
      if (ci < chapterIndex) global += walkthrough.chapters[ci].steps.length;
      else if (ci === chapterIndex) global += stepIndex;
      total += walkthrough.chapters[ci].steps.length;
    }
    return { totalSteps: total, globalStepIndex: global };
  }, [walkthrough, chapterIndex, stepIndex]);

  const navigate = useCallback(
    (ci: number, si: number) => {
      setChapterIndex(ci);
      setStepIndex(si);
    },
    [],
  );

  const goPrev = useCallback(() => {
    if (!walkthrough) return;
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    } else if (chapterIndex > 0) {
      const prevChapter = walkthrough.chapters[chapterIndex - 1];
      setChapterIndex(chapterIndex - 1);
      setStepIndex(prevChapter.steps.length - 1);
    }
  }, [walkthrough, chapterIndex, stepIndex]);

  const goNext = useCallback(() => {
    if (!walkthrough) return;
    const chapter = walkthrough.chapters[chapterIndex];
    if (stepIndex < chapter.steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else if (chapterIndex < walkthrough.chapters.length - 1) {
      setChapterIndex(chapterIndex + 1);
      setStepIndex(0);
    }
  }, [walkthrough, chapterIndex, stepIndex]);

  const goPrevChapter = useCallback(() => {
    if (chapterIndex > 0) {
      setChapterIndex(chapterIndex - 1);
      setStepIndex(0);
    }
  }, [chapterIndex]);

  const goNextChapter = useCallback(() => {
    if (!walkthrough) return;
    if (chapterIndex < walkthrough.chapters.length - 1) {
      setChapterIndex(chapterIndex + 1);
      setStepIndex(0);
    }
  }, [walkthrough, chapterIndex]);

  useKeyboardNav({
    onPrev: goPrev,
    onNext: goNext,
    onPrevChapter: goPrevChapter,
    onNextChapter: goNextChapter,
  });

  // Loading state
  if (status === 'loading') return <PageLoading />;

  // Error state
  if (status === 'failed') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />;
  }

  // No walkthrough yet or still generating
  if (status === 'none' || status === 'pending' || status === 'running') {
    return (
      <GenerateButton
        onGenerate={generate}
        status={status}
        progress={progress}
        prTitle={`${owner}/${repo}#${pr}`}
      />
    );
  }

  // Walkthrough ready
  if (!walkthrough || walkthrough.chapters.length === 0) {
    return <ErrorState message="Walkthrough has no content" onRetry={generate} />;
  }

  const chapter = walkthrough.chapters[chapterIndex];
  const step = chapter.steps[stepIndex];
  const stepKey = `${chapterIndex}-${stepIndex}`;
  const hasPrev = globalStepIndex > 0;
  const hasNext = globalStepIndex < totalSteps - 1;

  return (
    <div className="h-screen flex flex-col">
      {/* Stale banner */}
      {isStale && <StaleIndicator onRegenerate={generate} />}

      {/* PR header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">
            {walkthrough.pr.title}
          </h1>
          <span className="text-xs text-[var(--text-secondary)]">
            {walkthrough.pr.repo}#{walkthrough.pr.number} by {walkthrough.pr.author}
          </span>
        </div>
        <button
          onClick={generate}
          className="px-3 py-1 text-xs rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
        >
          Regenerate
        </button>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Chapter sidebar */}
        <ChapterNav
          chapters={walkthrough.chapters}
          currentChapter={chapterIndex}
          currentStep={stepIndex}
          onNavigate={navigate}
        />

        {/* Code panel (60%) */}
        <div className="flex-[3] min-w-0">
          <CodePanel step={step} stepKey={stepKey} files={walkthrough.files} />
        </div>

        {/* Explanation panel (40%) */}
        <div className="flex-[2] min-w-0 border-l border-[var(--border)]">
          <ExplanationPanel
            step={step}
            stepKey={stepKey}
            chapterTitle={chapter.title}
            chapterIntent={chapter.intent}
          />
        </div>
      </div>

      {/* Bottom navigation */}
      <StepControls
        currentGlobalStep={globalStepIndex}
        totalSteps={totalSteps}
        onPrev={goPrev}
        onNext={goNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
      />
    </div>
  );
}
