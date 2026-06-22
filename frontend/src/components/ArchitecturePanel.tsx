import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { Md } from './Md';
import type { ArchitectureAnalysis, ArchitectureDiagram } from '../api';

interface ArchitecturePanelProps {
  architecture?: ArchitectureAnalysis;
  onRegenerate: () => void;
}

let mermaidInitialized = false;

export function ArchitecturePanel({ architecture, onRegenerate }: ArchitecturePanelProps) {
  if (!architecture?.diagrams?.length) {
    return (
      <main className="max-w-[920px] mx-auto px-8 py-12 pb-24">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-bright)]">
            Architecture is not available for this analysis
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Regenerate the analysis to produce architecture notes and diagrams for this PR.
          </p>
          <button
            onClick={onRegenerate}
            className="mt-4 inline-flex items-center rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#07111f] transition-colors hover:bg-[var(--accent-hover)]"
          >
            Regenerate analysis
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-[920px] mx-auto px-8 py-12 pb-24">
      <section className="mb-10">
        <p className="mb-3 text-xs font-semibold uppercase text-[var(--accent)]">
          Architecture
        </p>
        <div className="cruise-markdown text-[1.05rem] leading-[1.75] text-[var(--text-secondary)]">
          <Md>{architecture.overview}</Md>
        </div>
      </section>

      {architecture.steps.length > 0 && (
        <section className="mb-10 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase text-[var(--text-secondary)]">
            Reading path
          </h2>
          <ol className="space-y-3">
            {architecture.steps.map((step, index) => (
              <li key={`${index}-${step}`} className="flex gap-3 text-sm leading-6 text-[var(--text-primary)]">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)] font-mono text-[11px] text-[var(--accent)]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="space-y-6">
        {architecture.diagrams.map((diagram, index) => (
          <DiagramCard key={`${diagram.title}-${index}`} diagram={diagram} />
        ))}
      </div>
    </main>
  );
}

function DiagramCard({ diagram }: { diagram: ArchitectureDiagram }) {
  const [copied, setCopied] = useState(false);
  const source = normalizeMermaidSource(diagram.mermaid);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err: unknown) => {
      console.warn('Failed to copy Mermaid source', err);
    });
  }, [source]);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--text-bright)]">
              {diagram.title}
            </h2>
            <span className="rounded bg-[var(--bg-tertiary)] px-2 py-0.5 text-[11px] font-medium uppercase text-[var(--text-secondary)]">
              {diagram.kind === 'sequence' ? 'Sequence' : 'Flowchart'}
            </span>
          </div>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            {diagram.description}
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          title="Copy raw Mermaid source"
        >
          {copied ? (
            <>
              <Check size={13} weight="bold" className="text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              Copy Mermaid
            </>
          )}
        </button>
      </div>
      <MermaidDiagram source={source} />
    </section>
  );
}

function MermaidDiagram({ source }: { source: string }) {
  const idBase = useRef(`architecture-mermaid-${Math.random().toString(36).slice(2)}`);
  const renderCount = useRef(0);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const renderId = `${idBase.current}-${renderCount.current++}`;

    async function render() {
      if (!source.trim()) {
        setSvg('');
        setError('Diagram source is empty.');
        return;
      }

      try {
        setError(null);
        setSvg('');
        const { default: mermaid } = await import('mermaid');
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'base',
            themeVariables: {
              background: '#161b22',
              primaryColor: '#21262d',
              primaryBorderColor: '#58a6ff',
              primaryTextColor: '#e6edf3',
              lineColor: '#8b949e',
              secondaryColor: '#0d1117',
              tertiaryColor: '#21262d',
              actorBkg: '#21262d',
              actorBorder: '#58a6ff',
              actorTextColor: '#e6edf3',
              signalColor: '#c9d1d9',
              signalTextColor: '#c9d1d9',
              noteBkgColor: '#21262d',
              noteTextColor: '#c9d1d9',
              noteBorderColor: '#30363d',
            },
          });
          mermaidInitialized = true;
        }

        const rendered = await mermaid.render(renderId, source);
        if (!cancelled) setSvg(rendered.svg);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to render diagram.');
        }
      }
    }

    render();
    return () => {
      cancelled = true;
      document.getElementById(renderId)?.remove();
    };
  }, [source]);

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Mermaid could not render this diagram.
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-[var(--bg-primary)] p-3 font-mono text-xs text-[var(--text-primary)]">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="architecture-diagram overflow-auto bg-[var(--bg-primary)] p-5">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="flex min-h-48 items-center justify-center text-sm text-[var(--text-secondary)]">
          Rendering diagram...
        </div>
      )}
    </div>
  );
}

function normalizeMermaidSource(source: string) {
  return source
    .replace(/^```mermaid\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
