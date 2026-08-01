import { groupTab, organizeAllWindows, organizeCurrentWindow, syncGroupName } from '../src/lib/tab-groups';
import { isRestorableTab, normalizeSavedTabGroups, removeSavedTab, toSavedTab, type SavedTab, type SavedTabGroup } from '../src/lib/saved-tabs';
import { getSettings, saveSettings, type Settings } from '../src/lib/settings';
import { defineBackground } from 'wxt/utils/define-background';

type BackgroundMessage = {
  type?: string;
  [key: string]: unknown;
};

type CloseTabsResult = {
  closedTabIds: number[];
  failedTabIds: number[];
  errors: string[];
};

type RestoreResult = {
  restoredTabIds: number[];
  failedSavedTabIds: string[];
  errors: string[];
};

let savedTabsQueue: Promise<void> = Promise.resolve();

// ponytail: one background queue; use per-group locks only if management traffic becomes high.
function withSavedTabsLock<T>(operation: () => Promise<T>) {
  const result = savedTabsQueue.then(operation, operation);
  savedTabsQueue = result.then(() => undefined, () => undefined);
  return result;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '操作失败。';
}

function uniqueNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item)))];
}

function notifySnapshotChanged(reason: string) {
  const sendMessage = chrome.runtime?.sendMessage;
  if (typeof sendMessage !== 'function') return;
  void sendMessage({ type: 'snapshot-changed', reason }).catch(() => undefined);
}

function normalizeSettings(settings: Settings): Settings & { savedTabGroups: SavedTabGroup[] } {
  return { ...settings, savedTabGroups: normalizeSavedTabGroups(settings.savedTabGroups) };
}

function serializeTab(tab: chrome.tabs.Tab, windowId: number) {
  return {
    id: tab.id ?? -1,
    windowId: tab.windowId ?? windowId,
    groupId: tab.groupId ?? -1,
    active: tab.active === true,
    pinned: tab.pinned === true,
    incognito: tab.incognito === true,
    title: tab.title ?? '',
    url: tab.url ?? '',
    favIconUrl: tab.favIconUrl ?? '',
    status: tab.status ?? '',
    restorable: isRestorableTab(tab),
  };
}

async function readSnapshot() {
  const [rawSettings, windows, groups] = await Promise.all([
    getSettings(),
    chrome.windows.getAll({ populate: true }),
    chrome.tabGroups.query({}),
  ]);
  const settings = normalizeSettings(rawSettings);
  const dashboardUrl = chrome.runtime.getURL('dashboard.html');
  const focusedWindow = windows.find((window) => window.focused === true && (!window.type || window.type === 'normal'));

  const groupsByWindow = new Map<number, chrome.tabGroups.TabGroup[]>();
  groups.forEach((group) => {
    const windowGroups = groupsByWindow.get(group.windowId) ?? [];
    windowGroups.push(group);
    groupsByWindow.set(group.windowId, windowGroups);
  });

  return {
    windows: focusedWindow === undefined ? [] : [focusedWindow].flatMap((window) => {
      if (window.id === undefined || (window.type && window.type !== 'normal')) return [];
      const windowId = window.id;
      return [{
        id: windowId,
        focused: window.focused === true,
        state: window.state ?? 'normal',
        groups: groupsByWindow.get(windowId)?.map((group) => ({ id: group.id, title: group.title ?? '', color: group.color })) ?? [],
        tabs: (window.tabs ?? []).filter((tab): tab is chrome.tabs.Tab => tab !== undefined && tab.id !== undefined && tab.url !== dashboardUrl).map((tab) => serializeTab(tab, windowId)),
      }];
    }),
    savedTabGroups: settings.savedTabGroups ?? [],
  };
}

async function getTabsForSave(tabIds: number[] | undefined, windowId: number | undefined) {
  if (!tabIds) {
    const tabs = await chrome.tabs.query(windowId === undefined ? { currentWindow: true } : { windowId });
    return { tabs, failedTabIds: [] as number[] };
  }

  const results = await Promise.all(tabIds.map(async (tabId) => {
    try {
      return { tab: await chrome.tabs.get(tabId) };
    } catch {
      return { failedTabId: tabId };
    }
  }));
  const tabs: chrome.tabs.Tab[] = results.flatMap((result) => 'tab' in result && result.tab ? [result.tab] : []);
  return {
    tabs,
    failedTabIds: results.flatMap((result) => 'failedTabId' in result ? [result.failedTabId] : []),
  };
}

async function closeTabs(tabIds: number[]): Promise<CloseTabsResult> {
  const results = await Promise.all(tabIds.map(async (tabId) => {
    try {
      await chrome.tabs.remove(tabId);
      return { tabId };
    } catch (error) {
      return { tabId, error: errorMessage(error) };
    }
  }));

  return {
    closedTabIds: results.flatMap((result) => 'error' in result ? [] : [result.tabId]),
    failedTabIds: results.flatMap((result) => 'error' in result ? [result.tabId] : []),
    errors: results.flatMap((result) => 'error' in result && result.error ? [result.error] : []),
  };
}

async function saveTabs(tabIds: number[] | undefined, windowId: number | undefined, groupId?: string) {
  return withSavedTabsLock(async () => {
    const selectedTabIds = tabIds ? uniqueNumbers(tabIds) : undefined;
    const { tabs, failedTabIds } = await getTabsForSave(selectedTabIds, windowId);
    const savedTabs: Array<{ sourceTabId: number; tab: SavedTab }> = [];
    const skippedTabIds: number[] = [];

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const savedTab = toSavedTab(tab);
      if (savedTab) savedTabs.push({ sourceTabId: tab.id, tab: savedTab });
      else skippedTabIds.push(tab.id);
    }

    if (!savedTabs.length) throw new Error('没有可收纳的网页标签。');

    const rawSettings = await getSettings();
    const settings = normalizeSettings(rawSettings);
    const targetGroup = settings.savedTabGroups[0];
    if (groupId && groupId !== targetGroup.id) throw new Error('只能使用默认收纳组。');

    const group = { ...targetGroup, tabs: [...targetGroup.tabs, ...savedTabs.map((item) => item.tab)] };
    const nextSettings = { ...settings, savedTabGroups: [group] };

    // Persist before closing tabs so a browser API failure cannot lose the records.
    await saveSettings(nextSettings);
    const closeResult = await closeTabs(savedTabs.map((item) => item.sourceTabId));
    notifySnapshotChanged('saved-tabs');

    return {
      group,
      skippedTabIds: [...new Set([...failedTabIds, ...skippedTabIds])],
      ...closeResult,
    };
  });
}

async function currentWindowId() {
  const window = await chrome.windows.getCurrent();
  if (window.id === undefined || (window.type && window.type !== 'normal')) throw new Error('没有可用的普通窗口。');
  return window.id;
}

async function createTabInCurrentWindow(savedTab: SavedTab) {
  const windowId = await currentWindowId();
  const tab = await chrome.tabs.create({ windowId, url: savedTab.url });
  if (tab.id === undefined) throw new Error('新标签创建成功但未返回标签 ID。');
  return { windowId, tabId: tab.id };
}

async function restoreGroup(settings: Settings, group: SavedTabGroup, windowId: number): Promise<RestoreResult & { remainingTabs: SavedTab[] }> {
  const restoredTabIds: number[] = [];
  const failedSavedTabIds: string[] = [];
  const errors: string[] = [];

  for (const savedTab of group.tabs) {
    try {
      const tab = await chrome.tabs.create({ windowId, url: savedTab.url });
      if (tab.id === undefined) throw new Error('新标签创建成功但未返回标签 ID。');
      restoredTabIds.push(tab.id);
    } catch (error) {
      failedSavedTabIds.push(savedTab.id);
      errors.push(errorMessage(error));
    }
  }

  return { restoredTabIds, failedSavedTabIds, errors, remainingTabs: group.tabs.filter((tab) => failedSavedTabIds.includes(tab.id)), };
}

async function restoreSavedTab(groupId: string, savedTabId: string) {
  return withSavedTabsLock(async () => {
    const rawSettings = await getSettings();
    const settings = normalizeSettings(rawSettings);
    const group = settings.savedTabGroups?.find((item) => item.id === groupId);
    const savedTab = group?.tabs.find((item) => item.id === savedTabId);
    if (!group || !savedTab) throw new Error('找不到要恢复的收纳记录。');

    const { windowId, tabId } = await createTabInCurrentWindow(savedTab);
    await saveSettings(removeSavedTab(settings, groupId, savedTabId));
    notifySnapshotChanged('restored-tab');
    return { groupId, savedTabId, restoredTabId: tabId, windowId, removed: true };
  });
}

async function restoreSavedGroup(groupId: string) {
  return withSavedTabsLock(async () => {
    const rawSettings = await getSettings();
    const settings = normalizeSettings(rawSettings);
    const group = settings.savedTabGroups?.find((item) => item.id === groupId);
    if (!group) throw new Error('找不到要恢复的收纳组。');

    const windowId = await currentWindowId();
    const result = await restoreGroup(settings, group, windowId);
    if (result.failedSavedTabIds.length < group.tabs.length) {
      const savedTabGroups = settings.savedTabGroups.map((item) => item.id === groupId ? { ...item, tabs: result.remainingTabs } : item);
      await saveSettings({ ...settings, savedTabGroups });
      notifySnapshotChanged('restored-group');
    }

    const { remainingTabs: _remainingTabs, ...response } = result;
    return { groupId, windowId, removed: result.failedSavedTabIds.length === 0, ...response };
  });
}

async function restoreAllSavedGroups() {
  return withSavedTabsLock(async () => {
    const rawSettings = await getSettings();
    const settings = normalizeSettings(rawSettings);
    const groups = settings.savedTabGroups;
    const windowId = await currentWindowId();
    const remainingGroups: SavedTabGroup[] = [];
    const restoredTabIds: number[] = [];
    const failedSavedTabIds: string[] = [];
    const errors: string[] = [];

    for (const group of groups) {
      const result = await restoreGroup(settings, group, windowId);
      restoredTabIds.push(...result.restoredTabIds);
      failedSavedTabIds.push(...result.failedSavedTabIds);
      errors.push(...result.errors);
      remainingGroups.push({ ...group, tabs: result.remainingTabs });
    }

    await saveSettings({ ...settings, savedTabGroups: remainingGroups });
    notifySnapshotChanged('restored-all');

    return { windowId, restoredTabIds, failedSavedTabIds, errors, removed: failedSavedTabIds.length === 0 };
  });
}

async function deleteSavedGroup(groupId: string) {
  throw new Error('默认收纳组不能删除。');
}

async function deleteSavedTab(groupId: string, savedTabId: string) {
  return withSavedTabsLock(async () => {
    const rawSettings = await getSettings();
    const settings = normalizeSettings(rawSettings);
    const group = settings.savedTabGroups?.find((item) => item.id === groupId);
    if (!group?.tabs.some((tab) => tab.id === savedTabId)) return { groupId, savedTabId, deleted: false };
    await saveSettings(removeSavedTab(settings, groupId, savedTabId));
    notifySnapshotChanged('deleted-tab');
    return { groupId, savedTabId, deleted: true };
  });
}

async function renameSavedGroup(groupId: string, name: string) {
  throw new Error('默认收纳组不能重命名。');
}

async function focusTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId === undefined) throw new Error('标签没有所属窗口。');
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
  return { tab: serializeTab({ ...tab, active: true }, tab.windowId) };
}

async function openTab(message: BackgroundMessage) {
  let url: string | undefined;
  if (typeof message.url === 'string') url = message.url;
  if (typeof message.groupId === 'string' && typeof message.savedTabId === 'string') {
    const rawSettings = await getSettings();
    const settings = normalizeSettings(rawSettings);
    url = settings.savedTabGroups?.find((group) => group.id === message.groupId)?.tabs.find((tab) => tab.id === message.savedTabId)?.url;
  }
  if (!url || !/^https?:\/\//.test(url)) throw new Error('只能打开可恢复的网页地址。');

  const windowId = typeof message.windowId === 'number' ? message.windowId : await currentWindowId();
  const tab = await chrome.tabs.create({ windowId, url, active: false });
  if (tab.id === undefined) throw new Error('新标签创建成功但未返回标签 ID。');
  return { tab: serializeTab(tab, windowId) };
}

async function openDashboard(targetWindowId?: number) {
  const url = chrome.runtime.getURL('dashboard.html');
  const windowId = targetWindowId ?? await currentWindowId();
  const existing = (await chrome.tabs.query({ windowId })).find((tab) => tab.id !== undefined && tab.url === url);
  if (existing?.id !== undefined && existing.windowId !== undefined) {
    await chrome.windows.update(existing.windowId, { focused: true });
    const tab = await chrome.tabs.update(existing.id, { active: true });
    if (tab === undefined) throw new Error('管理页面激活失败。');
    return { tab: serializeTab(tab, existing.windowId), created: false };
  }

  const tab = await chrome.tabs.create({ windowId, url });
  if (tab.id === undefined) throw new Error('管理页面创建成功但未返回标签 ID。');
  return { tab: serializeTab(tab, tab.windowId ?? -1), created: true };
}

function respondAsync(operation: () => Promise<unknown>, sendResponse: (response: unknown) => void) {
  void operation().then(sendResponse).catch((error) => sendResponse({ error: errorMessage(error) }));
  return true;
}

export default defineBackground(() => {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'organize-current-window') void organizeCurrentWindow();
  });

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) void groupTab(tab.id);
    notifySnapshotChanged('tab-created');
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) void groupTab(tabId);
    if (changeInfo.url !== undefined || changeInfo.title !== undefined || changeInfo.status !== undefined || changeInfo.pinned !== undefined || changeInfo.groupId !== undefined) notifySnapshotChanged('tab-updated');
  });

  chrome.tabs.onRemoved?.addListener(() => notifySnapshotChanged('tab-removed'));
  chrome.tabs.onActivated?.addListener(() => notifySnapshotChanged('tab-activated'));
  chrome.windows?.onCreated?.addListener(() => notifySnapshotChanged('window-created'));
  chrome.windows?.onRemoved?.addListener(() => notifySnapshotChanged('window-removed'));
  chrome.windows?.onFocusChanged?.addListener(() => notifySnapshotChanged('window-focused'));
  chrome.storage?.onChanged?.addListener((_changes, areaName) => {
    if (areaName === 'local') notifySnapshotChanged('storage-changed');
  });

  chrome.tabGroups.onUpdated.addListener((group) => {
    if (group.title !== undefined) {
      void syncGroupName(group.id, group.title);
      notifySnapshotChanged('tab-group-updated');
    }
  });

  chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
    if (message?.type === 'organize-current-window') {
      return respondAsync(
        () => getSettings().then((settings) => settings.organizeAllWindows ? organizeAllWindows() : organizeCurrentWindow()).then((grouped) => ({ grouped })),
        sendResponse,
      );
    }

    if (message?.type === 'popup-state') {
      return respondAsync(
        () => Promise.all([getSettings(), chrome.tabs.query({ currentWindow: true })]).then(([settings, tabs]) => ({ enabled: settings.enabled, groupCount: settings.groups.filter((group) => group.enabled).length, tabCount: tabs.filter((tab) => tab.url !== chrome.runtime.getURL('dashboard.html')).length })),
        sendResponse,
      );
    }

    if (message?.type === 'get-snapshot') return respondAsync(readSnapshot, sendResponse);
    if (message?.type === 'save-window-tabs') return respondAsync(() => saveTabs(undefined, typeof message.windowId === 'number' ? message.windowId : undefined), sendResponse);
    if (message?.type === 'save-tabs') return respondAsync(() => saveTabs(uniqueNumbers(message.tabIds), typeof message.windowId === 'number' ? message.windowId : undefined, typeof message.groupId === 'string' ? message.groupId : undefined), sendResponse);
    if (message?.type === 'restore-tab') return respondAsync(() => restoreSavedTab(String(message.groupId), String(message.savedTabId)), sendResponse);
    if (message?.type === 'restore-group') return respondAsync(() => restoreSavedGroup(String(message.groupId)), sendResponse);
    if (message?.type === 'restore-all') return respondAsync(restoreAllSavedGroups, sendResponse);
    if (message?.type === 'delete-group') return respondAsync(() => deleteSavedGroup(String(message.groupId)), sendResponse);
    if (message?.type === 'delete-tab') return respondAsync(() => deleteSavedTab(String(message.groupId), String(message.savedTabId)), sendResponse);
    if (message?.type === 'rename-group') return respondAsync(() => renameSavedGroup(String(message.groupId), typeof message.name === 'string' ? message.name : ''), sendResponse);
    if (message?.type === 'close-tabs') return respondAsync(() => closeTabs(uniqueNumbers(message.tabIds)), sendResponse);
    if (message?.type === 'focus-tab' && typeof message.tabId === 'number') return respondAsync(() => focusTab(message.tabId as number), sendResponse);
    if (message?.type === 'open-tab') return respondAsync(() => openTab(message), sendResponse);
    if (message?.type === 'open-dashboard') return respondAsync(() => openDashboard(typeof message.windowId === 'number' ? message.windowId : undefined), sendResponse);
  });
});
