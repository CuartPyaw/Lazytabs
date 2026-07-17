import { beforeEach, describe, expect, it, vi } from 'vitest';

const { groupTab, organizeCurrentWindow, getSettings } = vi.hoisted(() => ({
  groupTab: vi.fn(),
  organizeCurrentWindow: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('../src/lib/tab-groups', () => ({ groupTab, organizeCurrentWindow }));
vi.mock('../src/lib/settings', () => ({ getSettings }));
vi.mock('wxt/utils/define-background', () => ({
  defineBackground: (setup: () => void) => {
    setup();
  },
}));

describe('background commands', () => {
  const commandListeners: Array<(command: string) => void> = [];

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    commandListeners.length = 0;
    vi.stubGlobal('chrome', {
      commands: { onCommand: { addListener: vi.fn((listener) => commandListeners.push(listener)) } },
      runtime: { onMessage: { addListener: vi.fn() } },
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
});
