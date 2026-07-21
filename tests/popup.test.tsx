// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PopupApp } from '../entrypoints/popup/PopupApp';

const storedSettings = {
  enabled: true,
  collapseGroups: true,
  organizeAllWindows: false,
  theme: 'system' as const,
  rules: [{ id: 'youtube', name: '视频站点', groupName: '视频', color: 'blue' as const, enabled: true, conditions: [{ id: 'youtube-host', field: 'hostname' as const, operator: 'contains' as const, value: 'youtube.com' }] }],
};
const storageGet = vi.fn();
const storageSet = vi.fn();
const sendMessage = vi.fn();

beforeEach(() => {
  storageGet.mockReset();
  storageSet.mockReset();
  sendMessage.mockReset();
  storageGet.mockResolvedValue({ settings: storedSettings });
  storageSet.mockResolvedValue(undefined);
  sendMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === 'popup-state') return { enabled: true, ruleCount: 1, tabCount: 3 };
    if (message.type === 'organize-current-window') return { grouped: 1 };
  });
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      openOptionsPage: vi.fn(),
    },
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PopupApp', () => {
  it('persists automatic grouping state from its switch', async () => {
    render(<PopupApp />);

    fireEvent.click(await screen.findByRole('switch', { name: '自动分组' }));

    await waitFor(() => {
      expect(storageSet).toHaveBeenCalledWith({ settings: { ...storedSettings, enabled: false } });
    });
  });

  it('keeps manual organization available when automatic grouping is disabled', async () => {
    sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === 'popup-state') return { enabled: false, ruleCount: 1, tabCount: 3 };
      if (message.type === 'organize-current-window') return { grouped: 1 };
    });
    render(<PopupApp />);

    fireEvent.click(await screen.findByRole('button', { name: '整理标签页' }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'organize-current-window' });
    });
  });

  it('shows a paused icon when automatic grouping is disabled', async () => {
    sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === 'popup-state') return { enabled: false, ruleCount: 1, tabCount: 3 };
    });
    render(<PopupApp />);

    expect(await screen.findByLabelText('自动分组已暂停')).toBeTruthy();
    expect(document.querySelector('.lucide-circle-pause')).toBeTruthy();
  });

  it('restores the switch and reports an error when saving fails', async () => {
    storageSet.mockRejectedValue(new Error('storage unavailable'));
    render(<PopupApp />);

    fireEvent.click(await screen.findByRole('switch', { name: '自动分组' }));

    await waitFor(() => {
      expect(screen.getByText('更新失败，请重试。')).toBeTruthy();
    });
  });
});
