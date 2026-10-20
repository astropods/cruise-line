import { useId } from 'react';
import type { FileContent, Finding, FindingCategory, Severity } from '../../../api';
import { SEVERITY_ORDER } from '../../../domain/severity';
import { FINDING_CATEGORIES, FindingCard } from '../FindingCard';

interface InlineFindingProps {
  title: string;
  severity: string;
  category: string;
  body: string;
  fixPrompt?: string;
  files: Record<string, FileContent>;
}

/** A ::finding{} directive, as chat answers write them: the same card the Analysis view shows */
export function InlineFinding({ title, severity, category, body, fixPrompt, files }: InlineFindingProps) {
  const id = useId();
  // Directive attributes are free text from the model
  const finding: Finding = {
    title,
    severity: (SEVERITY_ORDER as readonly string[]).includes(severity) ? (severity as Severity) : 'info',
    category: category in FINDING_CATEGORIES ? (category as FindingCategory) : 'correctness',
    body,
    fixPrompt,
    files: [],
  };
  return (
    <div className="my-4">
      <FindingCard finding={finding} files={files} id={id} />
    </div>
  );
}
