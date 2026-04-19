import { useState } from 'react';
import { useParams } from 'react-router';
import { useWalkthrough } from '../hooks/useWalkthrough';
import { useAuth } from '../hooks/useAuth';
import { SlideoutProvider } from '../contexts/SlideoutContext';
import { CommentsProvider } from '../contexts/CommentsContext';
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
  const { user } = useAuth();

  const {
    walkthrough,
    status,
    error,
    isStale,
    progress,
    githubUrl,
    generate,
    reload,
  } = useWalkthrough(owner!, repo!, prNumber);

  const prUrl = `${githubUrl}/${owner}/${repo}/pull/${pr}`;

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
    <SlideoutProvider
      githubUrl={githubUrl}
      owner={owner!}
      repo={repo!}
      prNumber={prNumber}
      headSha={walkthrough.pr.headSha}
    >
      <CommentsProvider
        owner={owner!}
        repo={repo!}
        pr={prNumber}
        commitId={walkthrough.pr.headSha}
        userAvatarUrl={user?.avatarUrl ?? ''}
      >
      <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
        {/* Main scrollable document */}
        <div className="flex-1 min-w-0 overflow-auto">
          <ProgressBar />

          {/* Stale banner */}
          {isStale && <StaleIndicator onRegenerate={generate} />}

          {/* Header */}
          <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border)]">
            <div className="max-w-[800px] mx-auto px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={`${githubUrl}/${walkthrough.pr.author}.png?size=64`}
                  alt={walkthrough.pr.author}
                  className="w-8 h-8 rounded-full flex-shrink-0"
                />
                <div className="flex flex-col">
                  <a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-base font-semibold text-[var(--text-bright)] tracking-tight hover:text-[var(--accent)] transition-colors">
                    {walkthrough.pr.title}
                  </a>
                  <a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
                    {walkthrough.pr.repo}#{walkthrough.pr.number} by {walkthrough.pr.author}
                  </a>
                </div>
              </div>
              <HeaderMenu onRegenerate={generate} prUrl={prUrl} />
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
      </CommentsProvider>
    </SlideoutProvider>
  );
}

function HeaderMenu({ onRegenerate, prUrl }: { onRegenerate: () => void; prUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xl z-30 py-1">
            <button
              onClick={() => { onRegenerate(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"/>
              </svg>
              Regenerate walkthrough
            </button>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5H4.56l6.22 6.22a.75.75 0 1 1-1.06 1.06L3.5 4.56v2.69a.75.75 0 0 1-1.5 0v-3.5A1.75 1.75 0 0 1 3.75 2Zm6.5 0h2A1.75 1.75 0 0 1 14 3.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-2a.75.75 0 0 1 1.5 0v2c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25h-2a.75.75 0 0 1 0-1.5Z"/>
              </svg>
              View PR on GitHub
            </a>
          </div>
        </>
      )}
    </div>
  );
}
