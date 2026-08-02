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
};

export const DEFAULT_SAVED_TAB_GROUP_ID = 'default-saved-group';
export const DEFAULT_SAVED_TAB_GROUP_NAME = '默认收纳组';

function nextId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const nestedGroups = normalizedGroups.flatMap((group) => group.groups ?? []);
  return [{
    id: firstGroup?.id ?? DEFAULT_SAVED_TAB_GROUP_ID,
    name: firstGroup?.name ?? DEFAULT_SAVED_TAB_GROUP_NAME,
    createdAt: firstGroup?.createdAt ?? 0,
    tabs: normalizedGroups.flatMap((group) => group.tabs),
    ...(firstGroup?.color ? { color: firstGroup.color } : {}),
    ...(nestedGroups.length ? { groups: nestedGroups } : {}),
  }];
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
  };
}

export function flattenSavedTabs(group: SavedTabGroup): SavedTab[] {
  return [...group.tabs, ...(group.groups ?? []).flatMap(flattenSavedTabs)];
}

export function parseOneTabUrls(text: string): { tabs: SavedTab[]; skipped: number } {
  const tabs: SavedTab[] = [];
  let skipped = 0;

  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const separatorIndex = line.indexOf(' | ');
    const rawUrl = separatorIndex < 0 ? line : line.slice(0, separatorIndex).trim();
    const title = separatorIndex < 0 ? rawUrl : line.slice(separatorIndex + 3).trim();
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
      tabs.push({ id: nextId('tab'), url: rawUrl, title: title || rawUrl });
    } catch {
      skipped += 1;
    }
  }

  return { tabs, skipped };
}

export function serializeOneTabUrls(groups?: SavedTabGroup[]): string {
  return (groups ?? []).flatMap(flattenSavedTabs).map((tab) => `${tab.url} | ${tab.title || tab.url}`).join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSavedTabGroups(value: unknown): value is SavedTabGroup[] {
  if (!Array.isArray(value)) return false;

  const groupIds = new Set<string>();
  const tabIds = new Set<string>();
  function isSavedTabGroup(value: unknown): value is SavedTabGroup {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id || groupIds.has(value.id) || typeof value.name !== 'string' || !value.name.trim() || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || (value.color !== undefined && !GROUP_COLORS.includes(value.color as GroupColor)) || !Array.isArray(value.tabs) || (value.groups !== undefined && !Array.isArray(value.groups))) return false;
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
    if (nestedGroup.id === groupId && !nextGroup.tabs.length && !nextGroup.groups?.length) return [];
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
    .map((nestedGroup) => removeSavedGroupFromGroup(nestedGroup, groupId));
  return withNestedGroups(group, nextGroups);
}

export function removeSavedGroup(settings: Settings, groupId: string): Settings {
  return {
    ...settings,
    savedTabGroups: (settings.savedTabGroups ?? []).map((group) => removeSavedGroupFromGroup(group, groupId)),
  };
}
