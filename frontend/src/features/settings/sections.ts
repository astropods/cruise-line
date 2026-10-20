export type SettingsSectionId = 'basic' | 'models' | 'users';

export const SETTINGS_SECTIONS: readonly { id: SettingsSectionId; label: string }[] = [
  { id: 'basic', label: 'Basic setup' },
  { id: 'models', label: 'Models' },
  { id: 'users', label: 'Users' },
];

export function parseSettingsSection(value: string | undefined): SettingsSectionId | null {
  return SETTINGS_SECTIONS.some((s) => s.id === value) ? (value as SettingsSectionId) : null;
}
