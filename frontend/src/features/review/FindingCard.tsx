import { useState } from 'react';
import {
  BookmarkSimple, Bug, CaretDown, ChatText, Check, Copy, Lightning, PaintBrush, ShieldCheck, Wrench,
  type Icon,
} from '@phosphor-icons/react';
import type { FileContent, Finding, FindingCategory } from '../../api';
import { RichContent, type RuleRef } from '../../components/RichContent';
import { isBlocking, severityLabel, severityTone } from '../../domain/severity';
import { cx } from '../../lib/cx';
import { Button, Card, CardBody, CardFooter, CardHeader, IconButton, Pill } from '../../ui';
import { useFindingActions } from './useFindingActions';

const CATEGORIES: Record<FindingCategory, { label: string; icon: Icon }> = {
  correctness: { label: 'Correctness', icon: Bug },
  security: { label: 'Security', icon: ShieldCheck },
  maintainability: { label: 'Maintainability', icon: Wrench },
  performance: { label: 'Performance', icon: Lightning },
  style: { label: 'Style', icon: PaintBrush },
};

interface FindingCardProps {
  finding: Finding;
  files: Record<string, FileContent>;
  /** Anchor id, so a finding can be linked to */
  id: string;
  onSaveAsRule: (ruleText: string) => void;
  onRuleClick: (ruleNumber: number) => void;
  rules: RuleRef[];
}

export function FindingCard({ finding, files, id, onSaveAsRule, onRuleClick, rules }: FindingCardProps) {
  const [expanded, setExpanded] = useState(true);
  const actions = useFindingActions(finding, files);
  const category = CATEGORIES[finding.category] ?? CATEGORIES.correctness;
  const CategoryIcon = category.icon;
  const bodyId = `${id}-body`;
  const otherFiles = new Set(finding.files.filter((f) => f !== actions.location?.file)).size;
  // Info findings stay advisory: no fix prompt or anchor, and not worth a rule
  const canSaveRule = finding.severity !== 'info';
  const hasActions = canSaveRule || !!finding.fixPrompt || actions.canComment;

  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader className={cx(!expanded && 'border-b-0')}>
        <Pill tone={severityTone(finding.severity)} shape="tag">{severityLabel(finding.severity)}</Pill>
        <h2 className="min-w-0 flex-grow text-[15px] leading-[22px] font-semibold text-fg-strong">{finding.title}</h2>
        {actions.location && (
          <button
            type="button"
            onClick={actions.openLocation}
            title={`Open ${actions.location.file}`}
            className="max-w-56 flex-shrink-0 truncate font-mono text-xs text-fg-muted transition-colors hover:text-accent"
          >
            {actions.location.file.split('/').pop()}
            {actions.location.line ? `:${actions.location.line}` : ''}
            {otherFiles > 0 && <span className="font-sans"> +{otherFiles}</span>}
          </button>
        )}
        <IconButton
          label={expanded ? 'Collapse finding' : 'Expand finding'}
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((e) => !e)}
          icon={<CaretDown size={14} className={cx('transition-transform', expanded && 'rotate-180')} />}
        />
      </CardHeader>

      {expanded && (
        <div id={bodyId}>
          <CardBody>
            <RichContent content={finding.body} files={files} onRuleClick={onRuleClick} rules={rules} />
          </CardBody>
          <CardFooter>
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <CategoryIcon size={13} aria-hidden="true" />
              {category.label}
            </span>
            {hasActions && (
              <div className="flex flex-wrap justify-end gap-2">
                {canSaveRule && (
                  <Button icon={<BookmarkSimple size={13} />} onClick={() => onSaveAsRule(finding.title)}>
                    Save as rule
                  </Button>
                )}
                {finding.fixPrompt && (
                  <Button
                    icon={actions.copied ? <Check size={13} weight="bold" className="text-success" /> : <Copy size={13} />}
                    onClick={actions.copyFixPrompt}
                    title="Copy a prompt you can paste into Claude Code to fix this"
                  >
                    {actions.copied ? 'Copied' : 'Copy fix prompt'}
                  </Button>
                )}
                {actions.canComment && (
                  <Button
                    variant={isBlocking(finding.severity) ? 'primary' : 'secondary'}
                    icon={<ChatText size={13} />}
                    onClick={actions.postAsComment}
                    title="Open a comment on the line, filled in with this finding"
                  >
                    Post as comment
                  </Button>
                )}
              </div>
            )}
          </CardFooter>
        </div>
      )}
    </Card>
  );
}
