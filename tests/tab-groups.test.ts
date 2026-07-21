import { beforeEach, describe, expect, it, vi } from 'vitest';

import { groupTab, organizeAllWindows, organizeCurrentWindow, syncGroupName } from '../src/lib/tab-groups';
import { getSettings, saveSettings } from '../src/lib/settings';

vi.mock('../src/lib/settings', () => ({ getSettings: vi.fn(), saveSettings: vi.fn() }));

const mockedGetSettings = vi.mocked(getSettings);
const mockedSaveSettings = vi.mocked(saveSettings);

describe('tab groups', () => {
  beforeEach(() => {
    mockedSaveSettings.mockClear();
    mockedSaveSettings.mockResolvedValue(undefined);
    mockedGetSettings.mockResolvedValue({
      enabled: true,
      collapseGroups: true,
      organizeAllWindows: false,
      theme: 'system',
      groups: [{ id: 'video', name: '视频', color: 'blue', enabled: true, rules: [{ id: 'youtube', pattern: 'youtube.com' }] }],
    });
  });

  it('creates one group for concurrent matching tabs', async () => {
    const group = vi.fn(async (options: chrome.tabs.GroupOptions) => {
      if ('createProperties' in options) return 1;
      return options.groupId;
    });

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async (tabId: number) => ({ id: tabId, url: 'https://youtube.com/watch', windowId: 1 })),
        group,
        query: vi.fn(async () => [
          { id: 1, url: 'https://youtube.com/watch', windowId: 1 },
          { id: 2, url: 'https://youtube.com/watch', windowId: 1 },
        ]),
      },
      tabGroups: {
        query: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
      },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(2);

    expect(group).toHaveBeenCalledTimes(2);
    expect(group).toHaveBeenCalledWith({ createProperties: { windowId: 1 }, tabIds: [1] });
    expect(group).toHaveBeenCalledWith({ groupId: 1, tabIds: [2] });
  });

  it('groups remaining matching tabs when one tab cannot be grouped', async () => {
    mockedGetSettings.mockResolvedValue({
      enabled: true,
      collapseGroups: true,
      organizeAllWindows: false,
      theme: 'system',
      groups: [
        { id: 'video', name: '视频', color: 'blue', enabled: true, rules: [{ id: 'youtube', pattern: 'youtube.com' }] },
        { id: 'code', name: '代码', color: 'green', enabled: true, rules: [{ id: 'github', pattern: 'github.com' }] },
      ],
    });

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async (tabId: number) => ({ id: tabId, url: tabId === 1 ? 'https://youtube.com/watch' : 'https://github.com/openai', windowId: 1 })),
        group: vi.fn(async (options: chrome.tabs.GroupOptions) => {
          if ('createProperties' in options && Array.isArray(options.tabIds) && options.tabIds[0] === 1) throw new Error('tab is no longer available');
          return 2;
        }),
        query: vi.fn(async () => [
          { id: 1, url: 'https://youtube.com/watch', windowId: 1 },
          { id: 2, url: 'https://github.com/openai', windowId: 1 },
        ]),
      },
      tabGroups: {
        query: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
      },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(1);
  });

  it('organizes matching tabs when automatic grouping is disabled', async () => {
    mockedGetSettings.mockResolvedValue({
      enabled: false,
      collapseGroups: false,
      organizeAllWindows: false,
      theme: 'system',
      groups: [{ id: 'video', name: '视频', color: 'blue', enabled: true, rules: [{ id: 'youtube', pattern: 'youtube.com' }] }],
    });
    const update = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ id: 1, url: 'https://youtube.com/watch', windowId: 1 })),
        group: vi.fn(async () => 1),
        query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', windowId: 1 }]),
      },
      tabGroups: {
        query: vi.fn(async () => []),
        update,
      },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(1);

    expect(update).not.toHaveBeenCalledWith(1, { collapsed: true });
  });

  it('removes non-matching tabs from existing groups', async () => {
    const ungroup = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ id: 1, url: 'https://example.com', windowId: 1 })),
        group: vi.fn(),
        query: vi.fn(async () => [{ id: 1, url: 'https://example.com', windowId: 1, groupId: 3 }]),
        ungroup,
      },
      tabGroups: {
        query: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
      },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(1);

    expect(ungroup).toHaveBeenCalledWith(1);
  });

  it('collapses updated groups except the active tab group', async () => {
    mockedGetSettings.mockResolvedValue({
      enabled: true,
      collapseGroups: true,
      organizeAllWindows: false,
      theme: 'system',
      groups: [
        { id: 'video', name: '视频', color: 'blue', enabled: true, rules: [{ id: 'youtube', pattern: 'youtube.com' }] },
        { id: 'code', name: '代码', color: 'green', enabled: true, rules: [{ id: 'github', pattern: 'github.com' }] },
      ],
    });
    const update = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async (tabId: number) => ({ id: tabId, url: tabId === 1 ? 'https://youtube.com/watch' : 'https://github.com/openai', windowId: 1, groupId: -1 })),
        group: vi.fn(async (options: chrome.tabs.GroupOptions) => options.groupId),
        query: vi.fn(async (queryInfo: chrome.tabs.QueryInfo) => queryInfo.active ? [
          { id: 1, url: 'https://youtube.com/watch', windowId: 1, active: true, groupId: 1 },
        ] : [
          { id: 1, url: 'https://youtube.com/watch', windowId: 1, active: true, groupId: -1 },
          { id: 2, url: 'https://github.com/openai', windowId: 1, groupId: -1 },
        ]),
      },
      tabGroups: {
        query: vi.fn(async () => [{ id: 1, title: '视频' }, { id: 2, title: '代码' }]),
        update,
      },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(2);

    expect(update).toHaveBeenCalledWith(2, { collapsed: true });
    expect(update).not.toHaveBeenCalledWith(1, { collapsed: true });
  });

  it('collapses every other group when automatic grouping moves a background tab', async () => {
    const update = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ id: 1, url: 'https://youtube.com/watch', windowId: 1, groupId: -1 })),
        group: vi.fn(async () => 1),
        query: vi.fn(async () => [{ id: 2, windowId: 1, active: true, groupId: 2 }]),
      },
      tabGroups: {
        query: vi.fn(async () => [{ id: 1, title: '视频' }, { id: 2, title: '代码' }, { id: 3, title: '其他', collapsed: true }]),
        update,
      },
    });

    await expect(groupTab(1)).resolves.toBe(true);

    expect(update).toHaveBeenCalledWith(1, { collapsed: true });
    expect(update).not.toHaveBeenCalledWith(2, { collapsed: true });
  });

  it('keeps the focused tab group expanded after automatic grouping', async () => {
    const update = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ id: 1, url: 'https://youtube.com/watch', windowId: 1, groupId: -1 })),
        group: vi.fn(async () => 1),
        query: vi.fn(async () => [{ id: 1, windowId: 1, active: true, groupId: 1 }]),
      },
      tabGroups: {
        query: vi.fn(async () => [{ id: 1, title: '视频' }, { id: 2, title: '代码' }]),
        update,
      },
    });

    await expect(groupTab(1)).resolves.toBe(true);

    expect(update).toHaveBeenCalledWith(2, { collapsed: true });
    expect(update).not.toHaveBeenCalledWith(1, { collapsed: true });
  });

  it('collapses groups only after a tab changes group membership', async () => {
    const update = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ id: 1, url: 'https://youtube.com/watch', windowId: 1, groupId: 1 })),
        group: vi.fn(async (options: chrome.tabs.GroupOptions) => options.groupId),
        query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', windowId: 1, groupId: 1 }]),
      },
      tabGroups: {
        query: vi.fn(async () => [{ id: 1, title: '视频' }]),
        update,
      },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(1);

    expect(update).not.toHaveBeenCalledWith(1, { collapsed: true });
  });

  it('organizes accessible tabs across all windows', async () => {
    const group = vi.fn(async (options: chrome.tabs.GroupOptions) => 'createProperties' in options ? 1 : options.groupId);
    const query = vi.fn(async () => [
      { id: 1, url: 'https://youtube.com/watch', windowId: 1 },
      { id: 2, url: 'https://youtube.com/watch', windowId: 2, incognito: true },
    ]);

    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async (tabId: number) => ({ id: tabId, url: 'https://youtube.com/watch', windowId: 1 })),
        group,
        query,
      },
      tabGroups: {
        query: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
      },
    });

    await expect(organizeAllWindows()).resolves.toBe(1);

    expect(query).toHaveBeenCalledWith({});
    expect(group).toHaveBeenCalledTimes(1);
  });

  it('syncs a browser group rename to the matching rule and other windows', async () => {
    const update = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', groupId: 1 }]),
      },
      tabGroups: {
        query: vi.fn(async () => [{ id: 1, title: '社区' }, { id: 2, title: '视频' }]),
        update,
      },
    });

    await expect(syncGroupName(1, '社区')).resolves.toBe(true);

    expect(mockedSaveSettings).toHaveBeenCalledWith(expect.objectContaining({
      groups: [expect.objectContaining({ id: 'video', name: '社区' })],
    }));
    expect(update).toHaveBeenCalledWith(2, { title: '社区' });
  });

  it('ignores browser group names that duplicate another rule', async () => {
    mockedGetSettings.mockResolvedValue({
      enabled: true,
      collapseGroups: true,
      organizeAllWindows: false,
      theme: 'system',
      groups: [
        { id: 'video', name: '视频', color: 'blue', enabled: true, rules: [{ id: 'youtube', pattern: 'youtube.com' }] },
        { id: 'code', name: '社区', color: 'green', enabled: true, rules: [{ id: 'github', pattern: 'github.com' }] },
      ],
    });
    const update = vi.fn(async () => undefined);

    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', groupId: 1 }]) },
      tabGroups: { query: vi.fn(async () => []), update },
    });

    await expect(syncGroupName(1, '社区')).resolves.toBe(false);

    expect(mockedSaveSettings).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
