import type { Settings } from './settings';

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

export function normalizeSavedTabGroups(groups?: SavedTabGroup[]): SavedTabGroup[] {
  const firstGroup = groups?.[0];
  return [{
    id: firstGroup?.id ?? DEFAULT_SAVED_TAB_GROUP_ID,
    name: firstGroup?.name ?? DEFAULT_SAVED_TAB_GROUP_NAME,
    createdAt: firstGroup?.createdAt ?? 0,
    tabs: (groups ?? []).flatMap((group) => group.tabs),
  }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSavedTabGroups(value: unknown): value is SavedTabGroup[] {
  if (!Array.isArray(value)) return false;

  const groupIds = new Set<string>();
  const tabIds = new Set<string>();
  return value.every((groupValue) => {
    if (!isRecord(groupValue) || typeof groupValue.id !== 'string' || !groupValue.id || groupIds.has(groupValue.id) || typeof groupValue.name !== 'string' || !groupValue.name.trim() || typeof groupValue.createdAt !== 'number' || !Number.isFinite(groupValue.createdAt) || !Array.isArray(groupValue.tabs)) return false;
    groupIds.add(groupValue.id);

    return groupValue.tabs.every((tabValue) => {
      if (!isRecord(tabValue) || typeof tabValue.id !== 'string' || !tabValue.id || tabIds.has(tabValue.id) || typeof tabValue.url !== 'string' || !/^https?:\/\//.test(tabValue.url) || typeof tabValue.title !== 'string' || (tabValue.favIconUrl !== undefined && typeof tabValue.favIconUrl !== 'string')) return false;
      tabIds.add(tabValue.id);
      return true;
    });
  });
}

export function removeSavedTab(settings: Settings, groupId: string, tabId: string): Settings {
  const savedTabGroups = (settings.savedTabGroups ?? [])
    .map((group) => group.id === groupId ? { ...group, tabs: group.tabs.filter((tab) => tab.id !== tabId) } : group);
  return { ...settings, savedTabGroups };
}
