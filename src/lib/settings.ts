import { GROUP_COLORS, MATCH_FIELDS, MATCH_OPERATORS, type Group, type GroupColor, type MatchCondition, type Rule } from './rules';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseImportedSettings(value: unknown): Settings | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || typeof value.collapseGroups !== 'boolean' || typeof value.organizeAllWindows !== 'boolean' || !['light', 'dark', 'system'].includes(value.theme as Theme) || !Array.isArray(value.groups)) return undefined;

  const groupIds = new Set<string>();
  const ruleIds = new Set<string>();
  const conditionIds = new Set<string>();
  const groupNames = new Set<string>();
  for (const group of value.groups) {
    if (!isRecord(group) || typeof group.id !== 'string' || !group.id || groupIds.has(group.id) || typeof group.name !== 'string' || !group.name.trim() || groupNames.has(group.name) || !GROUP_COLORS.includes(group.color as GroupColor) || typeof group.enabled !== 'boolean' || !Array.isArray(group.rules) || !group.rules.length) return undefined;
    groupIds.add(group.id);
    groupNames.add(group.name);
    for (const rule of group.rules) {
      if (!isRecord(rule) || typeof rule.id !== 'string' || !rule.id || ruleIds.has(rule.id) || typeof rule.name !== 'string' || !Array.isArray(rule.conditions) || !rule.conditions.length) return undefined;
      ruleIds.add(rule.id);
      for (const condition of rule.conditions) {
        if (!isRecord(condition) || typeof condition.id !== 'string' || !condition.id || conditionIds.has(condition.id) || !MATCH_FIELDS.includes(condition.field as MatchCondition['field']) || !MATCH_OPERATORS.includes(condition.operator as MatchCondition['operator']) || typeof condition.value !== 'string' || !condition.value.trim()) return undefined;
        if (condition.operator === 'regex') try { new RegExp(condition.value); } catch { return undefined; }
        conditionIds.add(condition.id);
      }
    }
  }
  return value as Settings;
}
