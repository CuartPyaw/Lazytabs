// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardApp } from '../entrypoints/dashboard/DashboardApp';

const snapshot = {
  windows: [{
    id: 1,
    focused: true,
    state: 'normal',
    groups: [{ id: 7, title: '工作', color: 'blue' }],
    tabs: [
      { id: 10, windowId: 1, groupId: 7, active: true, pinned: false, title: 'GitHub', url: 'https://github.com', favIconUrl: '', restorable: true },
      { id: 11, windowId: 1, groupId: -1, active: false, pinned: true, title: '固定页', url: 'chrome://extensions', favIconUrl: '', restorable: false },
    ],
  }],
  savedTabGroups: [{ id: 'group-1', name: '窗口 1', createdAt: 1, tabs: [{ id: 'saved-1', title: '文档', url: 'https://example.com/docs' }] }],
  settings: { retainRestoredGroups: false },
};

const secondWindow = {
  id: 2,
  focused: false,
  state: 'normal',
  groups: [],
  tabs: [{ id: 20, windowId: 2, groupId: -1, active: true, pinned: false, title: 'GitLab', url: 'https://gitlab.com', favIconUrl: '', restorable: true }],
};

const sendMessage = vi.fn();
const messageListeners = new Set<(message: { type?: string }) => void>();
const storageChangedListeners = new Set<(changes: { settings?: chrome.storage.StorageChange }, areaName: string) => void>();
const storedSettings = { theme: 'dark', groups: [] };
let activeSnapshot = snapshot;

beforeEach(() => {
  sendMessage.mockReset();
  activeSnapshot = snapshot;
  sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'get-snapshot' ? activeSnapshot : {});
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
  it('groups current tabs by browser group title and color', async () => {
    render(<DashboardApp />);

    expect(await screen.findByText('工作')).toBeTruthy();
    expect(screen.getByText('1 个标签')).toBeTruthy();
    expect(screen.queryByText('1 个标签 · normal')).toBeNull();
    expect(screen.getByText('工作').previousElementSibling?.className).toContain('bg-blue-400');
  });

  it('renders only the focused window and archives a dragged tab into an existing group', async () => {
    activeSnapshot = { ...snapshot, windows: [...snapshot.windows, secondWindow] };
    render(<DashboardApp />);

    expect(await screen.findByText('GitHub')).toBeTruthy();
    expect(screen.queryByText('GitLab')).toBeNull();

    activeSnapshot = {
      ...activeSnapshot,
      windows: activeSnapshot.windows.map((window) => ({ ...window, focused: window.id === 2 })),
    };
    messageListeners.forEach((listener) => listener({ type: 'snapshot-changed' }));

    await waitFor(() => {
      expect(screen.getByText('GitLab')).toBeTruthy();
      expect(screen.queryByText('GitHub')).toBeNull();
    });

    const tabRow = screen.getByText('GitLab').closest('.tab-row');
    expect(tabRow).toBeTruthy();
    fireEvent.dragStart(tabRow!);
    fireEvent.drop(screen.getByRole('region', { name: '收纳组 窗口 1' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', groupId: 'group-1', windowId: 2, tabIds: [20] }));
  });

  it('removes selection actions and keeps fixed tabs out of drag archiving', async () => {
    render(<DashboardApp />);

    expect(await screen.findByText('GitHub')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /收纳选中/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '关闭选中' })).toBeNull();
    expect(screen.getByText('GitHub').closest('.tab-row')?.getAttribute('draggable')).toBe('true');
    expect(screen.getByText('固定页').closest('.tab-row')?.getAttribute('draggable')).toBe('false');
  });

  it('keeps dashboard columns and cards within their grid tracks', async () => {
    render(<DashboardApp />);

    const currentTabs = screen.getByRole('region', { name: '当前标签' });
    const savedGroups = screen.getByRole('region', { name: '已收纳组' });
    expect(currentTabs.classList.contains('flex')).toBe(true);
    expect(currentTabs.classList.contains('min-w-0')).toBe(true);
    expect(savedGroups.classList.contains('flex')).toBe(true);
    expect(savedGroups.classList.contains('min-w-0')).toBe(true);

    const saveWindowButton = await screen.findByRole('button', { name: '收纳窗口' });
    expect(saveWindowButton.textContent).toBe('');
    expect(saveWindowButton.classList.contains('absolute')).toBe(true);
    expect(saveWindowButton.classList.contains('right-4')).toBe(true);
    expect(saveWindowButton.classList.contains('top-4')).toBe(true);
    [currentTabs, savedGroups].forEach((section) => {
      const card = section.querySelector('[data-slot="card"]');
      expect(card?.classList.contains('w-full')).toBe(true);
      expect(card?.classList.contains('min-w-0')).toBe(true);
      expect(card?.classList.contains('overflow-hidden')).toBe(true);
    });
  });

  it('follows the configured appearance theme', async () => {
    render(<DashboardApp />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    storedSettings.theme = 'light';
    storageChangedListeners.forEach((listener) => listener({ settings: { newValue: storedSettings } }, 'local'));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('saves a dragged restorable tab while leaving fixed tabs undraggable', async () => {
    render(<DashboardApp />);

    const tabRow = (await screen.findByText('GitHub')).closest('.tab-row');
    expect(tabRow).toBeTruthy();
    fireEvent.dragStart(tabRow!);
    expect(screen.queryByText('收纳框')).toBeNull();
    fireEvent.drop(screen.getByRole('region', { name: '收纳组 窗口 1' }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', groupId: 'group-1', windowId: 1, tabIds: [10] }));
    expect(screen.getByText('固定页').closest('.tab-row')?.getAttribute('draggable')).toBe('false');
    expect(screen.getByText('固定标签，无法收纳')).toBeTruthy();
  });

  it('saves all restorable tabs in a browser group', async () => {
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '收纳分组 工作' }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', windowId: 1, tabIds: [10] }));
  });

  it('shows background message errors', async () => {
    sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'restore-group' ? { error: '无法恢复' } : snapshot);
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '恢复 窗口 1' }));

    expect(await screen.findByText('无法恢复')).toBeTruthy();
  });
});
