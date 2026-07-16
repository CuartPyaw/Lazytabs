import { matchingGroup, type GroupColor } from './rules';
import { getSettings } from './settings';

const pendingGroups = new Map<string, Promise<number>>();

function hostname(url?: string) {
  if (!url) return undefined;
  const parsed = new URL(url);
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.hostname : undefined;
}

async function moveToGroup(tabId: number, windowId: number, groupName: string, color: GroupColor) {
  const key = `${windowId}:${groupName}`;
  const pendingGroup = pendingGroups.get(key);
  if (pendingGroup) {
    await chrome.tabs.group({ groupId: await pendingGroup, tabIds: [tabId] });
    return;
  }

  const groupId = (async () => {
    const existing = await chrome.tabGroups.query({ windowId });
    const destination = existing.find((group) => group.title === groupName);

    if (destination) {
      await chrome.tabs.group({ groupId: destination.id, tabIds: [tabId] });
      return destination.id;
    }

    const created = await chrome.tabs.group({ createProperties: { windowId }, tabIds: [tabId] });
    await chrome.tabGroups.update(created, { color, title: groupName });
    return created;
  })();

  pendingGroups.set(key, groupId);
  try {
    await groupId;
  } finally {
    pendingGroups.delete(key);
  }
}

export async function groupTab(tabId: number) {
  const settings = await getSettings();
  if (!settings.enabled) return false;

  const tab = await chrome.tabs.get(tabId);
  if (tab.pinned || tab.incognito) return false;

  const host = hostname(tab.url);
  const group = host ? matchingGroup(host, settings.groups) : undefined;
  if (!group || tab.windowId === undefined) return false;

  await moveToGroup(tabId, tab.windowId, group.name, group.color);

  return true;
}

export async function organizeCurrentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const tabIds = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined && !tab.pinned && !tab.incognito)
    .map((tab) => tab.id);
  const results = await Promise.allSettled(
    tabIds.map((tabId) => groupTab(tabId)),
  );
  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}
