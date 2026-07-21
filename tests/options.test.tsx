// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OptionsApp } from '../entrypoints/options/OptionsApp';

const storedSettings = {
  enabled: true,
  collapseGroups: true,
  organizeAllWindows: false,
  theme: 'system' as const,
  rules: [{
    id: 'youtube',
    name: '视频站点',
    groupName: '视频',
    color: 'blue' as const,
    enabled: true,
    conditions: [{ id: 'youtube-host', field: 'hostname' as const, operator: 'contains' as const, value: 'youtube.com' }],
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

  it('opens the screenshot-style rule editor', async () => {
    render(<OptionsApp />);

    fireEvent.click(await screen.findByRole('button', { name: '添加规则' }));

    expect(screen.getByRole('dialog', { name: '添加规则' })).toBeTruthy();
    expect(screen.getByLabelText('规则名称')).toBeTruthy();
    expect(screen.getByLabelText('分组名称')).toBeTruthy();
    expect((screen.getByLabelText('分组颜色') as HTMLSelectElement).value).toBe('auto');
    expect((screen.getByLabelText('匹配字段') as HTMLSelectElement).value).toBe('hostname');
    expect((screen.getByLabelText('匹配方式') as HTMLSelectElement).value).toBe('contains');
  });

  it('creates a rule with multiple matching conditions', async () => {
    render(<OptionsApp />);

    fireEvent.click(await screen.findByRole('button', { name: '添加规则' }));
    fireEvent.change(screen.getByLabelText('规则名称'), { target: { value: '代码托管' } });
    fireEvent.change(screen.getByLabelText('分组名称'), { target: { value: '代码' } });
    fireEvent.change(screen.getByLabelText('匹配值'), { target: { value: 'github' } });
    fireEvent.click(screen.getByRole('button', { name: '添加匹配规则' }));
    fireEvent.change(screen.getAllByLabelText('匹配值')[1], { target: { value: 'gitlab' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(storageSet).toHaveBeenCalledWith({
      settings: {
        ...storedSettings,
        rules: [
          ...storedSettings.rules,
          {
            id: expect.any(String),
            name: '代码托管',
            groupName: '代码',
            color: 'auto',
            enabled: true,
            conditions: [
              { id: expect.any(String), field: 'hostname', operator: 'contains', value: 'github' },
              { id: expect.any(String), field: 'hostname', operator: 'contains', value: 'gitlab' },
            ],
          },
        ],
      },
    }));
  });

  it('rejects a potentially conflicting rule before it is persisted', async () => {
    render(<OptionsApp />);

    fireEvent.click(await screen.findByRole('button', { name: '添加规则' }));
    fireEvent.change(screen.getByLabelText('规则名称'), { target: { value: '工作 API' } });
    fireEvent.change(screen.getByLabelText('分组名称'), { target: { value: '工作' } });
    fireEvent.change(screen.getByLabelText('匹配值'), { target: { value: 'youtube' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('规则冲突：可能会与“视频站点”同时匹配。')).toBeTruthy();
    expect(storageSet).not.toHaveBeenCalled();
  });
});
