import { groupTab, organizeAllWindows, organizeCurrentWindow, syncGroupName } from '../src/lib/tab-groups';
import { getSettings } from '../src/lib/settings';
import { defineBackground } from 'wxt/utils/define-background';

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
    if (group.title !== undefined) void syncGroupName(group.id, group.title);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'organize-current-window') {
      void getSettings()
        .then((settings) => settings.organizeAllWindows ? organizeAllWindows() : organizeCurrentWindow())
        .then((grouped) => sendResponse({ grouped }));
      return true;
    }

    if (message?.type === 'popup-state') {
      void Promise.all([getSettings(), chrome.tabs.query({ currentWindow: true })]).then(([settings, tabs]) =>
        sendResponse({ enabled: settings.enabled, ruleCount: settings.rules.filter((rule) => rule.enabled).length, tabCount: tabs.length }),
      );
      return true;
    }
  });
});
