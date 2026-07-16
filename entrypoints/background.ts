import { groupTab, organizeCurrentWindow } from '../src/lib/tab-groups';
import { getSettings } from '../src/lib/settings';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) void groupTab(tab.id);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) void groupTab(tabId);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'organize-current-window') {
      void organizeCurrentWindow().then((grouped) => sendResponse({ grouped }));
      return true;
    }

    if (message?.type === 'popup-state') {
      void Promise.all([getSettings(), chrome.tabs.query({ currentWindow: true })]).then(([settings, tabs]) =>
        sendResponse({ enabled: settings.enabled, ruleCount: settings.groups.filter((group) => group.enabled).reduce((count, group) => count + group.rules.length, 0), tabCount: tabs.length }),
      );
      return true;
    }
  });
});
