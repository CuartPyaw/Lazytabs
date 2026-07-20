import type { Group, GroupColor, Rule } from './rules';

export type Settings = {
  enabled: boolean;
  groups: Group[];
  theme: Theme;
};

export type Theme = 'light' | 'dark' | 'system';

type LegacyRule = Rule & {
  groupName: string;
  color: GroupColor;
  enabled: boolean;
};

const settingsKey = 'settings';
const defaultSettings: Settings = { enabled: true, groups: [], theme: 'system' };

function migrateRules(rules: LegacyRule[]) {
  return rules.reduce<Group[]>((groups, rule) => {
    const group = groups.find((item) => item.name === rule.groupName && item.color === rule.color && item.enabled === rule.enabled);
    if (group) {
      group.rules.push({ id: rule.id, pattern: rule.pattern });
    } else {
      groups.push({ id: rule.id, name: rule.groupName, color: rule.color, enabled: rule.enabled, rules: [{ id: rule.id, pattern: rule.pattern }] });
    }
    return groups;
  }, []);
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(settingsKey);
  const value = stored[settingsKey] as Partial<Settings> & { rules?: LegacyRule[] } | undefined;
  const { rules, groups, ...settings } = value ?? {};
  return { ...defaultSettings, ...settings, groups: groups ?? migrateRules(rules ?? []) };
}

export async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ [settingsKey]: settings });
}
