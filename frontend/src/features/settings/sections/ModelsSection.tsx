import { CaretDown } from '@phosphor-icons/react';
import type { AvailableModel, EffortLevel, ModelSetting, ModelSettingsResponse, ModelUse } from '../../../api';
import { cx } from '../../../lib/cx';
import { SegmentedControl } from '../../../ui';
import { useModelSettings, useUpdateModelSetting } from '../queries';
import { Notice, SectionHeader, SettingRow } from '../SettingsParts';

const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max',
};

const USES: { use: ModelUse; label: string; hint: string }[] = [
  { use: 'review', label: 'Reviews', hint: 'Writes the summary and findings for each pull request.' },
  { use: 'chat', label: 'Chat', hint: 'Answers questions about a pull request, with the code checked out.' },
];

export function ModelsSection() {
  const query = useModelSettings();
  const data = query.data;

  return (
    <>
      <SectionHeader title="Models">
        Pick the Claude model and effort level for reviews and for chat. Higher effort thinks longer: more thorough, but
        slower and more expensive.
      </SectionHeader>

      {query.isError && <Notice tone="danger">{query.error.message}</Notice>}
      {query.isPending && <p className="py-7 text-sm text-fg-muted">Loading…</p>}
      {data?.modelsError && (
        <Notice tone="danger">
          Couldn’t load the model list from the Anthropic API ({data.modelsError}). Only the current models are shown.
        </Notice>
      )}

      {data && USES.map(({ use, label, hint }, i) => (
        <ModelRow key={use} use={use} label={label} hint={hint} data={data} last={i === USES.length - 1} />
      ))}

      {data && (
        <p className="border-t border-line pt-5 text-[13px] leading-5 text-fg-muted">
          The default model is set when Cruise Line is deployed. The list shows every model your Anthropic API key can use.
        </p>
      )}
    </>
  );
}

function ModelRow({ use, label, hint, data, last }: {
  use: ModelUse;
  label: string;
  hint: string;
  data: ModelSettingsResponse;
  last: boolean;
}) {
  const update = useUpdateModelSetting();
  const setting = data.settings[use];
  const { defaults, models } = data;
  const info = (id: string) => models?.find((m) => m.id === id);
  const nameOf = (id: string) => info(id)?.displayName ?? id;

  const effectiveModel = setting.model ?? defaults.model;
  const levels = info(effectiveModel)?.effortLevels ?? null;
  const supports = (level: EffortLevel) => !levels || levels.includes(level);
  const effectiveEffort = setting.effort ?? defaults.effort;
  const customized = setting.model !== null || setting.effort !== null;

  // Without the API list, still offer the default and the saved pick
  const options: Pick<AvailableModel, 'id' | 'displayName'>[] = models
    ?? [...new Set([defaults.model, setting.model].filter((m): m is string => !!m))].map((id) => ({ id, displayName: id }));

  function save(next: ModelSetting) {
    update.mutate({ use, setting: next });
  }

  function changeModel(value: string) {
    const model = value || null;
    const nextLevels = info(model ?? defaults.model)?.effortLevels ?? null;
    let effort = setting.effort;
    // Keep the effort valid for the new model
    if (nextLevels) {
      const wanted = effort ?? defaults.effort;
      if (nextLevels.length === 0) effort = 'auto';
      else if (wanted !== 'auto' && !nextLevels.includes(wanted)) effort = nextLevels.includes(defaults.effort) ? null : 'auto';
    }
    save({ model, effort });
  }

  const effortHint = levels?.length === 0
    ? `${nameOf(effectiveModel)} doesn’t take an effort setting.`
    : effectiveEffort === 'auto'
      ? 'Using the model’s own default effort.'
      : `${EFFORT_LABELS[defaults.effort]} is the default.`;

  return (
    <SettingRow
      label={label}
      hint={hint}
      last={last}
      aside={customized && (
        <button type="button" onClick={() => save({ model: null, effort: null })} className="text-[13px] text-accent hover:underline">
          Reset to defaults
        </button>
      )}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${use}-model`} className="text-[13px] font-medium text-fg">Model</label>
        {/* A native select for keyboard and screen readers, drawn over the styled value */}
        <div className="relative flex h-9 items-center justify-between rounded-md border border-line bg-canvas px-3 focus-within:border-accent-emphasis">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-fg-strong">
              {setting.model ? nameOf(setting.model) : `Default · ${nameOf(defaults.model)}`}
            </span>
            <span className="truncate font-mono text-xs text-fg-muted">{effectiveModel}</span>
          </span>
          <CaretDown size={12} className="flex-shrink-0 text-fg-muted" aria-hidden="true" />
          <select
            id={`${use}-model`}
            value={setting.model ?? ''}
            onChange={(e) => changeModel(e.target.value)}
            disabled={update.isPending}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="">Default ({nameOf(defaults.model)})</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${use}-effort`} className="text-[13px] font-medium text-fg">Effort</span>
        <SegmentedControl<EffortLevel>
          label={`${label} effort`}
          value={effectiveEffort === 'auto' ? ('' as EffortLevel) : effectiveEffort}
          onChange={(level) => save({ ...setting, effort: level })}
          className={cx('flex w-full [&>button]:flex-1 [&>button]:justify-center', levels?.length === 0 && 'opacity-50')}
          segments={EFFORT_LEVELS.map((level) => ({
            value: level,
            label: EFFORT_LABELS[level],
            disabled: update.isPending || !supports(level),
          }))}
        />
        <p className="text-[13px] leading-5 text-fg-muted">{effortHint}</p>
        {update.isError && <p className="text-[13px] text-danger-fg">{update.error.message}</p>}
      </div>
    </SettingRow>
  );
}
