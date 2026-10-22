import { useEffect, useRef, useState } from 'react';
import { loadMermaid } from './mermaid';

interface MermaidDiagramProps {
  source: string;
  cachedSvg?: string;
  onRendered?: (source: string, svg: string) => void;
}

/** Renders Mermaid source to SVG, reusing a cached render when there is one */
export function MermaidDiagram({ source, cachedSvg, onRendered }: MermaidDiagramProps) {
  const idBase = useRef(`architecture-mermaid-${Math.random().toString(36).slice(2)}`);
  const renderCount = useRef(0);
  const [svg, setSvg] = useState(cachedSvg ?? '');
  const [error, setError] = useState<string | null>(null);
  const cachedSvgRef = useRef(cachedSvg);

  useEffect(() => {
    cachedSvgRef.current = cachedSvg;
  }, [source, cachedSvg]);

  useEffect(() => {
    let cancelled = false;
    const renderId = `${idBase.current}-${renderCount.current++}`;

    async function render() {
      if (!source.trim()) {
        setSvg('');
        setError('Diagram source is empty.');
        return;
      }

      const cached = cachedSvgRef.current;
      if (cached) {
        setError(null);
        setSvg(cached);
        return;
      }

      try {
        setError(null);
        setSvg('');
        const mermaid = await loadMermaid();
        if (cancelled) return;
        const rendered = await mermaid.render(renderId, source);
        if (!cancelled) {
          const svg = withoutImages(rendered.svg);
          setSvg(svg);
          onRendered?.(source, svg);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to render diagram.');
      }
    }

    render();
    return () => {
      cancelled = true;
      document.getElementById(renderId)?.remove();
    };
  }, [source, onRendered]);

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger-fg">
          Mermaid could not render this diagram.
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-canvas p-3 font-mono text-xs text-fg">{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="architecture-diagram overflow-auto bg-canvas p-5">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="flex min-h-48 items-center justify-center text-sm text-fg-muted">Rendering diagram…</div>
      )}
    </div>
  );
}

/** Mermaid's image shapes load a URL from the diagram source, which the model writes */
function withoutImages(svg: string): string {
  return svg.replace(/<image\b[^>]*?(\/>|>[\s\S]*?<\/image>)/gi, '');
}
