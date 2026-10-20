import { ArrowClockwise, TreeStructure } from '@phosphor-icons/react';
import type { ArchitectureAnalysis } from '../../api';
import { Button, Card, CardBody, EmptyState, Md } from '../../ui';
import { DiagramCard } from './DiagramCard';

interface ArchitecturePanelProps {
  architecture?: ArchitectureAnalysis;
  onRegenerate: () => void;
  diagramSvgCache?: Record<string, string>;
  onDiagramRendered?: (source: string, svg: string) => void;
}

/** The Architecture view: overview, reading path, then each diagram */
export function ArchitecturePanel({ architecture, onRegenerate, diagramSvgCache = {}, onDiagramRendered }: ArchitecturePanelProps) {
  if (!architecture?.diagrams?.length) {
    return (
      <main className="mx-auto max-w-[920px] px-8 py-12 pb-24">
        <Card className="bg-surface">
          <EmptyState
            icon={<TreeStructure size={28} />}
            title="No architecture for this review"
            action={<Button icon={<ArrowClockwise size={14} />} onClick={onRegenerate}>Rerun review</Button>}
          >
            Rerun the review to produce architecture notes and diagrams for this PR.
          </EmptyState>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[920px] px-8 py-12 pb-24">
      <section className="mb-10">
        <p className="mb-3 text-xs font-semibold uppercase text-accent">Architecture</p>
        <div className="cruise-markdown text-[1.05rem] leading-[1.75] text-fg-muted">
          <Md>{architecture.overview}</Md>
        </div>
      </section>

      {architecture.steps.length > 0 && <ReadingPath steps={architecture.steps} />}

      <div className="space-y-6">
        {architecture.diagrams.map((diagram, index) => (
          <DiagramCard
            key={`${diagram.title}-${index}`}
            diagram={diagram}
            diagramSvgCache={diagramSvgCache}
            onDiagramRendered={onDiagramRendered}
          />
        ))}
      </div>
    </main>
  );
}

function ReadingPath({ steps }: { steps: string[] }) {
  return (
    <Card className="mb-10 bg-surface">
      <CardBody className="p-5">
        <h2 className="text-sm font-semibold uppercase text-fg-muted">Reading path</h2>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={`${index}-${step}`} className="flex gap-3 text-sm leading-6 text-fg">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-raised font-mono text-[11px] text-accent">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
