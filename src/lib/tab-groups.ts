import { matchingRule } from './rules';
import { getSettings } from './settings';

function hostname(url?: string) {
  if (!url) return undefined;
  const parsed = new URL(url);
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.hostname : undefined;
}

export async function groupTab(tabId: number) {
  const settings = await getSettings();
  if (!settings.enabled) return false;

  const tab = await chrome.tabs.get(tabId);
  if (tab.pinned || tab.incognito) return false;

  const host = hostname(tab.url);
  const rule = host ? matchingRule(host, settings.rules) : undefined;
  if (!rule || tab.windowId === undefined) return false;

  const existing = await chrome.tabGroups.query({ windowId: tab.windowId });
  const destination = existing.find((group) => group.title === rule.groupName);

  if (destination) {
    await chrome.tabs.group({ groupId: destination.id, tabIds: [tabId] });
  } else {
    const groupId = await chrome.tabs.group({ createProperties: { windowId: tab.windowId }, tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { color: rule.color, title: rule.groupName });
  }

  return true;
}

export async function organizeCurrentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const results = await Promise.all(tabs.filter((tab) => !tab.pinned && !tab.incognito).map((tab) => groupTab(tab.id!)));
  return results.filter(Boolean).length;
}
