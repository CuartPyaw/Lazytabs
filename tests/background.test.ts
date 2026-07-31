import { beforeEach, describe, expect, it, vi } from 'vitest';

type BackgroundMessage = { type?: string; [key: string]: unknown };

const {
  groupTab,
  organizeAllWindows,
  organizeCurrentWindow,
  syncGroupName,
  getSettings,
  saveSettings,
  tabsQuery,
  tabsGet,
  tabsCreate,
  tabsUpdate,
  tabsRemove,
  windowsGetAll,
  windowsGetCurrent,
  windowsUpdate,
  tabGroupsQuery,
  runtimeGetURL,
} = vi.hoisted(() => ({
  groupTab: vi.fn(),
  organizeAllWindows: vi.fn(),
  organizeCurrentWindow: vi.fn(),
  syncGroupName: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  tabsQuery: vi.fn(),
  tabsGet: vi.fn(),
  tabsCreate: vi.fn(),
  tabsUpdate: vi.fn(),
  tabsRemove: vi.fn(),
  windowsGetAll: vi.fn(),
  windowsGetCurrent: vi.fn(),
  windowsUpdate: vi.fn(),
  tabGroupsQuery: vi.fn(),
  runtimeGetURL: vi.fn(),
}));

vi.mock('../src/lib/tab-groups', () => ({ groupTab, organizeAllWindows, organizeCurrentWindow, syncGroupName }));
vi.mock('../src/lib/settings', () => ({ getSettings, saveSettings }));
vi.mock('wxt/utils/define-background', () => ({
  defineBackground: (setup: () => void) => {
    setup();
  },
}));

describe('background commands', () => {
  const dashboardUrl = 'chrome-extension://test/dashboard.html';
  const commandListeners: Array<(command: string) => void> = [];
  const messageListeners: Array<(message: BackgroundMessage, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void> = [];
  const groupUpdatedListeners: Array<(group: chrome.tabGroups.TabGroup) => void> = [];

  async function sendMessage(message: BackgroundMessage) {
    const sendResponse = vi.fn();
    expect(messageListeners[0](message, undefined, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
    return sendResponse.mock.calls[0][0] as Record<string, unknown>;
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    commandListeners.length = 0;
    messageListeners.length = 0;
    groupUpdatedListeners.length = 0;
    getSettings.mockResolvedValue({ enabled: true, groups: [] });
    saveSettings.mockResolvedValue(undefined);
    tabsQuery.mockResolvedValue([]);
    tabsGet.mockResolvedValue(undefined);
    tabsCreate.mockResolvedValue(undefined);
    tabsUpdate.mockResolvedValue(undefined);
    tabsRemove.mockResolvedValue(undefined);
    windowsGetAll.mockResolvedValue([]);
    windowsGetCurrent.mockResolvedValue({ id: 1, type: 'normal', focused: true });
    windowsUpdate.mockResolvedValue(undefined);
    tabGroupsQuery.mockResolvedValue([]);
    runtimeGetURL.mockReturnValue(dashboardUrl);
    vi.stubGlobal('chrome', {
      commands: { onCommand: { addListener: vi.fn((listener) => commandListeners.push(listener)) } },
      runtime: {
        getURL: runtimeGetURL,
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onMessage: { addListener: vi.fn((listener) => messageListeners.push(listener)) },
      },
      tabs: {
        query: tabsQuery,
        get: tabsGet,
        create: tabsCreate,
        update: tabsUpdate,
        remove: tabsRemove,
        onCreated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      windows: {
        getAll: windowsGetAll,
        getCurrent: windowsGetCurrent,
        update: windowsUpdate,
      },
      tabGroups: {
        query: tabGroupsQuery,
        onUpdated: { addListener: vi.fn((listener) => groupUpdatedListeners.push(listener)) },
      },
    });

    await import('../entrypoints/background');
  });

  it('organizes the current window when its command is invoked', () => {
    commandListeners[0]('organize-current-window');

    expect(organizeCurrentWindow).toHaveBeenCalledOnce();
  });

  it('ignores unrelated commands', () => {
    commandListeners[0]('unrelated-command');

    expect(organizeCurrentWindow).not.toHaveBeenCalled();
  });

  it('syncs browser group title changes', () => {
    groupUpdatedListeners[0]({ id: 1, title: '社区' } as chrome.tabGroups.TabGroup);

    expect(syncGroupName).toHaveBeenCalledWith(1, '社区');
  });

  it('organizes all windows when enabled in settings', async () => {
    getSettings.mockResolvedValue({ organizeAllWindows: true });
    organizeAllWindows.mockResolvedValue(2);
    const sendResponse = vi.fn();

    expect(messageListeners[0]({ type: 'organize-current-window' }, undefined, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(organizeAllWindows).toHaveBeenCalledOnce();
      expect(sendResponse).toHaveBeenCalledWith({ grouped: 2 });
    });
    expect(organizeCurrentWindow).not.toHaveBeenCalled();
  });

  it('returns only the focused normal window and excludes its dashboard tab', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups, retainRestoredGroups: true });
    windowsGetAll.mockResolvedValue([
      { id: 1, type: 'normal', focused: false, tabs: [{ id: 11, windowId: 1, url: 'https://other.example' }] },
      {
        id: 2,
        type: 'normal',
        focused: true,
        state: 'maximized',
        tabs: [
          { id: 20, windowId: 2, url: dashboardUrl, title: 'LazyTabs' },
          { id: 21, windowId: 2, url: 'https://example.com/docs', title: '文档', active: true, status: 'complete' },
        ],
      },
      { id: 3, type: 'incognito', focused: false, tabs: [{ id: 31, windowId: 3, url: 'https://private.example' }] },
    ] as chrome.windows.Window[]);
    tabGroupsQuery.mockResolvedValue([{ id: 4, windowId: 2, title: '社区', color: 'blue' }] as chrome.tabGroups.TabGroup[]);

    const snapshot = await sendMessage({ type: 'get-snapshot' });

    expect(snapshot).toEqual({
      windows: [{
        id: 2,
        focused: true,
        state: 'maximized',
        groups: [{ id: 4, title: '社区', color: 'blue' }],
        tabs: [{
          id: 21,
          windowId: 2,
          groupId: -1,
          active: true,
          pinned: false,
          incognito: false,
          title: '文档',
          url: 'https://example.com/docs',
          favIconUrl: '',
          status: 'complete',
          restorable: true,
        }],
      }],
      savedTabGroups,
      settings: { retainRestoredGroups: true },
    });
  });

  it('returns no windows when the focused window is not a normal window', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetAll.mockResolvedValue([
      { id: 1, type: 'normal', focused: false, incognito: false, alwaysOnTop: false, tabs: [] },
      { id: 2, type: 'incognito', focused: true, incognito: true, alwaysOnTop: false, tabs: [] },
    ] as chrome.windows.Window[]);

    const snapshot = await sendMessage({ type: 'get-snapshot' });

    expect(snapshot).toMatchObject({ windows: [], savedTabGroups, settings: { retainRestoredGroups: false } });
  });

  it('excludes the dashboard tab from popup-state count', async () => {
    getSettings.mockResolvedValue({ enabled: true, groups: [{ enabled: true }, { enabled: false }] });
    tabsQuery.mockResolvedValue([
      { id: 1, url: dashboardUrl },
      { id: 2, url: 'https://example.com' },
      { id: 3, url: 'chrome://newtab/' },
    ] as chrome.tabs.Tab[]);

    const state = await sendMessage({ type: 'popup-state' });

    expect(state).toEqual({ enabled: true, groupCount: 1, tabCount: 2 });
    expect(tabsQuery).toHaveBeenCalledWith({ currentWindow: true });
  });

  it('reuses a dashboard only in the focused normal window', async () => {
    windowsGetCurrent.mockResolvedValue({ id: 2, type: 'normal', focused: true });
    tabsQuery.mockResolvedValue([
      { id: 20, windowId: 2, url: dashboardUrl, title: 'LazyTabs' },
    ] as chrome.tabs.Tab[]);
    tabsUpdate.mockResolvedValue({ id: 20, windowId: 2, url: dashboardUrl, title: 'LazyTabs' } as chrome.tabs.Tab);

    const result = await sendMessage({ type: 'open-dashboard' });

    expect(tabsQuery).toHaveBeenCalledWith({ windowId: 2 });
    expect(windowsUpdate).toHaveBeenCalledWith(2, { focused: true });
    expect(tabsUpdate).toHaveBeenCalledWith(20, { active: true });
    expect(tabsCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: false, tab: { id: 20, windowId: 2 } });
  });

  it('creates a dashboard in each focused normal window when that window has none', async () => {
    windowsGetCurrent
      .mockResolvedValueOnce({ id: 2, type: 'normal', focused: true })
      .mockResolvedValueOnce({ id: 3, type: 'normal', focused: true });
    tabsQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 30, windowId: 3, url: dashboardUrl }] as chrome.tabs.Tab[]);
    tabsCreate.mockResolvedValue({ id: 20, windowId: 2, url: dashboardUrl } as chrome.tabs.Tab);
    tabsUpdate.mockResolvedValue({ id: 30, windowId: 3, url: dashboardUrl } as chrome.tabs.Tab);

    const first = await sendMessage({ type: 'open-dashboard' });
    const second = await sendMessage({ type: 'open-dashboard' });

    expect(tabsCreate).toHaveBeenCalledWith({ windowId: 2, url: dashboardUrl });
    expect(tabsQuery).toHaveBeenNthCalledWith(1, { windowId: 2 });
    expect(tabsQuery).toHaveBeenNthCalledWith(2, { windowId: 3 });
    expect(windowsUpdate).toHaveBeenCalledWith(3, { focused: true });
    expect(second).toMatchObject({ created: false, tab: { id: 30, windowId: 3 } });
    expect(first).toMatchObject({ created: true, tab: { id: 20, windowId: 2 } });
  });

  it('restores and opens saved tabs in the focused normal window', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups, retainRestoredGroups: true });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate
      .mockResolvedValueOnce({ id: 70, windowId: 7, url: 'https://example.com/docs' } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 71, windowId: 7, url: 'https://example.com/docs' } as chrome.tabs.Tab);

    const restored = await sendMessage({ type: 'restore-tab', groupId: 'saved-group', savedTabId: 'saved-tab' });
    const opened = await sendMessage({ type: 'open-tab', groupId: 'saved-group', savedTabId: 'saved-tab' });

    expect(tabsCreate).toHaveBeenNthCalledWith(1, { windowId: 7, url: 'https://example.com/docs' });
    expect(tabsCreate).toHaveBeenNthCalledWith(2, { windowId: 7, url: 'https://example.com/docs' });
    expect(restored).toMatchObject({ windowId: 7, restoredTabId: 70 });
    expect(opened).toMatchObject({ tab: { windowId: 7, id: 71 } });
  });
});
