import { matchingGroup, type Group, type GroupColor } from './rules';
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
    return pendingGroup;
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
    return await groupId;
  } finally {
    pendingGroups.delete(key);
  }
}

async function groupTabWithGroups(tabId: number, groups: Group[]) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.pinned || tab.incognito) return false;

  const host = hostname(tab.url);
  const group = host ? matchingGroup(host, groups) : undefined;
  if (!group || tab.windowId === undefined) return false;

  return moveToGroup(tabId, tab.windowId, group.name, group.color);
}

export async function groupTab(tabId: number) {
  const settings = await getSettings();
  if (!settings.enabled) return false;

  return (await groupTabWithGroups(tabId, settings.groups)) !== false;
}

export async function organizeCurrentWindow() {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const eligibleTabs = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined && !tab.pinned && !tab.incognito)
  const updatedGroupIds = new Set<number>();
  const activeGroupIds = new Set<number>();
  const results = await Promise.allSettled(
    eligibleTabs.map(async (tab) => {
      const groupId = await groupTabWithGroups(tab.id, settings.groups);
      if (groupId !== false) {
        updatedGroupIds.add(groupId);
        if (tab.active) activeGroupIds.add(groupId);
        return true;
      }
      if (tab.groupId >= 0) {
        await chrome.tabs.ungroup(tab.id);
        return true;
      }
      return false;
    }),
  );
  if (settings.collapseGroups) {
    await Promise.allSettled([...updatedGroupIds]
      .filter((groupId) => !activeGroupIds.has(groupId))
      .map((groupId) => chrome.tabGroups.update(groupId, { collapsed: true })));
  }
  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}
