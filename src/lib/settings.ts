import type { Rule } from './rules';

export type Settings = {
  enabled: boolean;
  rules: Rule[];
};

const settingsKey = 'settings';
const defaultSettings: Settings = { enabled: true, rules: [] };

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(settingsKey);
  return { ...defaultSettings, ...(stored[settingsKey] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ [settingsKey]: settings });
}
