// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OptionsApp } from '../entrypoints/options/OptionsApp';

const storedSettings = {
  enabled: true,
  groups: [
    {
      id: 'video',
      name: '视频',
      color: 'blue' as const,
      enabled: true,
      rules: [{ id: 'youtube', pattern: 'youtube.com' }],
    },
  ],
};

const storageSet = vi.fn();
const storageGet = vi.fn();
const storageChanged = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};
let onStorageChanged: ((changes: { settings?: chrome.storage.StorageChange }, areaName: string) => void) | undefined;

beforeEach(() => {
  storageSet.mockReset();
  storageGet.mockReset();
  storageGet.mockResolvedValue({ settings: storedSettings });
  storageChanged.addListener.mockReset();
  storageChanged.removeListener.mockReset();
  storageChanged.addListener.mockImplementation((listener) => {
    onStorageChanged = listener;
  });
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: storageGet,
        set: storageSet.mockResolvedValue(undefined),
      },
      onChanged: storageChanged,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OptionsApp interactions', () => {
  it('opens the group editor when the add button is clicked', async () => {
    render(<OptionsApp />);

    const addButton = await screen.findByRole('button', { name: '添加分组' });
    fireEvent.click(addButton);

    expect(screen.getByLabelText('分组名称：')).toBeTruthy();
  });

  it('preserves the latest automatic grouping state when a group is saved', async () => {
    render(<OptionsApp />);

    await screen.findByRole('button', { name: '添加分组' });
    storageGet.mockResolvedValue({ settings: { ...storedSettings, enabled: false } });
    onStorageChanged?.({ settings: { newValue: { ...storedSettings, enabled: false } } }, 'local');
    fireEvent.click(screen.getByRole('switch', { name: '启用 视频' }));

    await waitFor(() => {
      expect(storageSet).toHaveBeenCalledWith({
        settings: {
          ...storedSettings,
          enabled: false,
          groups: [{ ...storedSettings.groups[0], enabled: false }],
        },
      });
    });
  });

  it('persists a group enabled state when its switch is clicked', async () => {
    render(<OptionsApp />);

    const toggle = await screen.findByRole('switch', { name: '启用 视频' });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(storageSet).toHaveBeenCalledWith({
        settings: {
          ...storedSettings,
          groups: [{ ...storedSettings.groups[0], enabled: false }],
        },
      });
    });
  });

  it('opens, cancels, and reopens the editor from action buttons', async () => {
    render(<OptionsApp />);

    fireEvent.click(await screen.findByRole('button', { name: '编辑 视频' }));
    expect(screen.getByDisplayValue('视频')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByDisplayValue('视频')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '添加分组' }));
    expect(screen.getByLabelText('分组名称：')).toBeTruthy();
  });

  it('deletes a group and persists the result', async () => {
    render(<OptionsApp />);

    fireEvent.click(await screen.findByRole('button', { name: '删除 视频' }));

    await waitFor(() => {
      expect(storageSet).toHaveBeenCalledWith({
        settings: { ...storedSettings, groups: [] },
      });
    });
    expect(screen.queryByText('youtube.com')).toBeNull();
  });

  it('creates a group with a domain rule and persists it', async () => {
    render(<OptionsApp />);

    fireEvent.click(await screen.findByRole('button', { name: '添加分组' }));
    fireEvent.change(screen.getByLabelText('分组名称：'), { target: { value: '工作' } });
    fireEvent.click(screen.getByRole('button', { name: '添加域名规则' }));
    const ruleInput = screen.getByRole('textbox', { name: '添加域名规则' });
    fireEvent.change(ruleInput, { target: { value: 'example.com' } });
    fireEvent.keyDown(ruleInput, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: '保存分组' }));

    await waitFor(() => {
      expect(storageSet).toHaveBeenCalledWith({
        settings: {
          ...storedSettings,
          groups: [
            ...storedSettings.groups,
            {
              id: expect.any(String),
              name: '工作',
              color: 'blue',
              enabled: true,
              rules: [{ id: expect.any(String), pattern: 'example.com' }],
            },
          ],
        },
      });
    });
  });
});
