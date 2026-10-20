import { Check, Copy } from '@phosphor-icons/react';
import type { ArchitectureDiagram } from '../../api';
import { useCopy } from '../../lib/useCopy';
import { Button, Card, CardHeader, Pill } from '../../ui';
import { MermaidDiagram } from './MermaidDiagram';
import { normalizeMermaidSource } from './mermaidSource';

interface DiagramCardProps {
  diagram: ArchitectureDiagram;
  diagramSvgCache: Record<string, string>;
  onDiagramRendered?: (source: string, svg: string) => void;
}

export function DiagramCard({ diagram, diagramSvgCache, onDiagramRendered }: DiagramCardProps) {
  const { copy, copied } = useCopy();
  const source = normalizeMermaidSource(diagram.mermaid);

  return (
    <Card className="overflow-hidden bg-surface">
      <CardHeader className="items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-base font-semibold text-fg-strong">{diagram.title}</h2>
            <Pill shape="tag" className="uppercase">{diagram.kind === 'sequence' ? 'Sequence' : 'Flowchart'}</Pill>
          </div>
          <p className="text-sm leading-6 text-fg-muted">{diagram.description}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          title="Copy raw Mermaid source"
          onClick={() => copy(source)}
          icon={copied ? <Check size={13} weight="bold" className="text-success" /> : <Copy size={13} />}
        >
          {copied ? <span className="text-success">Copied</span> : 'Copy Mermaid'}
        </Button>
      </CardHeader>
      <MermaidDiagram source={source} cachedSvg={diagramSvgCache[source]} onRendered={onDiagramRendered} />
    </Card>
  );
}
