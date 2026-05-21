import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router';
import { useWalkthrough } from '../hooks/useWalkthrough';
import { useAuth } from '../hooks/useAuth';
import { SlideoutProvider } from '../contexts/SlideoutContext';
import { CommentsProvider } from '../contexts/CommentsContext';
import { FindingRenderer } from '../components/FindingRenderer';
import { VerdictBanner } from '../components/VerdictBanner';
import { FindingNav } from '../components/FindingNav';
import { MiniNav } from '../components/MiniNav';
import { AnalysisProgress } from '../components/AnalysisProgress';
import { FileSlideout } from '../components/FileSlideout';
import { ProgressBar } from '../components/ProgressBar';
import { StaleIndicator } from '../components/StaleIndicator';
import { ChatPanel } from '../components/ChatPanel';
import { ChatInputBar } from '../components/ChatInputBar';
import { PageLoading, ErrorState } from '../components/LoadingStates';
import { Md } from '../components/Md';
import { RulesPanel } from '../components/RulesPanel';
import { DotsThree, ArrowsClockwise, ArrowSquareOut, ListNumbers, SignOut } from '@phosphor-icons/react';
import type { Severity, ReviewRule } from '../api';
import { fetchRules, logout } from '../api';
import type { RuleRef } from '../components/RichContent';

type ViewMode = 'walkthrough' | 'chat';

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
    startedAt,
    generate,
    reload,
  } = useWalkthrough(owner!, repo!, prNumber);

  const [viewMode, setViewMode] = useState<ViewMode>('walkthrough');
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [showRules, setShowRules] = useState(false);
  const [rulesPrefill, setRulesPrefill] = useState<string | undefined>();
  const [repoRules, setRepoRules] = useState<RuleRef[]>([]);

  // Fetch rules for hover tooltips
  const loadRules = useCallback(async () => {
    try {
      const res = await fetchRules(owner!, repo!);
      setRepoRules(res.rules.map((r) => ({ ruleNumber: r.ruleNumber, rule: r.rule })));
    } catch {}
  }, [owner, repo]);

  useEffect(() => { loadRules(); }, [loadRules]);

  function openRulesWithPrefill(prefill: string) {
    setRulesPrefill(prefill);
    setShowRules(true);
  }

  function openRulesAtRule(_ruleNumber: number) {
    setRulesPrefill(undefined);
    setShowRules(true);
  }

  const prUrl = `${githubUrl}/${owner}/${repo}/pull/${pr}`;

  function startChat(message: string) {
    setChatInitialMessage(message);
    setViewMode('chat');
  }

  // Loading
  if (status === 'loading') return <PageLoading />;

  // Auto-start analysis, show progress, or show error with retry
  if (status === 'none' || status === 'pending' || status === 'running' || status === 'failed') {
    return (
      <AutoStartAnalysis
        status={status}
        generate={generate}
        owner={owner!}
        repo={repo!}
        pr={pr!}
        progress={progress}
        githubUrl={githubUrl}
        startedAt={startedAt}
        error={error}
      />
    );
  }

  if (!walkthrough || !walkthrough.findings?.length) {
    return <ErrorState message="Analysis has no content" onRetry={generate} />;
  }

  const findingCounts = {
    critical: walkthrough.findings.filter((f) => f.severity === 'critical').length,
    high: walkthrough.findings.filter((f) => f.severity === 'high').length,
    medium: walkthrough.findings.filter((f) => f.severity === 'medium').length,
    low: walkthrough.findings.filter((f) => f.severity === 'low').length,
    info: walkthrough.findings.filter((f) => f.severity === 'info').length,
  };

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
        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden cruise-main-container">
          {/* Header with tabs */}
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

              <div className="flex items-center gap-3">
                {/* View tabs */}
                <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-0.5">
                  <button
                    onClick={() => setViewMode('walkthrough')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      viewMode === 'walkthrough'
                        ? 'bg-[var(--bg-secondary)] text-[var(--text-bright)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Analysis
                  </button>
                  <button
                    onClick={() => { setViewMode('chat'); setChatInitialMessage(undefined); }}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      viewMode === 'chat'
                        ? 'bg-[var(--bg-secondary)] text-[var(--text-bright)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Chat
                  </button>
                </div>

                <HeaderMenu onRegenerate={generate} prUrl={prUrl} onOpenRules={() => setShowRules(true)} />
              </div>
            </div>
          </header>

          {/* Stale banner */}
          {isStale && viewMode === 'walkthrough' && <StaleIndicator onRegenerate={generate} />}

          {/* Content area — both views always mounted, active one visible */}
          <div className="flex-1 overflow-hidden relative">
            {/* Finding header nav — overlays top of content area when sidebar doesn't fit */}
            {viewMode === 'walkthrough' && walkthrough.findings.length > 1 && (
              <FindingNav findings={walkthrough.findings} />
            )}

            {/* Walkthrough view */}
            <div
              className="absolute inset-0 overflow-auto transition-opacity duration-200"
              style={{
                opacity: viewMode === 'walkthrough' ? 1 : 0,
                pointerEvents: viewMode === 'walkthrough' ? 'auto' : 'none',
                zIndex: viewMode === 'walkthrough' ? 1 : 0,
              }}
            >
              <ProgressBar />
              <main className="max-w-[800px] mx-auto px-8 py-12 pb-24">
                <div className="mb-10 cruise-markdown text-[1.125rem] leading-[1.8] text-[var(--text-secondary)]">
                  <Md>{walkthrough.summary}</Md>
                </div>
                <VerdictBanner
                  verdict={walkthrough.verdict}
                  rationale={walkthrough.verdictRationale}
                  findingCounts={findingCounts}
                />
                {walkthrough.findings.map((finding, i) => (
                  <FindingRenderer
                    key={i}
                    finding={finding}
                    files={walkthrough.files}
                    index={i}
                    onSaveAsRule={openRulesWithPrefill}
                    onRuleClick={openRulesAtRule}
                    rules={repoRules}
                  />
                ))}
              </main>
              <MiniNav findings={walkthrough.findings} />
            </div>

            {/* Chat view */}
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{
                opacity: viewMode === 'chat' ? 1 : 0,
                pointerEvents: viewMode === 'chat' ? 'auto' : 'none',
                zIndex: viewMode === 'chat' ? 1 : 0,
              }}
            >
              <ChatPanel
                owner={owner!}
                repo={repo!}
                prNumber={prNumber}
                files={walkthrough.files}
                onSwitchToWalkthrough={() => setViewMode('walkthrough')}
                onRuleClick={openRulesAtRule}
                rules={repoRules}
                initialMessage={chatInitialMessage}
              />
            </div>

            {/* Chat input bar — outside scroll container so it stays fixed at bottom of main panel */}
            {viewMode === 'walkthrough' && (
              <ChatInputBar onSubmit={startChat} />
            )}
          </div>
        </div>

        {/* File side panel */}
        <FileSlideout files={walkthrough.files} />
      </div>

      {/* Rules management modal */}
      {showRules && (
        <RulesPanel
          owner={owner!}
          repo={repo!}
          prefill={rulesPrefill}
          onClose={() => { setShowRules(false); setRulesPrefill(undefined); loadRules(); }}
        />
      )}
      </CommentsProvider>
    </SlideoutProvider>
  );
}

function AutoStartAnalysis({ status, generate, owner, repo, pr, progress, githubUrl, startedAt, error }: {
  status: string;
  generate: () => void;
  owner: string;
  repo: string;
  pr: string;
  progress: import('../api').ProgressEntry[];
  githubUrl: string;
  startedAt: string | null;
  error: string | null;
}) {
  const triggered = useRef(false);

  useEffect(() => {
    if (status === 'none' && !triggered.current) {
      triggered.current = true;
      generate();
    }
  }, [status, generate]);

  return (
    <AnalysisProgress
      owner={owner}
      repo={repo}
      pr={pr}
      status={status}
      progress={progress}
      githubUrl={githubUrl}
      startedAt={startedAt}
      error={error}
      onRetry={generate}
    />
  );
}

function HeaderMenu({ onRegenerate, prUrl, onOpenRules }: { onRegenerate: () => void; prUrl: string; onOpenRules: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
      >
        <DotsThree size={18} weight="bold" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xl z-30 py-1">
            <button
              onClick={() => { onOpenRules(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
            >
              <ListNumbers size={14} />
              Review rules
            </button>
            <button
              onClick={() => { onRegenerate(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
            >
              <ArrowsClockwise size={14} />
              Regenerate analysis
            </button>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
            >
              <ArrowSquareOut size={14} />
              View PR on GitHub
            </a>
            <div className="my-1 border-t border-[var(--border)]" />
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
            >
              <SignOut size={14} />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
