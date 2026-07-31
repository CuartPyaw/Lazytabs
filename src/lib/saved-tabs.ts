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

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function createSavedTabGroup(tabs: SavedTab[], windowLabel: string, createdAt = Date.now()): SavedTabGroup {
  return { id: nextId('group'), name: `${windowLabel} · ${formatTimestamp(createdAt)}`, createdAt, tabs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSavedTabGroups(value: unknown): value is SavedTabGroup[] {
  if (!Array.isArray(value)) return false;

  const groupIds = new Set<string>();
  const tabIds = new Set<string>();
  return value.every((groupValue) => {
    if (!isRecord(groupValue) || typeof groupValue.id !== 'string' || !groupValue.id || groupIds.has(groupValue.id) || typeof groupValue.name !== 'string' || !groupValue.name.trim() || typeof groupValue.createdAt !== 'number' || !Number.isFinite(groupValue.createdAt) || !Array.isArray(groupValue.tabs) || !groupValue.tabs.length) return false;
    groupIds.add(groupValue.id);

    return groupValue.tabs.every((tabValue) => {
      if (!isRecord(tabValue) || typeof tabValue.id !== 'string' || !tabValue.id || tabIds.has(tabValue.id) || typeof tabValue.url !== 'string' || !/^https?:\/\//.test(tabValue.url) || typeof tabValue.title !== 'string' || (tabValue.favIconUrl !== undefined && typeof tabValue.favIconUrl !== 'string')) return false;
      tabIds.add(tabValue.id);
      return true;
    });
  });
}

export function appendSavedTabGroup(settings: Settings, group: SavedTabGroup): Settings {
  return { ...settings, savedTabGroups: [...(settings.savedTabGroups ?? []), group] };
}

export function removeSavedTabGroup(settings: Settings, groupId: string): Settings {
  return { ...settings, savedTabGroups: (settings.savedTabGroups ?? []).filter((group) => group.id !== groupId) };
}

export function removeSavedTab(settings: Settings, groupId: string, tabId: string): Settings {
  const savedTabGroups = (settings.savedTabGroups ?? [])
    .map((group) => group.id === groupId ? { ...group, tabs: group.tabs.filter((tab) => tab.id !== tabId) } : group)
    .filter((group) => group.tabs.length);
  return { ...settings, savedTabGroups };
}
