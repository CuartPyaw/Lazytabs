// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardApp } from '../entrypoints/dashboard/DashboardApp';

const snapshot = {
  windows: [{
    id: 1,
    focused: true,
    state: 'normal',
    tabs: [
      { id: 10, windowId: 1, active: true, pinned: false, title: 'GitHub', url: 'https://github.com', favIconUrl: '', restorable: true },
      { id: 11, windowId: 1, active: false, pinned: true, title: '固定页', url: 'chrome://extensions', favIconUrl: '', restorable: false },
    ],
  }],
  savedTabGroups: [{ id: 'group-1', name: '窗口 1', createdAt: 1, tabs: [{ id: 'saved-1', title: '文档', url: 'https://example.com/docs' }] }],
  settings: { retainRestoredGroups: false },
};

const sendMessage = vi.fn();
const messageListeners = new Set<(message: { type?: string }) => void>();
const storageChangedListeners = new Set<(changes: { settings?: chrome.storage.StorageChange }, areaName: string) => void>();
const storedSettings = { theme: 'dark', groups: [] };

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'get-snapshot' ? snapshot : {});
  storedSettings.theme = 'dark';
  messageListeners.clear();
  storageChangedListeners.clear();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (listener: (message: { type?: string }) => void) => messageListeners.add(listener),
        removeListener: (listener: (message: { type?: string }) => void) => messageListeners.delete(listener),
      },
    },
    storage: {
      local: { get: vi.fn(async () => ({ settings: storedSettings })) },
      onChanged: {
        addListener: (listener: (changes: { settings?: chrome.storage.StorageChange }, areaName: string) => void) => storageChangedListeners.add(listener),
        removeListener: (listener: (changes: { settings?: chrome.storage.StorageChange }, areaName: string) => void) => storageChangedListeners.delete(listener),
      },
    },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('DashboardApp', () => {
  it('keeps the current and saved tab columns shrinkable', async () => {
    render(<DashboardApp />);

    expect(screen.getByRole('region', { name: '当前标签' }).classList.contains('min-w-0')).toBe(true);
    expect(screen.getByRole('region', { name: '已收纳组' }).classList.contains('min-w-0')).toBe(true);
  });

  it('follows the configured appearance theme', async () => {
    render(<DashboardApp />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    storedSettings.theme = 'light';
    storageChangedListeners.forEach((listener) => listener({ settings: { newValue: storedSettings } }, 'local'));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('saves selected restorable tabs while allowing fixed tabs to be selected for closing', async () => {
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '选择 GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: '收纳选中 (1)' }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', windowId: 1, tabIds: [10] }));
    expect(screen.getByRole('button', { name: '选择 固定页' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('固定标签，无法收纳')).toBeTruthy();
  });

  it('confirms before closing selected tabs', async () => {
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '选择 GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭选中' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认关闭' }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'close-tabs', tabIds: [10] }));
  });

  it('shows background message errors', async () => {
    sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'restore-group' ? { error: '无法恢复' } : snapshot);
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '恢复 窗口 1' }));

    expect(await screen.findByText('无法恢复')).toBeTruthy();
  });
});
