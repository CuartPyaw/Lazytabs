import { beforeEach, describe, expect, it, vi } from 'vitest';

import { groupTab, organizeAllWindows, organizeCurrentWindow, syncGroup, syncGroupName } from '../src/lib/tab-groups';
import type { Group } from '../src/lib/rules';
import { getSettings, saveSettings, type Settings } from '../src/lib/settings';

vi.mock('../src/lib/settings', () => ({ getSettings: vi.fn(), saveSettings: vi.fn() }));

const mockedGetSettings = vi.mocked(getSettings);
const mockedSaveSettings = vi.mocked(saveSettings);
const youtubeGroup: Group = {
  id: 'video', name: '视频', color: 'blue' as const, enabled: true,
  rules: [{ id: 'youtube', name: '视频站点', conditions: [{ id: 'youtube-host', field: 'hostname' as const, operator: 'contains' as const, value: 'youtube.com' }] }],
};

function settings(groups = [youtubeGroup], enabled = true): Settings {
  return { enabled, collapseGroups: true, organizeAllWindows: false, theme: 'system', groups };
}

describe('tab groups', () => {
  beforeEach(() => {
    mockedSaveSettings.mockClear();
    mockedSaveSettings.mockResolvedValue(undefined);
    mockedGetSettings.mockResolvedValue(settings());
  });

  it('creates one group for concurrent matching tabs', async () => {
    const group = vi.fn(async (options: chrome.tabs.GroupOptions) => 'createProperties' in options ? 1 : options.groupId);
    vi.stubGlobal('chrome', {
      tabs: { get: vi.fn(async (tabId: number) => ({ id: tabId, url: 'https://youtube.com/watch', windowId: 1 })), group, query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', windowId: 1 }, { id: 2, url: 'https://youtube.com/watch', windowId: 1 }]) },
      tabGroups: { query: vi.fn(async () => []), update: vi.fn(async () => undefined) },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(2);
    expect(group).toHaveBeenCalledWith({ createProperties: { windowId: 1 }, tabIds: [1] });
    expect(group).toHaveBeenCalledWith({ groupId: 1, tabIds: [2] });
  });

  it('continues organizing when one tab cannot be grouped', async () => {
    const codeGroup = { id: 'code', name: '代码', color: 'green' as const, enabled: true, rules: [{ id: 'github', name: '代码托管', conditions: [{ id: 'github-host', field: 'hostname' as const, operator: 'contains' as const, value: 'github.com' }] }] };
    mockedGetSettings.mockResolvedValue(settings([youtubeGroup, codeGroup]));
    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async (tabId: number) => ({ id: tabId, url: tabId === 1 ? 'https://youtube.com/watch' : 'https://github.com/openai', windowId: 1 })),
        group: vi.fn(async (options: chrome.tabs.GroupOptions) => { if ('createProperties' in options && Array.isArray(options.tabIds) && options.tabIds[0] === 1) throw new Error('tab closed'); return 2; }),
        query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', windowId: 1 }, { id: 2, url: 'https://github.com/openai', windowId: 1 }]),
      },
      tabGroups: { query: vi.fn(async () => []), update: vi.fn(async () => undefined) },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(1);
  });

  it('keeps manual organization available when automatic grouping is disabled', async () => {
    mockedGetSettings.mockResolvedValue(settings([youtubeGroup], false));
    vi.stubGlobal('chrome', {
      tabs: { get: vi.fn(async () => ({ id: 1, url: 'https://youtube.com/watch', windowId: 1 })), group: vi.fn(async () => 1), query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', windowId: 1 }]) },
      tabGroups: { query: vi.fn(async () => []), update: vi.fn(async () => undefined) },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(1);
  });

  it('removes non-matching tabs from existing groups', async () => {
    const ungroup = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      tabs: { get: vi.fn(async () => ({ id: 1, url: 'https://example.com', windowId: 1 })), group: vi.fn(), query: vi.fn(async () => [{ id: 1, url: 'https://example.com', windowId: 1, groupId: 3 }]), ungroup },
      tabGroups: { query: vi.fn(async () => []), update: vi.fn(async () => undefined) },
    });

    await expect(organizeCurrentWindow()).resolves.toBe(1);
    expect(ungroup).toHaveBeenCalledWith(1);
  });

  it('collapses every group except destination groups', async () => {
    const update = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async (id: number) => ({ id, url: id === 1 ? 'https://youtube.com' : 'https://example.com', windowId: 1, groupId: -1 })),
        group: vi.fn(async () => 1),
        query: vi.fn(async (query: chrome.tabs.QueryInfo) => query.active ? [{ id: 1, active: true, groupId: 1, windowId: 1 }] : [{ id: 1, url: 'https://youtube.com', windowId: 1, groupId: -1 }]),
      },
      tabGroups: { query: vi.fn(async () => [{ id: 1, title: '视频' }, { id: 2, title: '其他' }]), update },
    });

    await groupTab(1);
    expect(update).toHaveBeenCalledWith(2, { collapsed: true });
  });

  it('organizes accessible tabs across all windows', async () => {
    const group = vi.fn(async (options: chrome.tabs.GroupOptions) => 'createProperties' in options ? 1 : options.groupId);
    const query = vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', windowId: 1 }, { id: 2, url: 'https://youtube.com/watch', windowId: 2, incognito: true }]);
    vi.stubGlobal('chrome', {
      tabs: { get: vi.fn(async () => ({ id: 1, url: 'https://youtube.com/watch', windowId: 1 })), group, query },
      tabGroups: { query: vi.fn(async () => []), update: vi.fn(async () => undefined) },
    });

    await expect(organizeAllWindows()).resolves.toBe(1);
    expect(query).toHaveBeenCalledWith({});
  });

  it('syncs a browser group rename to the matching group and other windows', async () => {
    const update = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 1, url: 'https://youtube.com/watch', groupId: 1 }]) },
      tabGroups: { query: vi.fn(async () => [{ id: 1, title: '社区' }, { id: 2, title: '视频' }]), update },
    });

    await expect(syncGroupName(1, '社区')).resolves.toBe(true);
    expect(mockedSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ groups: [expect.objectContaining({ id: 'video', name: '社区' })] }));
    expect(update).toHaveBeenCalledWith(2, { title: '社区' });
  });

  it('syncs a settings color change to all matching browser groups', async () => {
    const update = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', { tabGroups: { query: vi.fn(async () => [{ id: 1, title: '视频' }, { id: 2, title: '视频' }, { id: 3, title: '其他' }]), update } });

    await syncGroup(youtubeGroup, { ...youtubeGroup, color: 'red' });
    expect(update).toHaveBeenCalledWith(1, { color: 'red', title: '视频' });
    expect(update).toHaveBeenCalledWith(2, { color: 'red', title: '视频' });
    expect(update).not.toHaveBeenCalledWith(3, expect.anything());
  });
});
