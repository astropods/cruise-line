import { describe, it, expect, mock } from 'bun:test';
import path from 'path';

// db/client evaluates postgres(config.db.url) at import; stub so it loads.
mock.module(path.resolve(import.meta.dir, './config.ts'), () => ({
  config: {
    db: { url: 'postgres://mock@localhost:5432/mock' },
  },
}));

const { applyDefaults, checkModelSetting } = await import('./db/model-settings.js');

const defaults = { model: 'claude-opus-5-5', effort: 'high' as const };

const models = [
  { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', effortLevels: ['low', 'medium', 'high', 'max'] },
  { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', effortLevels: [] },
  { id: 'claude-mystery', displayName: 'Mystery', effortLevels: null },
];

describe('applyDefaults', () => {
  it('uses the deploy defaults when nothing is set', () => {
    expect(applyDefaults({ model: null, effort: null }, defaults)).toEqual({
      model: 'claude-opus-5-5',
      effort: 'high',
    });
  });

  it('prefers the saved model and effort', () => {
    expect(applyDefaults({ model: 'claude-sonnet-4-6', effort: 'low' }, defaults)).toEqual({
      model: 'claude-sonnet-4-6',
      effort: 'low',
    });
  });

  it("sends no effort for 'auto'", () => {
    expect(applyDefaults({ model: null, effort: 'auto' }, defaults)).toEqual({
      model: 'claude-opus-5-5',
      effort: undefined,
    });
  });
});

describe('checkModelSetting', () => {
  it('accepts a supported model and level', () => {
    expect(checkModelSetting({ model: 'claude-opus-5-5', effort: 'xhigh' }, models, defaults)).toBeNull();
  });

  it('rejects a model the API key cannot use', () => {
    expect(checkModelSetting({ model: 'claude-nope', effort: null }, models, defaults)).toBe(
      'claude-nope is not available to this API key',
    );
  });

  it('rejects a level the model does not support', () => {
    expect(checkModelSetting({ model: 'claude-sonnet-4-6', effort: 'xhigh' }, models, defaults)).toBe(
      "Claude Sonnet 4.6 doesn't support xhigh effort",
    );
  });

  it('rejects the default effort on a model without effort support', () => {
    expect(checkModelSetting({ model: 'claude-haiku-4-5', effort: null }, models, defaults)).toBe(
      "Claude Haiku 4.5 doesn't support an effort setting",
    );
    expect(checkModelSetting({ model: 'claude-haiku-4-5', effort: 'auto' }, models, defaults)).toBeNull();
  });

  it('allows any level when the API did not report effort support', () => {
    expect(checkModelSetting({ model: 'claude-mystery', effort: 'max' }, models, defaults)).toBeNull();
  });

  it('does not block resetting to a deploy default missing from the list', () => {
    expect(checkModelSetting({ model: null, effort: null }, [], defaults)).toBeNull();
  });
});
