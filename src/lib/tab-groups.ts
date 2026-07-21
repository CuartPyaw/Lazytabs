import { GROUP_COLORS, matchingRule, type Rule, type RuleColor } from './rules';
import { getSettings, saveSettings } from './settings';

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

async function moveToGroup(tabId: number, windowId: number, groupName: string, color: RuleColor) {
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
    const groupColor = color === 'auto' ? GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)] : color;
    await chrome.tabGroups.update(created, { color: groupColor, title: groupName });
    return created;
  })();

  pendingGroups.set(key, groupId);
  try {
    return await groupId;
  } finally {
    pendingGroups.delete(key);
  }
}

async function groupTabWithRules(tabId: number, rules: Rule[]): Promise<GroupResult | false> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.pinned || tab.incognito) return false;

  const rule = matchingRule({ hostname: hostname(tab.url), url: tab.url, title: tab.title }, rules);
  if (!rule || tab.windowId === undefined) return false;

  const windowId = tab.windowId;
  const groupId = await moveToGroup(tabId, windowId, rule.groupName, rule.color);
  return { groupId, previousGroupId: tab.groupId, windowId };
}

async function collapseOtherGroups(windowId: number, destinationGroupIds?: Set<number>) {
  const excludedGroupIds = destinationGroupIds ?? new Set((await chrome.tabs.query({ active: true, windowId })).map((tab) => tab.groupId));
  const groups = await chrome.tabGroups.query({ windowId });
  await Promise.allSettled(groups
    .filter((group) => !excludedGroupIds.has(group.id) && !group.collapsed)
    .map((group) => chrome.tabGroups.update(group.id, { collapsed: true })));
}

export async function groupTab(tabId: number) {
  const settings = await getSettings();
  if (!settings.enabled) return false;

  const result = await groupTabWithRules(tabId, settings.rules);
  if (!result) return false;

  if (settings.collapseGroups && result.previousGroupId !== result.groupId) {
    await collapseOtherGroups(result.windowId, new Set([result.groupId]));
  }
  return true;
}

export async function syncGroupName(groupId: number, name: string) {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ groupId });
  const rule = tabs
    .map((tab) => {
      return matchingRule({ hostname: hostname(tab.url), url: tab.url, title: tab.title }, settings.rules);
    })
    .find((candidate) => candidate);
  const nextName = name.trim();

  if (!rule || !nextName || nextName === rule.groupName || settings.rules.some((item) => item.groupName === nextName && item.groupName !== rule.groupName)) return false;

  await saveSettings({ ...settings, rules: settings.rules.map((item) => item.groupName === rule.groupName ? { ...item, groupName: nextName } : item) });
  const existingGroups = await chrome.tabGroups.query({});
  await Promise.all(existingGroups
    .filter((item) => item.title === rule.groupName && item.id !== groupId)
    .map((item) => chrome.tabGroups.update(item.id, { title: nextName })));
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
  const destinationGroupsByWindow = new Map<number, Set<number>>();
  const results = await Promise.allSettled(
    eligibleTabs.map(async (tab) => {
      const result = await groupTabWithRules(tab.id, settings.rules);
      if (result) {
        if (result.previousGroupId !== result.groupId) {
          updatedWindowIds.add(result.windowId);
          const destinationGroupIds = destinationGroupsByWindow.get(result.windowId) ?? new Set<number>();
          destinationGroupIds.add(result.groupId);
          destinationGroupsByWindow.set(result.windowId, destinationGroupIds);
        }
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
    await Promise.allSettled([...updatedWindowIds].map((windowId) => collapseOtherGroups(windowId, destinationGroupsByWindow.get(windowId))));
  }
  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}
