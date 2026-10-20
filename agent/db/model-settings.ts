import { sql } from './client.js';
import { config } from '../config.js';
import { sandboxListModels } from '../sandbox-client.js';

export type ModelUse = 'review' | 'chat';

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * What an owner picked in Settings. null means "use the default": the
 * deploy's CLAUDE_MODEL, or config.claude.effort. 'auto' sends no effort at
 * all, leaving it to the model (and is the only option for models without
 * effort support).
 */
export interface ModelSetting {
  model: string | null;
  effort: EffortLevel | 'auto' | null;
}

export type ModelSettings = Record<ModelUse, ModelSetting>;

const USES: ModelUse[] = ['review', 'chat'];
const key = (use: ModelUse, field: 'model' | 'effort') => `claude.${use}.${field}`;

export async function getModelSettings(): Promise<ModelSettings> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM app_config WHERE key LIKE 'claude.%'
  `;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const settings = {} as ModelSettings;
  for (const use of USES) {
    const effort = map.get(key(use, 'effort'));
    settings[use] = {
      model: map.get(key(use, 'model')) ?? null,
      effort: effort === 'auto' || (EFFORT_LEVELS as readonly string[]).includes(effort ?? '')
        ? (effort as EffortLevel | 'auto')
        : null,
    };
  }
  return settings;
}

export async function saveModelSetting(use: ModelUse, setting: ModelSetting): Promise<void> {
  await sql.begin(async (tx) => {
    for (const field of ['model', 'effort'] as const) {
      const value = setting[field];
      if (value === null) {
        await tx`DELETE FROM app_config WHERE key = ${key(use, field)}`;
      } else {
        await tx`
          INSERT INTO app_config (key, value)
          VALUES (${key(use, field)}, ${value})
          ON CONFLICT (key)
          DO UPDATE SET value = ${value}, updated_at = NOW()
        `;
      }
    }
  });
}

interface Defaults {
  model: string;
  effort: EffortLevel;
}

const deployDefaults = (): Defaults => ({
  model: config.claude.model,
  effort: config.claude.effort as EffortLevel,
});

/** Fill a setting's nulls from the defaults; 'auto' becomes no effort at all */
export function applyDefaults(
  setting: ModelSetting,
  defaults: Defaults = deployDefaults(),
): { model: string; effort?: EffortLevel } {
  const effort = setting.effort ?? defaults.effort;
  return {
    model: setting.model ?? defaults.model,
    effort: effort === 'auto' ? undefined : effort,
  };
}

export interface ModelInfo {
  id: string;
  displayName: string;
  /** [] when the model takes no effort setting, null when unknown */
  effortLevels: string[] | null;
}

/**
 * Why a setting can't be saved against the available models, or null if it
 * can. Defaults count: picking "default effort" for a model that can't take
 * the default level is rejected too.
 */
export function checkModelSetting(
  setting: ModelSetting,
  models: ModelInfo[],
  defaults: Defaults = deployDefaults(),
): string | null {
  const { model, effort } = applyDefaults(setting, defaults);
  const info = models.find((m) => m.id === model);
  if (!info) {
    return setting.model ? `${setting.model} is not available to this API key` : null;
  }
  if (!effort || !info.effortLevels || info.effortLevels.includes(effort)) return null;
  return info.effortLevels.length === 0
    ? `${info.displayName} doesn't support an effort setting`
    : `${info.displayName} doesn't support ${effort} effort`;
}

/**
 * The model and effort to send to the sandbox for a query. Drops an effort
 * level the model doesn't take (say, a deploy default of Haiku 4.5 with the
 * default 'high') rather than letting the query fail.
 */
export async function resolveModel(use: ModelUse): Promise<{ model: string; effort?: EffortLevel }> {
  const choice = applyDefaults((await getModelSettings())[use]);
  if (!choice.effort) return choice;
  try {
    const info = (await sandboxListModels()).find((m) => m.id === choice.model);
    if (info?.effortLevels && !info.effortLevels.includes(choice.effort)) {
      return { model: choice.model };
    }
  } catch {
    // Model list unavailable; send the effort as configured
  }
  return choice;
}
