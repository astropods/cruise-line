import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { WarningCircle } from '@phosphor-icons/react';
import { fetchRules } from '../../api';
import { useCurrentUser } from '../../app/session';
import { AnalysisProgress } from '../../components/AnalysisProgress';
import { ArchitecturePanel } from '../../components/ArchitecturePanel';
import { ChatInputBar } from '../../components/ChatInputBar';
import { ChatPanel } from '../../components/ChatPanel';
import { FileSlideout } from '../../components/FileSlideout';
import { Md } from '../../components/Md';
import type { RuleRef } from '../../components/RichContent';
import { RulesPanel } from '../../components/RulesPanel';
import { CommentsProvider } from '../../contexts/CommentsContext';
import { SlideoutProvider } from '../../contexts/SlideoutContext';
import { barState } from '../../domain/prStatus';
import { countBySeverity, sortBySeverity } from '../../domain/severity';
import { useWalkthrough } from '../../hooks/useWalkthrough';
import { PageSpinner } from '../../ui';
import { FindingCard } from './FindingCard';
import { PrBar } from './PrBar';
import { VerdictCard } from './VerdictCard';
import { parseReviewView, reviewViewPath, type ReviewView } from './views';

/** One PR: the compact bar, then Analysis, Architecture, or Chat */
export function ReviewPage() {
  const params = useParams<{ owner: string; repo: string; pr: string; view?: string }>();
  const owner = params.owner!;
  const repo = params.repo!;
  const prNumber = Number(params.pr);
  const view = parseReviewView(params.view);
  const navigate = useNavigate();
  const { search } = useLocation();
  const { data: user } = useCurrentUser();

  const {
    walkthrough, status, error, isStale, commitsSinceReview, progress,
    githubUrl, startedAt, prInfo, currentHeadSha, generate,
  } = useWalkthrough(owner, repo, prNumber);

  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [showRules, setShowRules] = useState(false);
  const [rulesPrefill, setRulesPrefill] = useState<string | undefined>();
  const [repoRules, setRepoRules] = useState<RuleRef[]>([]);
  const [architectureSvgCache, setArchitectureSvgCache] = useState<Record<string, string>>({});

  const setView = useCallback(
    (next: ReviewView) => navigate(`${reviewViewPath(owner, repo, prNumber, next)}${search}`),
    [navigate, owner, repo, prNumber, search],
  );

  // A PR that was never reviewed starts its first review on open.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (status === 'none' && !autoStarted.current) {
      autoStarted.current = true;
      generate();
    }
  }, [status, generate]);

  // Rules, for the hover tooltips on rule citations
  const loadRules = useCallback(async () => {
    try {
      const res = await fetchRules(owner, repo);
      setRepoRules(res.rules.map((r) => ({ ruleNumber: r.ruleNumber, rule: r.rule })));
    } catch { /* tooltips just won't show */ }
  }, [owner, repo]);
  useEffect(() => { loadRules(); }, [loadRules]);

  const cacheArchitectureSvg = useCallback((source: string, svg: string) => {
    setArchitectureSvgCache((cache) => (cache[source] === svg ? cache : { ...cache, [source]: svg }));
  }, []);

  if (status === 'loading') return <PageSpinner fill="parent" />;

  const hasReview = !!walkthrough;
  const findings = sortBySeverity(walkthrough?.findings ?? []);
  const prUrl = `${githubUrl}/${owner}/${repo}/pull/${prNumber}`;
  const commitId = walkthrough?.pr.headSha ?? currentHeadSha ?? '';
  const state = barState({ status, prState: prInfo?.state ?? null, verdict: walkthrough?.verdict ?? null, isStale });

  function openRules(prefill?: string) {
    setRulesPrefill(prefill);
    setShowRules(true);
  }

  function startChat(message: string) {
    setChatInitialMessage(message);
    setView('chat');
  }

  return (
    <SlideoutProvider githubUrl={githubUrl} owner={owner} repo={repo} prNumber={prNumber} headSha={commitId}>
      <CommentsProvider owner={owner} repo={repo} pr={prNumber} commitId={commitId} userAvatarUrl={user?.avatarUrl ?? ''}>
        <div className="flex h-full overflow-hidden bg-canvas">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <PrBar
              owner={owner}
              repo={repo}
              number={prNumber}
              title={walkthrough?.pr.title ?? prInfo?.title ?? `${repo} #${prNumber}`}
              author={walkthrough?.pr.author ?? prInfo?.author ?? null}
              details={prInfo}
              prUrl={prUrl}
              view={view}
              onViewChange={setView}
              hasReview={hasReview}
              state={state}
              startedAt={startedAt}
              progress={progress}
              error={error}
              commitsSinceReview={commitsSinceReview}
              onRerun={generate}
              onOpenRules={() => openRules()}
            />

            {/* Analysis and chat stay mounted so switching keeps scroll and chat state */}
            <div className="relative flex-1 overflow-hidden">
              <ViewPane active={view === 'analysis'} scroll>
                {!walkthrough ? (
                  // First review: progress (or failure) where the review will appear
                  <div className="h-full pb-24">
                    <AnalysisProgress status={status} progress={progress} startedAt={startedAt} error={error} onRetry={generate} />
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-6 py-10 pb-28 md:px-8">
                    <div className="cruise-markdown mb-2 text-base leading-7 text-fg-muted">
                      <Md>{walkthrough.summary}</Md>
                    </div>
                    <VerdictCard
                      verdict={walkthrough.verdict}
                      rationale={walkthrough.verdictRationale}
                      counts={countBySeverity(findings)}
                    />
                    {findings.length === 0 && (
                      <p className="flex items-center gap-2 text-sm text-fg-muted">
                        <WarningCircle size={16} className="text-danger" aria-hidden="true" />
                        This review came back with no findings. Try rerunning it from the menu.
                      </p>
                    )}
                    {findings.map((finding, i) => (
                      <FindingCard
                        key={i}
                        id={`finding-${i + 1}`}
                        finding={finding}
                        files={walkthrough.files}
                        onSaveAsRule={openRules}
                        onRuleClick={() => openRules()}
                        rules={repoRules}
                      />
                    ))}
                  </div>
                )}
              </ViewPane>

              <ViewPane active={view === 'architecture'} scroll>
                {view === 'architecture' && walkthrough && (
                  <ArchitecturePanel
                    architecture={walkthrough.architecture}
                    onRegenerate={generate}
                    diagramSvgCache={architectureSvgCache}
                    onDiagramRendered={cacheArchitectureSvg}
                  />
                )}
              </ViewPane>

              <ViewPane active={view === 'chat'}>
                <ChatPanel
                  owner={owner}
                  repo={repo}
                  prNumber={prNumber}
                  files={walkthrough?.files ?? {}}
                  onSwitchToAnalysis={() => setView('analysis')}
                  onRuleClick={() => openRules()}
                  rules={repoRules}
                  initialMessage={chatInitialMessage}
                />
              </ViewPane>

              {/* Outside the scroll container so it stays put at the bottom */}
              {view === 'analysis' && <ChatInputBar onSubmit={startChat} />}
            </div>
          </div>

          <FileSlideout files={walkthrough?.files ?? {}} />
        </div>

        {showRules && (
          <RulesPanel
            owner={owner}
            repo={repo}
            prefill={rulesPrefill}
            onClose={() => { setShowRules(false); setRulesPrefill(undefined); loadRules(); }}
          />
        )}
      </CommentsProvider>
    </SlideoutProvider>
  );
}

/** One view, stacked with the others; inactive ones are inert so focus can't reach them */
function ViewPane({ active, scroll, children }: { active: boolean; scroll?: boolean; children: ReactNode }) {
  return (
    <div
      inert={!active}
      className={`absolute inset-0 transition-opacity duration-200 ${scroll ? 'overflow-auto' : ''} ${
        active ? 'z-[1] opacity-100' : 'pointer-events-none z-0 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}
