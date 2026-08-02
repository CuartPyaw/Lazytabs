import { groupTab, organizeAllWindows, organizeCurrentWindow, syncGroupName } from '../src/lib/tab-groups';
import { getSettings } from '../src/lib/settings';
import { defineBackground } from 'wxt/utils/define-background';

type BackgroundMessage = {
  type?: string;
  [key: string]: unknown;
};

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '操作失败。';
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
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) void groupTab(tabId);
  });

  chrome.tabGroups.onUpdated.addListener((group) => {
    if (group.title !== undefined) {
      void syncGroupName(group.id, group.title);
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
        () => Promise.all([getSettings(), chrome.tabs.query({ currentWindow: true })]).then(([settings, tabs]) => ({ enabled: settings.enabled, groupCount: settings.groups.filter((group) => group.enabled).length, tabCount: tabs.length })),
        sendResponse,
      );
    }
  });
});
