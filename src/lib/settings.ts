import type { GroupColor, MatchCondition, Rule } from './rules';

export type Settings = {
  enabled: boolean;
  collapseGroups: boolean;
  organizeAllWindows: boolean;
  rules: Rule[];
  theme: Theme;
};

export type Theme = 'light' | 'dark' | 'system';

type LegacyPattern = {
  id: string;
  pattern: string;
};

type LegacyRule = LegacyPattern & {
  groupName: string;
  color: GroupColor;
  enabled: boolean;
};

type LegacyGroup = {
  id: string;
  name: string;
  color: GroupColor;
  enabled: boolean;
  rules: LegacyPattern[];
};

const settingsKey = 'settings';
const defaultSettings: Settings = { enabled: true, collapseGroups: true, organizeAllWindows: false, rules: [], theme: 'system' };

function conditionForPattern(pattern: string, id: string): MatchCondition {
  const value = pattern.trim().toLowerCase().replace(/\.$/, '');
  if (!value.startsWith('*.')) return { id, field: 'hostname', operator: 'equals', value };

  const domain = value.slice(2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { id, field: 'hostname', operator: 'regex', value: `^[^.]+\\.${domain}$` };
}

function migrateLegacyRules(rules: LegacyRule[]) {
  return rules.map((rule) => ({
    id: rule.id,
    name: rule.pattern,
    groupName: rule.groupName,
    color: rule.color,
    enabled: rule.enabled,
    conditions: [conditionForPattern(rule.pattern, rule.id)],
  }));
}

function migrateGroups(groups: LegacyGroup[]) {
  return groups.flatMap((group) => migrateLegacyRules(group.rules.map((rule) => ({ ...rule, groupName: group.name, color: group.color, enabled: group.enabled }))));
}

function isCurrentRule(value: unknown): value is Rule {
  return typeof value === 'object' && value !== null && 'conditions' in value;
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(settingsKey);
  const value = stored[settingsKey] as Partial<Settings> & { groups?: LegacyGroup[]; rules?: LegacyRule[] | Rule[] } | undefined;
  const { rules, groups, ...settings } = value ?? {};
  const currentRules = Array.isArray(rules) && rules.every(isCurrentRule) ? rules : undefined;

  return {
    ...defaultSettings,
    ...settings,
    rules: currentRules ?? (Array.isArray(groups) ? migrateGroups(groups) : migrateLegacyRules(Array.isArray(rules) ? rules as LegacyRule[] : [])),
  };
}

export async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ [settingsKey]: settings });
}
