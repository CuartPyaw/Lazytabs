import { beforeEach, describe, expect, it, vi } from 'vitest';

const { groupTab, organizeAllWindows, organizeCurrentWindow, getSettings } = vi.hoisted(() => ({
  groupTab: vi.fn(),
  organizeAllWindows: vi.fn(),
  organizeCurrentWindow: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('../src/lib/tab-groups', () => ({ groupTab, organizeAllWindows, organizeCurrentWindow }));
vi.mock('../src/lib/settings', () => ({ getSettings }));
vi.mock('wxt/utils/define-background', () => ({
  defineBackground: (setup: () => void) => {
    setup();
  },
}));

describe('background commands', () => {
  const commandListeners: Array<(command: string) => void> = [];
  const messageListeners: Array<(message: { type?: string }, sender: unknown, sendResponse: (response: { grouped: number }) => void) => boolean | void> = [];

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    commandListeners.length = 0;
    messageListeners.length = 0;
    vi.stubGlobal('chrome', {
      commands: { onCommand: { addListener: vi.fn((listener) => commandListeners.push(listener)) } },
      runtime: { onMessage: { addListener: vi.fn((listener) => messageListeners.push(listener)) } },
      tabs: {
        onCreated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
    });

    await import('../entrypoints/background');
  });

  it('organizes the current window when its command is invoked', () => {
    commandListeners[0]('organize-current-window');

    expect(organizeCurrentWindow).toHaveBeenCalledOnce();
  });

  it('ignores unrelated commands', () => {
    commandListeners[0]('unrelated-command');

    expect(organizeCurrentWindow).not.toHaveBeenCalled();
  });

  it('organizes all windows when enabled in settings', async () => {
    getSettings.mockResolvedValue({ organizeAllWindows: true });
    organizeAllWindows.mockResolvedValue(2);
    const sendResponse = vi.fn();

    expect(messageListeners[0]({ type: 'organize-current-window' }, undefined, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(organizeAllWindows).toHaveBeenCalledOnce();
      expect(sendResponse).toHaveBeenCalledWith({ grouped: 2 });
    });
    expect(organizeCurrentWindow).not.toHaveBeenCalled();
  });
});
