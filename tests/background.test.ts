import { beforeEach, describe, expect, it, vi } from 'vitest';

type BackgroundMessage = { type?: string; [key: string]: unknown };

const {
  groupTab,
  organizeAllWindows,
  organizeCurrentWindow,
  syncGroupName,
  getSettings,
  tabsQuery,
} = vi.hoisted(() => ({
  groupTab: vi.fn(),
  organizeAllWindows: vi.fn(),
  organizeCurrentWindow: vi.fn(),
  syncGroupName: vi.fn(),
  getSettings: vi.fn(),
  tabsQuery: vi.fn(),
}));

vi.mock('../src/lib/tab-groups', () => ({ groupTab, organizeAllWindows, organizeCurrentWindow, syncGroupName }));
vi.mock('../src/lib/settings', () => ({ getSettings }));
vi.mock('wxt/utils/define-background', () => ({
  defineBackground: (setup: () => void) => {
    setup();
  },
}));

describe('background commands', () => {
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
    tabsQuery.mockResolvedValue([]);
    vi.stubGlobal('chrome', {
      commands: { onCommand: { addListener: vi.fn((listener) => commandListeners.push(listener)) } },
      runtime: {
        onMessage: { addListener: vi.fn((listener) => messageListeners.push(listener)) },
      },
      tabs: {
        query: tabsQuery,
        onCreated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      tabGroups: {
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

  it('counts all tabs in the current window for popup state', async () => {
    getSettings.mockResolvedValue({ enabled: true, groups: [{ enabled: true }, { enabled: false }] });
    tabsQuery.mockResolvedValue([
      { id: 1, url: 'https://example.com' },
      { id: 2, url: 'chrome://newtab/' },
    ] as chrome.tabs.Tab[]);

    const state = await sendMessage({ type: 'popup-state' });

    expect(state).toEqual({ enabled: true, groupCount: 1, tabCount: 2 });
    expect(tabsQuery).toHaveBeenCalledWith({ currentWindow: true });
  });
});
