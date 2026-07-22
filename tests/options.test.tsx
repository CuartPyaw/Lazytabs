// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OptionsApp } from '../entrypoints/options/OptionsApp';

const storedSettings = {
  enabled: true,
  collapseGroups: true,
  organizeAllWindows: false,
  theme: 'system' as const,
  groups: [{
    id: 'video', name: '视频', color: 'blue' as const, enabled: true,
    rules: [{ id: 'youtube', name: '视频站点', conditions: [{ id: 'youtube-host', field: 'hostname' as const, operator: 'contains' as const, value: 'youtube.com' }] }],
  }],
};

const storageSet = vi.fn();
const storageGet = vi.fn();
const storageChanged = { addListener: vi.fn(), removeListener: vi.fn() };

beforeEach(() => {
  storageSet.mockReset();
  storageGet.mockReset();
  storageGet.mockResolvedValue({ settings: storedSettings });
  storageChanged.addListener.mockReset();
  storageChanged.removeListener.mockReset();
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: storageGet, set: storageSet.mockResolvedValue(undefined) },
      onChanged: storageChanged,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OptionsApp interactions', () => {
  it('persists the selected theme', async () => {
    render(<OptionsApp />);
    fireEvent.click(await screen.findByRole('button', { name: '外观' }));
    fireEvent.click(await screen.findByRole('radio', { name: '深色' }));
    await waitFor(() => expect(storageSet).toHaveBeenCalledWith({ settings: { ...storedSettings, theme: 'dark' } }));
  });

  it('opens a group editor with nested matching rules', async () => {
    render(<OptionsApp />);
    expect(await screen.findAllByText('视频', { exact: true })).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: '添加分组' }));

    expect(screen.getByRole('dialog', { name: '添加分组' })).toBeTruthy();
    expect(screen.getByLabelText('分组名称')).toBeTruthy();
    expect(screen.getByLabelText('分组颜色').tagName).toBe('BUTTON');
    expect(screen.queryByLabelText('规则名称')).toBeNull();
    expect(screen.getByLabelText('规则 1 匹配字段').textContent).toContain('域名部分');
    expect(screen.queryByRole('button', { name: '为第 1 条规则添加条件' })).toBeNull();
    expect(screen.getByRole('button', { name: '添加匹配规则' })).toBeTruthy();
  });

  it('creates one group with multiple contained rules', async () => {
    render(<OptionsApp />);
    fireEvent.click(await screen.findByRole('button', { name: '添加分组' }));
    fireEvent.change(screen.getByLabelText('分组名称'), { target: { value: '代码' } });
    fireEvent.change(screen.getByLabelText('规则 1 匹配值'), { target: { value: 'github' } });
    fireEvent.click(screen.getByRole('button', { name: '添加匹配规则' }));
    fireEvent.change(screen.getByLabelText('规则 2 匹配值'), { target: { value: 'gitlab' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(storageSet).toHaveBeenCalledWith({
      settings: {
        ...storedSettings,
        groups: [
          ...storedSettings.groups,
          {
            id: expect.any(String), name: '代码', color: 'auto', enabled: true,
            rules: [
              { id: expect.any(String), name: 'github', conditions: [{ id: expect.any(String), field: 'hostname', operator: 'contains', value: 'github' }] },
              { id: expect.any(String), name: 'gitlab', conditions: [{ id: expect.any(String), field: 'hostname', operator: 'contains', value: 'gitlab' }] },
            ],
          },
        ],
      },
    }));
  });

  it('replaces settings only after confirming a valid import', async () => {
    const importedSettings = { ...storedSettings, theme: 'dark' as const, groups: [] };
    render(<OptionsApp />);
    fireEvent.click(await screen.findByRole('button', { name: '通用' }));
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File([JSON.stringify(importedSettings)], 'lazytabs.json', { type: 'application/json' })] } });

    expect(await screen.findByRole('dialog', { name: '导入数据' })).toBeTruthy();
    expect(storageSet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(storageSet).toHaveBeenCalledWith({ settings: importedSettings }));
  });
});
