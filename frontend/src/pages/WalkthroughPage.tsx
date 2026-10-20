import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { useWalkthrough } from '../hooks/useWalkthrough';
import { useAuth } from '../hooks/useAuth';
import { SlideoutProvider } from '../contexts/SlideoutContext';
import { CommentsProvider } from '../contexts/CommentsContext';
import { FindingRenderer } from '../components/FindingRenderer';
import { VerdictBanner } from '../components/VerdictBanner';
import { AnalysisProgress } from '../components/AnalysisProgress';
import { FileSlideout } from '../components/FileSlideout';
import { ProgressBar } from '../components/ProgressBar';
import { StaleIndicator } from '../components/StaleIndicator';
import { ReviewRunBanner } from '../components/ReviewRunBanner';
import { ChatPanel } from '../components/ChatPanel';
import { ChatInputBar } from '../components/ChatInputBar';
import { ArchitecturePanel } from '../components/ArchitecturePanel';
import { PageLoading } from '../components/LoadingStates';
import { Md } from '../components/Md';
import { RulesPanel } from '../components/RulesPanel';
import { DotsThree, ArrowsClockwise, ArrowSquareOut, ListNumbers, CaretLeft, WarningCircle } from '@phosphor-icons/react';
import { fetchRules } from '../api';
import type { RuleRef } from '../components/RichContent';

type ViewMode = 'walkthrough' | 'architecture' | 'chat';

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
    prInfo,
    currentHeadSha,
    generate,
  } = useWalkthrough(owner!, repo!, prNumber);

  const [viewMode, setViewMode] = useState<ViewMode>('walkthrough');
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [showRules, setShowRules] = useState(false);
  const [rulesPrefill, setRulesPrefill] = useState<string | undefined>();
  const [repoRules, setRepoRules] = useState<RuleRef[]>([]);
  const [architectureSvgCache, setArchitectureSvgCache] = useState<Record<string, string>>({});
  const [failureDismissed, setFailureDismissed] = useState(false);

  // A PR with no walkthrough yet starts its first review on open.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (status === 'none' && !autoStarted.current) {
      autoStarted.current = true;
      generate();
    }
  }, [status, generate]);

  const rerun = useCallback(() => {
    setFailureDismissed(false);
    generate();
  }, [generate]);

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

  const cacheArchitectureSvg = useCallback((source: string, svg: string) => {
    setArchitectureSvgCache((cache) => (
      cache[source] === svg ? cache : { ...cache, [source]: svg }
    ));
  }, []);

  if (status === 'loading') return <PageLoading />;

  const isRunning = status === 'none' || status === 'pending' || status === 'running';
  const hasReview = !!walkthrough;
  const title = walkthrough?.pr.title ?? prInfo?.title ?? `${owner}/${repo}#${pr}`;
  const author = walkthrough?.pr.author ?? prInfo?.author ?? null;
  const findings = walkthrough?.findings ?? [];

  const findingCounts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  const showRunBanner = hasReview && (isRunning || (status === 'failed' && !failureDismissed));
  // The first review's progress fills the Analysis tab; elsewhere (chat), keep it in view as a banner.
  const showFirstRunBanner = !hasReview && viewMode !== 'walkthrough'
    && (isRunning || (status === 'failed' && !failureDismissed));

  return (
    <SlideoutProvider
      githubUrl={githubUrl}
      owner={owner!}
      repo={repo!}
      prNumber={prNumber}
      headSha={walkthrough?.pr.headSha ?? currentHeadSha ?? ''}
    >
      <CommentsProvider
        owner={owner!}
        repo={repo!}
        pr={prNumber}
        commitId={walkthrough?.pr.headSha ?? currentHeadSha ?? ''}
        userAvatarUrl={user?.avatarUrl ?? ''}
      >
      <div className="flex h-full overflow-hidden bg-[var(--bg-primary)]">
        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Header with tabs */}
          <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border)]">
            <div className="max-w-[920px] mx-auto px-8 py-4 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  to="/"
                  title="Inbox"
                  aria-label="Inbox"
                  className="md:hidden -ml-2 w-7 h-7 flex flex-shrink-0 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <CaretLeft size={16} weight="bold" />
                </Link>
                {author ? (
                  <img
                    src={`${githubUrl}/${author}.png?size=64`}
                    alt={author}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full flex-shrink-0 bg-[var(--bg-tertiary)]" />
                )}
                <div className="flex min-w-0 flex-col">
                  <a href={prUrl} target="_blank" rel="noopener noreferrer" className="truncate text-base font-semibold text-[var(--text-bright)] hover:text-[var(--accent)] transition-colors">
                    {title}
                  </a>
                  <a href={prUrl} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
                    {owner}/{repo}#{pr}{author && ` by ${author}`}
                  </a>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {/* View tabs */}
                <div className="flex shrink-0 rounded-lg bg-[var(--bg-tertiary)] p-0.5">
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
                    onClick={() => setViewMode('architecture')}
                    disabled={!hasReview}
                    title={hasReview ? undefined : 'Available once the review finishes'}
                    className={`px-3 py-1 text-xs rounded-md transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                      viewMode === 'architecture'
                        ? 'bg-[var(--bg-secondary)] text-[var(--text-bright)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Architecture
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

                <HeaderMenu
                  onRegenerate={rerun}
                  regenerateDisabled={isRunning}
                  prUrl={prUrl}
                  onOpenRules={() => setShowRules(true)}
                />
              </div>
            </div>
          </header>

          {/* A run in flight: banner over the previous review, or over chat while the first review runs */}
          {(showRunBanner || showFirstRunBanner) && (
            <ReviewRunBanner
              hasPrevious={hasReview}
              onShowProgress={hasReview ? undefined : () => setViewMode('walkthrough')}
              status={isRunning ? (status === 'running' ? 'running' : 'pending') : 'failed'}
              progress={progress}
              startedAt={startedAt}
              error={error}
              onRetry={rerun}
              onDismiss={() => setFailureDismissed(true)}
            />
          )}

          {/* Stale banner — hidden while a rerun is already on its way */}
          {isStale && !isRunning && viewMode !== 'chat' && <StaleIndicator onRegenerate={rerun} />}

          {/* Content area — walkthrough & chat always mounted; architecture mounts on demand */}
          <div className="flex-1 overflow-hidden relative">
            {/* Walkthrough view */}
            <div
              className="absolute inset-0 overflow-auto transition-opacity duration-200"
              style={{
                opacity: viewMode === 'walkthrough' ? 1 : 0,
                pointerEvents: viewMode === 'walkthrough' ? 'auto' : 'none',
                zIndex: viewMode === 'walkthrough' ? 1 : 0,
              }}
            >
              {!walkthrough ? (
                /* First review: progress (or failure) centered where the review will appear */
                <div className="h-full pb-24">
                  <AnalysisProgress
                    status={status}
                    progress={progress}
                    startedAt={startedAt}
                    error={error}
                    onRetry={rerun}
                  />
                </div>
              ) : (
              <>
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
                {findings.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <WarningCircle size={16} className="text-red-400" />
                    This review came back with no findings. Try regenerating it from the menu.
                  </div>
                )}
                {findings.map((finding, i) => (
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
              </>
              )}
            </div>

            {/* Architecture view */}
            <div
              className="absolute inset-0 overflow-auto transition-opacity duration-200"
              style={{
                opacity: viewMode === 'architecture' ? 1 : 0,
                pointerEvents: viewMode === 'architecture' ? 'auto' : 'none',
                zIndex: viewMode === 'architecture' ? 1 : 0,
              }}
            >
              {viewMode === 'architecture' && walkthrough && (
                <ArchitecturePanel
                  architecture={walkthrough.architecture}
                  onRegenerate={rerun}
                  diagramSvgCache={architectureSvgCache}
                  onDiagramRendered={cacheArchitectureSvg}
                />
              )}
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
                files={walkthrough?.files ?? {}}
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
        <FileSlideout files={walkthrough?.files ?? {}} />
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

function HeaderMenu({ onRegenerate, regenerateDisabled, prUrl, onOpenRules }: {
  onRegenerate: () => void;
  regenerateDisabled: boolean;
  prUrl: string;
  onOpenRules: () => void;
}) {
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
              disabled={regenerateDisabled}
              className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ArrowsClockwise size={14} />
              {regenerateDisabled ? 'Review running…' : 'Regenerate analysis'}
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
          </div>
        </>
      )}
    </div>
  );
}
