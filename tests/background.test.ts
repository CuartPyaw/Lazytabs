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
  tabsGroup,
  tabsUpdate,
  tabsRemove,
  windowsGetCurrent,
  windowsUpdate,
  tabGroupsQuery,
  tabGroupsUpdate,
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
  tabsGroup: vi.fn(),
  tabsUpdate: vi.fn(),
  tabsRemove: vi.fn(),
  windowsGetCurrent: vi.fn(),
  windowsUpdate: vi.fn(),
  tabGroupsQuery: vi.fn(),
  tabGroupsUpdate: vi.fn(),
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
    tabsGroup.mockResolvedValue(9);
    tabsUpdate.mockResolvedValue(undefined);
    tabsRemove.mockResolvedValue(undefined);
    windowsGetCurrent.mockResolvedValue({ id: 1, type: 'normal', focused: true });
    windowsUpdate.mockResolvedValue(undefined);
    tabGroupsQuery.mockResolvedValue([]);
    tabGroupsUpdate.mockResolvedValue(undefined);
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
        group: tabsGroup,
        update: tabsUpdate,
        remove: tabsRemove,
        onCreated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      windows: {
        getCurrent: windowsGetCurrent,
        update: windowsUpdate,
      },
      tabGroups: {
        query: tabGroupsQuery,
        update: tabGroupsUpdate,
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

  it('returns current window tabs and excludes its dashboard tab when a popup is focused', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    tabsQuery.mockResolvedValue([
      { id: 20, windowId: 2, url: dashboardUrl, title: 'LazyTabs' },
      { id: 21, windowId: 2, url: 'https://example.com/docs', title: '文档', active: true, status: 'complete' },
    ] as chrome.tabs.Tab[]);
    tabGroupsQuery.mockResolvedValue([{ id: 4, windowId: 2, title: '社区', color: 'blue' }] as chrome.tabGroups.TabGroup[]);

    const snapshot = await sendMessage({ type: 'get-snapshot' });

    expect(snapshot).toEqual({
      windows: [{
        id: 2,
        focused: true,
        state: 'normal',
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
    });
    expect(tabsQuery).toHaveBeenCalledWith({ currentWindow: true });
  });

  it('returns no windows when the current window has no tabs', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    tabsQuery.mockResolvedValue([]);

    const snapshot = await sendMessage({ type: 'get-snapshot' });

    expect(snapshot).toMatchObject({ windows: [], savedTabGroups });
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
    windowsGetCurrent.mockResolvedValue({ id: 1, type: 'normal', focused: true });
    tabsQuery.mockResolvedValue([
      { id: 20, windowId: 2, url: dashboardUrl, title: 'LazyTabs' },
    ] as chrome.tabs.Tab[]);
    tabsUpdate.mockResolvedValue({ id: 20, windowId: 2, url: dashboardUrl, title: 'LazyTabs' } as chrome.tabs.Tab);

    const result = await sendMessage({ type: 'open-dashboard', windowId: 2 });

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

  it('appends saved tabs to the requested existing group', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    tabsGet.mockResolvedValue({ id: 42, windowId: 1, url: 'https://example.com/new', title: '新页', pinned: false, incognito: false } as chrome.tabs.Tab);

    const result = await sendMessage({ type: 'save-tabs', groupId: 'saved-group', windowId: 1, tabIds: [42] });

    expect(result).toMatchObject({ group: { id: 'saved-group', name: '收纳组', tabs: [{ id: 'saved-tab' }, { url: 'https://example.com/new', title: '新页' }] } });
    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }, expect.objectContaining({ url: 'https://example.com/new', title: '新页' })] }] });
    expect(tabsRemove).toHaveBeenCalledWith(42);
  });

  it('creates one usable default group when no saved group exists', async () => {
    getSettings.mockResolvedValue({ savedTabGroups: [] });
    tabsGet.mockResolvedValue({ id: 42, windowId: 1, url: 'https://example.com/new', title: '新页', pinned: false, incognito: false } as chrome.tabs.Tab);

    const snapshot = await sendMessage({ type: 'get-snapshot' });
    expect(snapshot).toMatchObject({ savedTabGroups: [{ id: 'default-saved-group', name: '默认收纳组', tabs: [] }] });

    const result = await sendMessage({ type: 'save-tabs', windowId: 1, tabIds: [42] });
    expect(result).toMatchObject({ group: { id: 'default-saved-group', name: '默认收纳组', tabs: [{ title: '新页', url: 'https://example.com/new' }] } });
  });

  it('restores and opens saved tabs in the focused normal window', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate
      .mockResolvedValueOnce({ id: 70, windowId: 7, url: 'https://example.com/docs' } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 71, windowId: 7, url: 'https://example.com/docs' } as chrome.tabs.Tab);

    const restored = await sendMessage({ type: 'restore-tab', groupId: 'saved-group', savedTabId: 'saved-tab' });
    const opened = await sendMessage({ type: 'open-tab', groupId: 'saved-group', savedTabId: 'saved-tab' });

    expect(tabsCreate).toHaveBeenNthCalledWith(1, { windowId: 7, url: 'https://example.com/docs' });
    expect(tabsCreate).toHaveBeenNthCalledWith(2, { windowId: 7, url: 'https://example.com/docs', active: false });
    expect(restored).toMatchObject({ windowId: 7, restoredTabId: 70 });
    expect(opened).toMatchObject({ tab: { windowId: 7, id: 71 } });
    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [] }] });
  });

  it('removes restored tabs from the saved group', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate.mockResolvedValue({ id: 70, windowId: 7, url: 'https://example.com/docs' } as chrome.tabs.Tab);

    const result = await sendMessage({ type: 'restore-group', groupId: 'saved-group' });

    expect(tabsCreate).toHaveBeenCalledWith({ windowId: 7, url: 'https://example.com/docs' });
    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [] }] });
    expect(result).toMatchObject({ removed: true, restoredTabIds: [70] });
  });

  it('stores a browser group as a nested group and leaves unsupported tabs open', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    tabsQuery.mockResolvedValue([
      { id: 42, windowId: 1, groupId: 4, url: 'https://example.com/video', title: '视频页', pinned: false, incognito: false },
      { id: 43, windowId: 1, groupId: 4, url: 'chrome://settings', title: '设置', pinned: false, incognito: false },
    ] as chrome.tabs.Tab[]);
    tabGroupsQuery.mockResolvedValue([{ id: 4, windowId: 1, title: '视频', color: 'blue' }] as chrome.tabGroups.TabGroup[]);

    const result = await sendMessage({ type: 'save-tabs', windowId: 1, browserGroupId: 4 });

    expect(result).toMatchObject({ group: { name: '视频', color: 'blue', tabs: [{ title: '视频页', url: 'https://example.com/video' }] } });
    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ ...savedTabGroups[0], groups: [{ id: expect.any(String), name: '视频', color: 'blue', createdAt: expect.any(Number), tabs: [{ id: expect.any(String), title: '视频页', url: 'https://example.com/video' }] }] }] });
    expect(tabsRemove).toHaveBeenCalledWith(42);
    expect(tabsRemove).not.toHaveBeenCalledWith(43);
  });

  it('merges saved browser groups by name and color', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [], groups: [{ id: 'video', name: '视频', color: 'blue' as const, createdAt: 1, tabs: [{ id: 'saved-tab', title: '旧视频', url: 'https://example.com/old' }] }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    tabsQuery.mockResolvedValue([{ id: 42, windowId: 1, groupId: 4, url: 'https://example.com/new', title: '新视频', pinned: false, incognito: false }] as chrome.tabs.Tab[]);
    tabGroupsQuery.mockResolvedValue([{ id: 4, windowId: 1, title: '视频', color: 'blue' }] as chrome.tabGroups.TabGroup[]);

    await sendMessage({ type: 'save-tabs', windowId: 1, browserGroupId: 4 });

    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ ...savedTabGroups[0], groups: [{ ...savedTabGroups[0].groups[0], tabs: [{ id: 'saved-tab', title: '旧视频', url: 'https://example.com/old' }, expect.objectContaining({ title: '新视频', url: 'https://example.com/new' })] }] }] });
  });

  it('keeps same-name saved browser groups separate when colors differ', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [], groups: [{ id: 'video-blue', name: '视频', color: 'blue' as const, createdAt: 1, tabs: [] }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    tabsQuery.mockResolvedValue([{ id: 42, windowId: 1, groupId: 4, url: 'https://example.com/new', title: '新视频', pinned: false, incognito: false }] as chrome.tabs.Tab[]);
    tabGroupsQuery.mockResolvedValue([{ id: 4, windowId: 1, title: '视频', color: 'red' }] as chrome.tabGroups.TabGroup[]);

    await sendMessage({ type: 'save-tabs', windowId: 1, browserGroupId: 4 });

    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ ...savedTabGroups[0], groups: [savedTabGroups[0].groups[0], expect.objectContaining({ name: '视频', color: 'red', tabs: [expect.objectContaining({ title: '新视频' })] })] }] });
  });

  it('merges a restored group into the first matching browser group by name and color', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [], groups: [{ id: 'video', name: '视频', color: 'blue' as const, createdAt: 1, tabs: [{ id: 'saved-tab', title: '视频页', url: 'https://example.com/video' }] }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate.mockResolvedValue({ id: 70, windowId: 7, url: 'https://example.com/video' } as chrome.tabs.Tab);
    tabGroupsQuery.mockResolvedValue([
      { id: 8, windowId: 7, title: '视频', color: 'blue' },
      { id: 9, windowId: 7, title: '视频', color: 'red' },
    ] as chrome.tabGroups.TabGroup[]);

    const result = await sendMessage({ type: 'restore-group', groupId: 'video' });

    expect(tabsGroup).toHaveBeenCalledWith({ groupId: 8, tabIds: [70] });
    expect(tabGroupsUpdate).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [] }] });
    expect(result).toMatchObject({ removed: true, restoredTabIds: [70] });
  });

  it('creates a new browser group when the matching name has another color', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [], groups: [{ id: 'video', name: '视频', color: 'blue' as const, createdAt: 1, tabs: [{ id: 'saved-tab', title: '视频页', url: 'https://example.com/video' }] }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate.mockResolvedValue({ id: 70, windowId: 7, url: 'https://example.com/video' } as chrome.tabs.Tab);
    tabsGroup.mockResolvedValue(10);
    tabGroupsQuery.mockResolvedValue([{ id: 8, windowId: 7, title: '视频', color: 'red' }] as chrome.tabGroups.TabGroup[]);

    await sendMessage({ type: 'restore-group', groupId: 'video' });

    expect(tabsGroup).toHaveBeenCalledWith({ createProperties: { windowId: 7 }, tabIds: [70] });
    expect(tabGroupsUpdate).toHaveBeenCalledWith(10, { title: '视频', color: 'blue' });
  });

  it('opens an individual saved tab in the background and removes its record', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [{ id: 'saved-tab', title: '文档', url: 'https://example.com/docs' }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate.mockResolvedValue({ id: 70, windowId: 7, url: 'https://example.com/docs' } as chrome.tabs.Tab);

    const result = await sendMessage({ type: 'open-tab', groupId: 'saved-group', savedTabId: 'saved-tab' });

    expect(tabsCreate).toHaveBeenCalledWith({ windowId: 7, url: 'https://example.com/docs', active: false });
    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [] }] });
    expect(result).toMatchObject({ tab: { windowId: 7, id: 70 } });
  });

  it('removes an empty nested group after opening its last saved tab', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [], groups: [{ id: 'video', name: '视频', color: 'blue' as const, createdAt: 1, tabs: [{ id: 'saved-tab', title: '视频页', url: 'https://example.com/video' }] }] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate.mockResolvedValue({ id: 70, windowId: 7, url: 'https://example.com/video' } as chrome.tabs.Tab);

    await sendMessage({ type: 'open-tab', groupId: 'video', savedTabId: 'saved-tab' });

    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [] }] });
  });

  it('keeps restore-all opening tabs with the existing behavior', async () => {
    const savedTabGroups = [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [
      { id: 'saved-tab-1', title: '文档 1', url: 'https://example.com/one' },
      { id: 'saved-tab-2', title: '文档 2', url: 'https://example.com/two' },
    ] }];
    getSettings.mockResolvedValue({ savedTabGroups });
    windowsGetCurrent.mockResolvedValue({ id: 7, type: 'normal', focused: true });
    tabsCreate
      .mockResolvedValueOnce({ id: 70, windowId: 7, url: 'https://example.com/one' } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 71, windowId: 7, url: 'https://example.com/two' } as chrome.tabs.Tab);

    const result = await sendMessage({ type: 'restore-all' });

    expect(tabsCreate).toHaveBeenNthCalledWith(1, { windowId: 7, url: 'https://example.com/one' });
    expect(tabsCreate).toHaveBeenNthCalledWith(2, { windowId: 7, url: 'https://example.com/two' });
    expect(result).toMatchObject({ restoredTabIds: [70, 71], windowId: 7 });
    expect(saveSettings).toHaveBeenCalledWith({ savedTabGroups: [{ id: 'saved-group', name: '收纳组', createdAt: 1, tabs: [] }] });
  });
});
