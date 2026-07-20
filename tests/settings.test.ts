import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSettings } from '../src/lib/settings';

describe('settings', () => {
  const get = vi.fn();

  beforeEach(() => {
    get.mockReset();
    vi.stubGlobal('chrome', { storage: { local: { get } } });
  });

  it('migrates saved rules into groups', async () => {
    get.mockResolvedValue({
      settings: {
        enabled: true,
        rules: [
          { id: 'github', pattern: 'github.com', groupName: '代码', color: 'blue', enabled: true },
          { id: 'gitlab', pattern: 'gitlab.com', groupName: '代码', color: 'blue', enabled: true },
        ],
      },
    });

    await expect(getSettings()).resolves.toEqual({
      enabled: true,
      collapseGroups: true,
      organizeAllWindows: false,
      theme: 'system',
      groups: [{
        id: 'github',
        name: '代码',
        color: 'blue',
        enabled: true,
        rules: [
          { id: 'github', pattern: 'github.com' },
          { id: 'gitlab', pattern: 'gitlab.com' },
        ],
      }],
    });
  });
});
