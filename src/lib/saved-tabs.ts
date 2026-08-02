import type { Settings } from './settings';
import { GROUP_COLORS, type GroupColor } from './rules';

export type SavedTab = {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
};

export type SavedTabGroup = {
  id: string;
  name: string;
  createdAt: number;
  tabs: SavedTab[];
  color?: GroupColor;
  groups?: SavedTabGroup[];
  kind?: 'day';
};

export const DEFAULT_SAVED_TAB_GROUP_ID = 'default-saved-group';
export const DEFAULT_SAVED_TAB_GROUP_NAME = '默认收纳组';

function nextId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function dayKeyForTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayDayKey(): string {
  return dayKeyForTimestamp(Date.now());
}

export function createDaySavedTabGroup(name: string, tabs: SavedTab[]): SavedTabGroup {
  return { id: nextId('day'), name, createdAt: Date.now(), tabs, kind: 'day' };
}

export function isRestorableTab(tab: Pick<chrome.tabs.Tab, 'url' | 'pinned' | 'incognito'>) {
  return !tab.pinned && !tab.incognito && (tab.url?.startsWith('http://') || tab.url?.startsWith('https://')) === true;
}

export function toSavedTab(tab: Pick<chrome.tabs.Tab, 'url' | 'title' | 'favIconUrl' | 'pinned' | 'incognito'>): SavedTab | undefined {
  if (!isRestorableTab(tab) || !tab.url) return undefined;

  return {
    id: nextId('tab'),
    url: tab.url,
    title: tab.title ?? tab.url,
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
  };
}

export function createSavedTabGroup(name: string, color: GroupColor, tabs: SavedTab[]): SavedTabGroup {
  return { id: nextId('group'), name, color, createdAt: Date.now(), tabs };
}

export function normalizeSavedTabGroups(groups?: SavedTabGroup[]): SavedTabGroup[] {
  const normalizedGroups = (groups ?? []).map(normalizeSavedTabGroup);
  const firstGroup = normalizedGroups[0];
  if (!firstGroup) return [{ id: DEFAULT_SAVED_TAB_GROUP_ID, name: DEFAULT_SAVED_TAB_GROUP_NAME, createdAt: 0, tabs: [] }];

  const primary = normalizedGroups.length > 1
    ? { ...firstGroup, tabs: normalizedGroups.flatMap((group) => group.tabs), groups: normalizedGroups.flatMap((group) => group.groups ?? []) }
    : firstGroup;

  if (primary.tabs.length > 0 || (primary.groups ?? []).some((group) => group.kind !== 'day')) {
    return [migrateLegacySavedTabs(primary)];
  }

  const dayGroups = [...(primary.groups ?? [])].sort((a, b) => b.name.localeCompare(a.name));
  return [{ ...primary, ...(dayGroups.length ? { groups: dayGroups } : {}) }];
}

function migrateLegacySavedTabs(group: SavedTabGroup): SavedTabGroup {
  const dayKey = todayDayKey();
  const existingDayGroups = (group.groups ?? []).filter((item) => item.kind === 'day');
  const legacyGroups = (group.groups ?? []).filter((item) => item.kind !== 'day');
  const existingToday = existingDayGroups.find((item) => item.name === dayKey);
  const today: SavedTabGroup = {
    id: existingToday?.id ?? nextId('day'),
    name: dayKey,
    createdAt: existingToday?.createdAt ?? Date.now(),
    tabs: [...(existingToday?.tabs ?? []), ...group.tabs],
    ...((existingToday?.groups?.length || legacyGroups.length) ? { groups: [...(existingToday?.groups ?? []), ...legacyGroups] } : {}),
    kind: 'day',
  };
  const dayGroups = [...existingDayGroups.filter((item) => item.id !== today.id), today];
  return {
    ...group,
    tabs: [],
    ...(dayGroups.length ? { groups: dayGroups } : {}),
  };
}

function normalizeSavedTabGroup(group: SavedTabGroup): SavedTabGroup {
  const groups = group.groups?.map(normalizeSavedTabGroup);
  return {
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    tabs: group.tabs,
    ...(group.color ? { color: group.color } : {}),
    ...(groups?.length ? { groups } : {}),
    ...(group.kind === 'day' ? { kind: 'day' as const } : {}),
  };
}

export function flattenSavedTabs(group: SavedTabGroup): SavedTab[] {
  return [...group.tabs, ...(group.groups ?? []).flatMap(flattenSavedTabs)];
}

export function parseSavedTabLines(text: string): { days: Record<string, SavedTab[]>; skipped: number } {
  const days: Record<string, SavedTab[]> = {};
  let skipped = 0;

  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const parts = line.split(' | ');
    const dated = DAY_KEY_PATTERN.test(parts[0]);
    const dayKey = dated ? parts[0] : todayDayKey();
    const rawUrl = dated ? parts[1] ?? '' : parts[0];
    const title = dated ? parts.slice(2).join(' | ') : parts.slice(1).join(' | ');
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
      const tabs = days[dayKey] ?? [];
      tabs.push({ id: nextId('tab'), url: rawUrl, title: title || rawUrl });
      days[dayKey] = tabs;
    } catch {
      skipped += 1;
    }
  }

  return { days, skipped };
}

export function serializeSavedTabLines(groups?: SavedTabGroup[]): string {
  const rows: Array<{ dayKey: string; url: string; title: string }> = [];
  for (const group of groups ?? []) {
    if (group.kind === 'day') {
      for (const tab of flattenSavedTabs(group)) {
        rows.push({ dayKey: group.name, url: tab.url, title: tab.title || tab.url });
      }
      continue;
    }
    for (const tab of group.tabs) {
      rows.push({ dayKey: todayDayKey(), url: tab.url, title: tab.title || tab.url });
    }
    for (const nested of group.groups ?? []) {
      const dayKey = nested.kind === 'day' ? nested.name : todayDayKey();
      for (const tab of flattenSavedTabs(nested)) {
        rows.push({ dayKey, url: tab.url, title: tab.title || tab.url });
      }
    }
  }
  rows.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  return rows.map((row) => `${row.dayKey} | ${row.url} | ${row.title}`).join('\n');
}

export function mergeParsedDayTabs(group: SavedTabGroup, days: Record<string, SavedTab[]>): SavedTabGroup {
  const dayGroups = [...(group.groups ?? [])];
  for (const [dayKey, tabs] of Object.entries(days)) {
    const existing = dayGroups.find((item) => item.kind === 'day' && item.name === dayKey);
    if (existing) {
      dayGroups[dayGroups.indexOf(existing)] = { ...existing, tabs: [...existing.tabs, ...tabs] };
    } else {
      dayGroups.push({ id: nextId('day'), name: dayKey, createdAt: Date.now(), tabs, kind: 'day' });
    }
  }
  return { ...group, ...(dayGroups.length ? { groups: dayGroups } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSavedTabGroups(value: unknown): value is SavedTabGroup[] {
  if (!Array.isArray(value)) return false;

  const groupIds = new Set<string>();
  const tabIds = new Set<string>();
  function isSavedTabGroup(value: unknown): value is SavedTabGroup {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id || groupIds.has(value.id) || typeof value.name !== 'string' || !value.name.trim() || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || (value.color !== undefined && !GROUP_COLORS.includes(value.color as GroupColor)) || (value.kind !== undefined && value.kind !== 'day') || !Array.isArray(value.tabs) || (value.groups !== undefined && !Array.isArray(value.groups))) return false;
    groupIds.add(value.id);

    if (!value.tabs.every((tabValue) => {
      if (!isRecord(tabValue) || typeof tabValue.id !== 'string' || !tabValue.id || tabIds.has(tabValue.id) || typeof tabValue.url !== 'string' || !/^https?:\/\//.test(tabValue.url) || typeof tabValue.title !== 'string' || (tabValue.favIconUrl !== undefined && typeof tabValue.favIconUrl !== 'string')) return false;
      tabIds.add(tabValue.id);
      return true;
    })) return false;

    return (value.groups ?? []).every(isSavedTabGroup);
  }

  return value.every(isSavedTabGroup);
}

export function findSavedTabGroup(groups: SavedTabGroup[] | undefined, groupId: string): SavedTabGroup | undefined {
  for (const group of groups ?? []) {
    if (group.id === groupId) return group;
    const nestedGroup = findSavedTabGroup(group.groups, groupId);
    if (nestedGroup) return nestedGroup;
  }
  return undefined;
}

function withNestedGroups(group: SavedTabGroup, groups: SavedTabGroup[]) {
  if (groups.length) return { ...group, groups };
  const { groups: _groups, ...withoutGroups } = group;
  return withoutGroups;
}

function removeSavedTabFromGroup(group: SavedTabGroup, groupId: string, tabId: string): SavedTabGroup {
  const nextTabs = group.id === groupId ? group.tabs.filter((tab) => tab.id !== tabId) : group.tabs;
  const nextGroups = (group.groups ?? []).flatMap((nestedGroup) => {
    const nextGroup = removeSavedTabFromGroup(nestedGroup, groupId, tabId);
    if (!nextGroup.tabs.length && !nextGroup.groups?.length && (nestedGroup.id === groupId || nextGroup.kind === 'day')) return [];
    return [nextGroup];
  });
  return withNestedGroups({ ...group, tabs: nextTabs }, nextGroups);
}

export function removeSavedTab(settings: Settings, groupId: string, tabId: string): Settings {
  const savedTabGroups = (settings.savedTabGroups ?? [])
    .map((group) => removeSavedTabFromGroup(group, groupId, tabId));
  return { ...settings, savedTabGroups };
}

function removeSavedGroupFromGroup(group: SavedTabGroup, groupId: string): SavedTabGroup {
  const nextGroups = (group.groups ?? [])
    .filter((nestedGroup) => nestedGroup.id !== groupId)
    .map((nestedGroup) => removeSavedGroupFromGroup(nestedGroup, groupId))
    .filter((nestedGroup) => nestedGroup.kind !== 'day' || nestedGroup.tabs.length > 0 || (nestedGroup.groups ?? []).length > 0);
  return withNestedGroups(group, nextGroups);
}

export function removeSavedGroup(settings: Settings, groupId: string): Settings {
  return {
    ...settings,
    savedTabGroups: (settings.savedTabGroups ?? []).map((group) => removeSavedGroupFromGroup(group, groupId)),
  };
}
