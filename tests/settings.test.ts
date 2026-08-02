import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSettings, parseImportedSettings, type Settings } from '../src/lib/settings';

describe('settings', () => {
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    get.mockReset();
    set.mockReset();
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
  });

  it('drops legacy saved tab groups and cleans them from storage', async () => {
    get.mockResolvedValue({ settings: {
      enabled: true, collapseGroups: true, organizeAllWindows: false, theme: 'system', groups: [],
      savedTabGroups: [{ id: 'saved-group', name: '默认收纳组', createdAt: 1, tabs: [] }],
    } });

    await expect(getSettings()).resolves.toEqual({
      enabled: true, collapseGroups: true, organizeAllWindows: false, theme: 'system', groups: [],
    });
    expect(set).toHaveBeenCalledWith({ settings: {
      enabled: true, collapseGroups: true, organizeAllWindows: false, theme: 'system', groups: [],
    } });
  });

  it('migrates saved legacy groups into top-level groups', async () => {
    get.mockResolvedValue({ settings: { enabled: true, groups: [{ id: 'code', name: '代码', color: 'blue', enabled: true, rules: [{ id: 'github', pattern: 'github.com' }, { id: 'github-subdomain', pattern: '*.github.com' }] }] } });

    await expect(getSettings()).resolves.toEqual({
      enabled: true, collapseGroups: true, organizeAllWindows: false, theme: 'system',
      groups: [{
        id: 'code', name: '代码', color: 'blue', enabled: true,
        rules: [
          { id: 'github', name: 'github.com', conditions: [{ id: 'github', field: 'hostname', operator: 'equals', value: 'github.com' }] },
          { id: 'github-subdomain', name: '*.github.com', conditions: [{ id: 'github-subdomain', field: 'hostname', operator: 'regex', value: '^[^.]+\\.github\\.com$' }] },
        ],
      }],
    });
  });

  it('merges current flat rules with the same group name', async () => {
    get.mockResolvedValue({ settings: { rules: [
      { id: 'youtube', name: '视频站点', groupName: '视频', color: 'blue', enabled: true, conditions: [{ id: 'youtube-host', field: 'hostname', operator: 'contains', value: 'youtube.com' }] },
      { id: 'bilibili', name: '哔哩哔哩', groupName: '视频', color: 'red', enabled: false, conditions: [{ id: 'bilibili-host', field: 'hostname', operator: 'contains', value: 'bilibili.com' }] },
    ] } });

    await expect(getSettings()).resolves.toMatchObject({
      groups: [{ id: 'youtube', name: '视频', color: 'blue', enabled: true, rules: [{ id: 'youtube' }, { id: 'bilibili' }] }],
    });
  });

  it('migrates older pattern rules without losing their group', async () => {
    get.mockResolvedValue({ settings: { rules: [{ id: 'github', pattern: 'github.com', groupName: '代码', color: 'green', enabled: true }] } });

    await expect(getSettings()).resolves.toMatchObject({
      groups: [{ id: 'github', name: '代码', color: 'green', enabled: true, rules: [{ id: 'github', name: 'github.com' }] }],
    });
  });

  it('accepts complete imported settings and rejects invalid configurations', () => {
    const settings: Settings = {
      enabled: true, collapseGroups: true, organizeAllWindows: false, theme: 'system',
      groups: [{ id: 'video', name: '视频', color: 'auto', enabled: true, rules: [{ id: 'youtube', name: '视频站点', conditions: [{ id: 'youtube-host', field: 'hostname', operator: 'contains', value: 'youtube.com' }] }] }],
    };

    expect(parseImportedSettings(settings)).toEqual(settings);
    expect(parseImportedSettings({ ...settings, groups: [{ ...settings.groups[0], rules: [] }] })).toBeUndefined();
    expect(parseImportedSettings({ ...settings, theme: 'violet' })).toBeUndefined();
  });
});
