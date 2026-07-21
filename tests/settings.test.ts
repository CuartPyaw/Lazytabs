import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSettings } from '../src/lib/settings';

describe('settings', () => {
  const get = vi.fn();

  beforeEach(() => {
    get.mockReset();
    vi.stubGlobal('chrome', { storage: { local: { get } } });
  });

  it('migrates saved groups into independent rules without changing their matching behavior', async () => {
    get.mockResolvedValue({
      settings: {
        enabled: true,
        groups: [{
          id: 'code',
          name: '代码',
          color: 'blue',
          enabled: true,
          rules: [
            { id: 'github', pattern: 'github.com' },
            { id: 'github-subdomain', pattern: '*.github.com' },
          ],
        }],
      },
    });

    await expect(getSettings()).resolves.toEqual({
      enabled: true,
      collapseGroups: true,
      organizeAllWindows: false,
      theme: 'system',
      rules: [
        {
          id: 'github',
          name: 'github.com',
          groupName: '代码',
          color: 'blue',
          enabled: true,
          conditions: [{ id: 'github', field: 'hostname', operator: 'equals', value: 'github.com' }],
        },
        {
          id: 'github-subdomain',
          name: '*.github.com',
          groupName: '代码',
          color: 'blue',
          enabled: true,
          conditions: [{ id: 'github-subdomain', field: 'hostname', operator: 'regex', value: '^[^.]+\\.github\\.com$' }],
        },
      ],
    });
  });
});
