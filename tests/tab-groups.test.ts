import { beforeEach, describe, expect, it, vi } from 'vitest';

import { organizeCurrentWindow } from '../src/lib/tab-groups';
import { getSettings } from '../src/lib/settings';

vi.mock('../src/lib/settings', () => ({ getSettings: vi.fn() }));

const mockedGetSettings = vi.mocked(getSettings);

describe('tab groups', () => {
  beforeEach(() => {
    mockedGetSettings.mockResolvedValue({
      enabled: true,
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
});
