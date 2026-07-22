import type { Group, GroupColor, MatchCondition, Rule } from './rules';

export type Settings = {
  enabled: boolean;
  collapseGroups: boolean;
  organizeAllWindows: boolean;
  groups: Group[];
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

type CurrentRule = Rule & {
  groupName: string;
  color: GroupColor | 'auto';
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
const defaultSettings: Settings = { enabled: true, collapseGroups: true, organizeAllWindows: false, groups: [], theme: 'system' };

function conditionForPattern(pattern: string, id: string): MatchCondition {
  const value = pattern.trim().toLowerCase().replace(/\.$/, '');
  if (!value.startsWith('*.')) return { id, field: 'hostname', operator: 'equals', value };

  const domain = value.slice(2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { id, field: 'hostname', operator: 'regex', value: `^[^.]+\\.${domain}$` };
}

function migrateLegacyGroups(groups: LegacyGroup[]): Group[] {
  return groups.map((group) => ({
    ...group,
    rules: group.rules.map((rule) => ({ id: rule.id, name: rule.pattern, conditions: [conditionForPattern(rule.pattern, rule.id)] })),
  }));
}

function migrateLegacyRules(rules: LegacyRule[]): Group[] {
  return migrateCurrentRules(rules.map((rule) => ({
    id: rule.id,
    name: rule.pattern,
    groupName: rule.groupName,
    color: rule.color,
    enabled: rule.enabled,
    conditions: [conditionForPattern(rule.pattern, rule.id)],
  })));
}

function migrateCurrentRules(rules: CurrentRule[]): Group[] {
  return rules.reduce<Group[]>((groups, rule) => {
    const group = groups.find((item) => item.name === rule.groupName);
    const nextRule = { id: rule.id, name: rule.name, conditions: rule.conditions };
    if (group) {
      group.rules.push(nextRule);
      group.enabled ||= rule.enabled;
      return groups;
    }
    groups.push({ id: rule.id, name: rule.groupName, color: rule.color, enabled: rule.enabled, rules: [nextRule] });
    return groups;
  }, []);
}

function isCurrentGroup(value: unknown): value is Group {
  return typeof value === 'object' && value !== null && 'rules' in value && Array.isArray(value.rules) && value.rules.every((rule) => typeof rule === 'object' && rule !== null && 'conditions' in rule && !('groupName' in rule));
}

function isCurrentRule(value: unknown): value is CurrentRule {
  return typeof value === 'object' && value !== null && 'conditions' in value && 'groupName' in value;
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(settingsKey);
  const value = stored[settingsKey] as Partial<Settings> & { groups?: LegacyGroup[] | Group[]; rules?: LegacyRule[] | CurrentRule[] } | undefined;
  const { groups, rules, ...settings } = value ?? {};
  const currentGroups = Array.isArray(groups) && groups.every(isCurrentGroup) ? groups : undefined;

  return {
    ...defaultSettings,
    ...settings,
    groups: currentGroups ?? (Array.isArray(groups) ? migrateLegacyGroups(groups as LegacyGroup[]) : Array.isArray(rules) ? rules.every(isCurrentRule) ? migrateCurrentRules(rules) : migrateLegacyRules(rules as LegacyRule[]) : []),
  };
}

export async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ [settingsKey]: settings });
}
