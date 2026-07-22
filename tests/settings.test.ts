import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSettings } from '../src/lib/settings';

describe('settings', () => {
  const get = vi.fn();

  beforeEach(() => {
    get.mockReset();
    vi.stubGlobal('chrome', { storage: { local: { get } } });
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
});
