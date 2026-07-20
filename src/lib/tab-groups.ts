import { matchingGroup, type Group, type GroupColor } from './rules';
import { getSettings } from './settings';

const pendingGroups = new Map<string, Promise<number>>();

type GroupResult = {
  groupId: number;
  previousGroupId: number;
  windowId: number;
};

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

async function groupTabWithGroups(tabId: number, groups: Group[]): Promise<GroupResult | false> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.pinned || tab.incognito) return false;

  const host = hostname(tab.url);
  const group = host ? matchingGroup(host, groups) : undefined;
  if (!group || tab.windowId === undefined) return false;

  const windowId = tab.windowId;
  const groupId = await moveToGroup(tabId, windowId, group.name, group.color);
  return { groupId, previousGroupId: tab.groupId, windowId };
}

async function collapseOtherGroups(windowId: number) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  const groups = await chrome.tabGroups.query({ windowId });
  await Promise.allSettled(groups
    .filter((group) => group.id !== activeTab?.groupId && !group.collapsed)
    .map((group) => chrome.tabGroups.update(group.id, { collapsed: true })));
}

export async function groupTab(tabId: number) {
  const settings = await getSettings();
  if (!settings.enabled) return false;

  const result = await groupTabWithGroups(tabId, settings.groups);
  if (!result) return false;

  if (settings.collapseGroups && result.previousGroupId !== result.groupId) {
    await collapseOtherGroups(result.windowId);
  }
  return true;
}

export async function organizeCurrentWindow() {
  return organizeTabs({ currentWindow: true });
}

export async function organizeAllWindows() {
  return organizeTabs({});
}

async function organizeTabs(queryInfo: chrome.tabs.QueryInfo) {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query(queryInfo);
  const eligibleTabs = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined && !tab.pinned && !tab.incognito)
  const updatedWindowIds = new Set<number>();
  const results = await Promise.allSettled(
    eligibleTabs.map(async (tab) => {
      const result = await groupTabWithGroups(tab.id, settings.groups);
      if (result) {
        if (result.previousGroupId !== result.groupId) updatedWindowIds.add(result.windowId);
        return true;
      }
      if (tab.groupId >= 0) {
        await chrome.tabs.ungroup(tab.id);
        if (tab.windowId !== undefined) updatedWindowIds.add(tab.windowId);
        return true;
      }
      return false;
    }),
  );
  if (settings.collapseGroups) {
    await Promise.allSettled([...updatedWindowIds].map(collapseOtherGroups));
  }
  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}
