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
  savedTabGroups: [{ id: 'group-1', name: '窗口 1', createdAt: 1, tabs: [], groups: [{ id: 'day-1', name: '2026-08-02', kind: 'day' as const, createdAt: 1, tabs: [{ id: 'saved-1', title: '文档', url: 'https://example.com/docs' }] }] }],
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

  it('renders only the focused window and archives a clicked tab into an existing group', async () => {
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

    const tabButton = screen.getByText('GitLab').closest('button');
    expect(tabButton).toBeTruthy();
    fireEvent.click(tabButton!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', groupId: 'group-1', windowId: 2, tabIds: [20] }));
  });

  it('archives clicked webpages into the newest group while fixed tabs stay focused', async () => {
    render(<DashboardApp />);

    expect(await screen.findByText('GitHub')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /收纳选中/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '关闭选中' })).toBeNull();
    const tabButton = screen.getByText('GitHub').closest('button');
    const fixedTabButton = screen.getByText('固定页').closest('button');
    fireEvent.click(tabButton!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', groupId: 'group-1', windowId: 1, tabIds: [10] }));
    fireEvent.click(fixedTabButton!);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'focus-tab', tabId: 11 });
  });

  it('keeps dashboard columns and cards within their grid tracks', async () => {
    render(<DashboardApp />);

    const currentTabs = screen.getByRole('region', { name: '当前标签' });
    const savedGroups = screen.getByRole('region', { name: '收纳组' });
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

  it('shows and uses the default group when no saved tabs exist yet', async () => {
    activeSnapshot = { ...snapshot, savedTabGroups: [] };
    render(<DashboardApp />);

    const tabButton = (await screen.findByText('GitHub')).closest('button');
    expect(tabButton).toBeTruthy();
    fireEvent.click(tabButton!);
    expect(screen.getByText('暂无标签，点击左侧网页即可加入。')).toBeTruthy();
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', groupId: 'default-saved-group', windowId: 1, tabIds: [10] }));
  });

  it('opens a saved tab in the background without a per-tab restore button', async () => {
    render(<DashboardApp />);

    const savedTabButton = (await screen.findByText('文档')).closest('button');
    expect(savedTabButton).toBeTruthy();
    expect(screen.queryByRole('button', { name: '恢复 文档' })).toBeNull();

    fireEvent.click(savedTabButton!);

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'open-tab', groupId: 'day-1', savedTabId: 'saved-1' }));
  });

  it('renders saved browser groups and restores a whole nested group', async () => {
    activeSnapshot = {
      ...snapshot,
      savedTabGroups: [{
        ...snapshot.savedTabGroups[0],
        groups: [{
          ...snapshot.savedTabGroups[0].groups![0],
          groups: [{ id: 'saved-video', name: '视频', color: 'blue', createdAt: 1, tabs: [{ id: 'saved-video-1', title: '视频页', url: 'https://example.com/video' }] }],
        }],
      }],
    } as unknown as typeof snapshot;
    render(<DashboardApp />);

    expect(await screen.findByText('视频')).toBeTruthy();
    expect(screen.getByRole('button', { name: '恢复分组 视频' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '恢复分组 视频' }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'restore-group', groupId: 'saved-video' }));
  });

  it('restores a whole day card', async () => {
    activeSnapshot = {
      ...snapshot,
      savedTabGroups: [{
        ...snapshot.savedTabGroups[0],
        groups: [{
          ...snapshot.savedTabGroups[0].groups![0],
          tabs: [
            ...snapshot.savedTabGroups[0].groups![0].tabs,
            { id: 'saved-2', title: '文档 2', url: 'https://example.com/other' },
          ],
        }],
      }],
    };
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '恢复 2026-08-02' }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'restore-group', groupId: 'day-1' }));
  });

  it('does not let an older snapshot restore cleared saved tabs', async () => {
    let snapshotRequest = 0;
    let resolveOlder: ((value: typeof snapshot) => void) | undefined;
    let resolveLatest: ((value: typeof snapshot) => void) | undefined;
    sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type !== 'get-snapshot') return {};
      snapshotRequest += 1;
      if (snapshotRequest === 1) return snapshot;
      if (snapshotRequest === 2) return new Promise<typeof snapshot>((resolve) => { resolveOlder = resolve; });
      return new Promise<typeof snapshot>((resolve) => { resolveLatest = resolve; });
    });
    render(<DashboardApp />);
    expect(await screen.findByText('文档')).toBeTruthy();

    messageListeners.forEach((listener) => listener({ type: 'snapshot-changed' }));
    messageListeners.forEach((listener) => listener({ type: 'snapshot-changed' }));
    resolveLatest?.({ ...snapshot, savedTabGroups: [{ ...snapshot.savedTabGroups[0], tabs: [], groups: [] }] });
    await waitFor(() => expect(screen.queryByText('文档')).toBeNull());
    resolveOlder?.(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('文档')).toBeNull();
  });

  it('saves all restorable tabs in a browser group', async () => {
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '收纳分组 工作' }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'save-tabs', windowId: 1, browserGroupId: 7 }));
  });

  it('shows background message errors', async () => {
    sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'restore-all' ? { error: '无法恢复' } : snapshot);
    render(<DashboardApp />);

    fireEvent.click(await screen.findByRole('button', { name: '恢复全部' }));

    expect(await screen.findByText('无法恢复')).toBeTruthy();
  });
});
