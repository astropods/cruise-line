import { useParams } from 'react-router';
import { useWalkthrough } from '../hooks/useWalkthrough';
import { SlideoutProvider } from '../contexts/SlideoutContext';
import { SectionRenderer } from '../components/SectionRenderer';
import { FileSlideout } from '../components/FileSlideout';
import { MiniNav } from '../components/MiniNav';
import { ProgressBar } from '../components/ProgressBar';
import { GenerateButton } from '../components/GenerateButton';
import { StaleIndicator } from '../components/StaleIndicator';
import { PageLoading, ErrorState } from '../components/LoadingStates';
import Markdown from 'react-markdown';

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

  // Loading
  if (status === 'loading') return <PageLoading />;

  // Error
  if (status === 'failed') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />;
  }

  // No walkthrough / generating
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
  if (!walkthrough || !walkthrough.sections?.length) {
    return <ErrorState message="Walkthrough has no content" onRetry={generate} />;
  }

  return (
    <SlideoutProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
        {/* Main scrollable document */}
        <div className="flex-1 min-w-0 overflow-auto">
          <ProgressBar />

          {/* Stale banner */}
          {isStale && <StaleIndicator onRegenerate={generate} />}

          {/* Header */}
          <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border)]">
            <div className="max-w-[800px] mx-auto px-8 py-4 flex items-center justify-between">
              <div>
                <h1 className="text-base font-semibold text-[var(--text-bright)] tracking-tight">
                  {walkthrough.pr.title}
                </h1>
                <span className="text-xs text-[var(--text-secondary)]">
                  {walkthrough.pr.repo}#{walkthrough.pr.number} by {walkthrough.pr.author}
                </span>
              </div>
              <button
                onClick={generate}
                className="px-3 py-1.5 text-xs rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
              >
                Regenerate
              </button>
            </div>
          </header>

          {/* Main document */}
          <main className="max-w-[800px] mx-auto px-8 py-12">
            {/* Summary */}
            <div className="mb-20 cruise-markdown text-[1.125rem] leading-[1.8] text-[var(--text-secondary)]">
              <Markdown>{walkthrough.summary}</Markdown>
            </div>

            {/* Sections */}
            {walkthrough.sections.map((section, i) => (
              <SectionRenderer
                key={i}
                section={section}
                files={walkthrough.files}
                index={i}
              />
            ))}
          </main>

          {/* Navigation */}
          <MiniNav sections={walkthrough.sections} />
        </div>

        {/* File side panel — sits alongside the document */}
        <FileSlideout files={walkthrough.files} />
      </div>
    </SlideoutProvider>
  );
}
