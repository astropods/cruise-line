import { useState, type ReactNode } from 'react';
import { ArrowSquareOut, ArrowsClockwise, ChatCircle, DotsThree, FileText, TreeStructure } from '@phosphor-icons/react';
import { reviewStatusView, type PrStatusInput } from '../domain/prStatus';
import { SEVERITY_ORDER, severityLabel, severityTone } from '../domain/severity';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  IconButton,
  Pill,
  SegmentedControl,
  StatusIcon,
  type Tone,
} from '../ui';

const TONES: Tone[] = ['neutral', 'accent', 'success', 'warning', 'severe', 'danger', 'done'];

const STATUS_CASES: Array<[string, PrStatusInput]> = [
  ['Running', { status: 'running', prState: 'open', verdict: null }],
  ['Failed', { status: 'failed', prState: 'open', verdict: null }],
  ['Never reviewed', { status: 'none', prState: 'open', verdict: null }],
  ['Approved', { status: 'complete', prState: 'open', verdict: 'approve' }],
  ['Changes requested', { status: 'complete', prState: 'open', verdict: 'request_changes' }],
  ['Needs discussion', { status: 'complete', prState: 'open', verdict: 'needs_discussion' }],
  ['Merged', { status: 'complete', prState: 'merged', verdict: 'approve' }],
  ['Closed', { status: 'complete', prState: 'closed', verdict: null }],
];

type View = 'analysis' | 'architecture' | 'chat';

/** Dev-only sheet of every ui/ building block. Served at /__ui. */
export function UiGallery() {
  const [view, setView] = useState<View>('analysis');

  return (
    <div className="min-h-screen bg-canvas px-10 py-10 text-fg">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-fg-strong">UI building blocks</h1>
      <p className="mb-10 text-sm text-fg-muted">Everything in src/ui, in every state. Dev builds only.</p>

      <Section title="Tones · Pill">
        {TONES.map((t) => <Pill key={t} tone={t}>{t}</Pill>)}
      </Section>
      <Section title="Tones · Tag">
        {TONES.map((t) => <Pill key={t} tone={t} shape="tag">{t}</Pill>)}
      </Section>
      <Section title="Severity tags">
        {SEVERITY_ORDER.map((s) => <Pill key={s} tone={severityTone(s)} shape="tag">{severityLabel(s)}</Pill>)}
      </Section>

      <Section title="Status icons (domain/prStatus)">
        {STATUS_CASES.map(([name, input]) => {
          const v = reviewStatusView(input);
          return (
            <span key={name} className="inline-flex items-center gap-2 text-sm">
              <StatusIcon icon={v.icon} tone={v.tone} />
              <span className="text-fg-muted">{name}:</span> {v.label}
            </span>
          );
        })}
      </Section>

      <Section title="Buttons">
        <Button variant="primary">Post as comment</Button>
        <Button>Copy fix prompt</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Disconnect GitHub App</Button>
        <Button size="sm" icon={<ArrowsClockwise size={12} />}>Rerun</Button>
        <Button disabled>Disabled</Button>
      </Section>

      <Section title="Icon buttons">
        <IconButton label="More actions" icon={<DotsThree size={16} weight="bold" />} />
        <IconButton label="Open on GitHub" icon={<ArrowSquareOut size={15} />} />
        <IconButton label="Rerun review" icon={<ArrowsClockwise size={15} />} />
        <IconButton label="More actions" variant="ghost" size="sm" icon={<DotsThree size={14} weight="bold" />} />
      </Section>

      <Section title="Avatars">
        <Avatar login="cpatty" src="https://github.com/ghost.png" size={44} />
        <Avatar login="cpatty" size={44} />
        <Avatar login="anwar-s" size={32} />
        <Avatar login="tlindqvist" size={24} />
        <Avatar login="jkowalski" size={16} />
        <Avatar login="broken" src="https://invalid.example/x.png" size={32} />
      </Section>

      <Section title="Segmented control">
        <SegmentedControl<View>
          label="Review view"
          value={view}
          onChange={setView}
          segments={[
            { value: 'analysis', label: 'Analysis', icon: <FileText size={14} /> },
            { value: 'architecture', label: 'Architecture', icon: <TreeStructure size={14} /> },
            { value: 'chat', label: 'Chat', icon: <ChatCircle size={14} /> },
          ]}
        />
      </Section>

      <Section title="Card">
        <Card className="w-[640px]">
          <CardHeader>
            <Pill tone="severe" shape="tag">High</Pill>
            <span className="flex-grow text-[15px] font-semibold text-fg-strong">Saved effort can outlive its model</span>
            <span className="font-mono text-xs text-fg-muted">model-settings.ts:74</span>
          </CardHeader>
          <CardBody>
            <p className="text-[15px] leading-6">Body content, code, and suggestions go here.</p>
          </CardBody>
          <CardFooter>
            <span className="text-xs text-fg-muted">Correctness</span>
            <div className="flex gap-2">
              <Button>Save as rule</Button>
              <Button>Copy fix prompt</Button>
              <Button variant="primary">Post as comment</Button>
            </div>
          </CardFooter>
        </Card>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}
