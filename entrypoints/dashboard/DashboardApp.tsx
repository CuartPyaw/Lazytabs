import { Button, Card, Input, Skeleton, useTheme } from '@heroui/react';
import { CircleAlert, FolderArchive, Globe2, Layers3, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { getSettings, type Settings } from '../../src/lib/settings';
import { DEFAULT_SAVED_TAB_GROUP_ID, DEFAULT_SAVED_TAB_GROUP_NAME } from '../../src/lib/saved-tabs';

type BrowserTab = {
  id: number;
  windowId: number;
  groupId: number;
  active: boolean;
  pinned: boolean;
  title: string;
  url: string;
  favIconUrl: string;
  restorable: boolean;
};

type BrowserGroup = {
  id: number;
  title: string;
  color: string;
};

type BrowserWindow = {
  id: number;
  focused: boolean;
  groups: BrowserGroup[];
  tabs: BrowserTab[];
};

type SavedTab = {
  id: string;
  title: string;
  url: string;
  favIconUrl?: string;
};

type SavedTabGroup = {
  id: string;
  name: string;
  createdAt: number;
  tabs: SavedTab[];
  color?: string;
  groups?: SavedTabGroup[];
};

type Snapshot = {
  windows: BrowserWindow[];
  savedTabGroups: SavedTabGroup[];
};

const groupColorClasses: Record<string, string> = {
  grey: 'bg-gray-400',
  blue: 'bg-blue-400',
  red: 'bg-red-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  cyan: 'bg-cyan-400',
  orange: 'bg-orange-400',
};

function matchesSearch(search: string, title: string, url: string) {
  const query = search.trim().toLocaleLowerCase();
  return !query || title.toLocaleLowerCase().includes(query) || url.toLocaleLowerCase().includes(query);
}

function TabIcon({ favIconUrl, title }: { favIconUrl?: string; title: string }) {
  if (!favIconUrl) return <span className="tab-icon grid size-6 shrink-0 place-items-center rounded-md bg-default text-muted"><Globe2 size={14} strokeWidth={1.8} /></span>;
  return <img alt="" className="tab-icon size-6 shrink-0 rounded-md bg-default object-contain" draggable={false} src={favIconUrl} title={title} />;
}

export function DashboardApp() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
  const snapshotRequestRef = useRef(0);
  const { setTheme } = useTheme();

  useEffect(() => {
    void getSettings().then((settings) => setTheme(settings.theme));

    const handleSettingsChange = (changes: { settings?: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local' || !changes.settings) return;
      const nextSettings = changes.settings.newValue as Settings | undefined;
      if (nextSettings?.theme) setTheme(nextSettings.theme);
      else void getSettings().then((settings) => setTheme(settings.theme));
    };
    chrome.storage.onChanged.addListener(handleSettingsChange);
    return () => chrome.storage.onChanged.removeListener(handleSettingsChange);
  }, [setTheme]);

  async function loadSnapshot() {
    const requestId = ++snapshotRequestRef.current;
    try {
      const nextSnapshot = await chrome.runtime.sendMessage({ type: 'get-snapshot' }) as Snapshot & { error?: string };
      if (nextSnapshot.error) throw new Error(nextSnapshot.error);
      if (requestId !== snapshotRequestRef.current) return;
      setSnapshot(nextSnapshot);
    } catch (reason) {
      if (requestId !== snapshotRequestRef.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : '加载标签数据失败。');
    }
  }

  useEffect(() => {
    void loadSnapshot();
    const listener = (message: { type?: string }) => {
      if (message.type === 'snapshot-changed') void loadSnapshot();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const currentWindow = snapshot?.windows.find((window) => window.focused);
  const currentWindows = currentWindow ? [currentWindow] : [];

  async function send(message: Record<string, unknown>, afterSuccess?: () => void) {
    try {
      const response = await chrome.runtime.sendMessage(message) as { error?: unknown };
      if (typeof response?.error === 'string') throw new Error(response.error);
      setError(undefined);
      afterSuccess?.();
      await loadSnapshot();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : '操作失败，请重试。');
    }
  }

  const savedGroup = snapshot?.savedTabGroups[0] ?? { id: DEFAULT_SAVED_TAB_GROUP_ID, name: DEFAULT_SAVED_TAB_GROUP_NAME, createdAt: 0, tabs: [] };
  const visibleSavedTabs = savedGroup.tabs.filter((tab) => matchesSearch(search, tab.title, tab.url));
  const visibleSavedGroups = (savedGroup.groups ?? [])
    .map((group) => ({ group, tabs: group.tabs.filter((tab) => matchesSearch(search, tab.title, tab.url)) }))
    .filter(({ tabs }) => tabs.length > 0);
  const hasSavedTabs = savedGroup.tabs.length > 0 || (savedGroup.groups ?? []).some((group) => group.tabs.length > 0);

  async function openSavedGroupTabs() {
    try {
      for (const tab of savedGroup.tabs) {
        const response = await chrome.runtime.sendMessage({ type: 'open-tab', groupId: savedGroup.id, savedTabId: tab.id }) as { error?: unknown };
        if (typeof response?.error === 'string') throw new Error(response.error);
      }
      setError(undefined);
      await loadSnapshot();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : '操作失败，请重试。');
    }
  }

  function handleTabClick(windowId: number, tab: BrowserTab) {
    if (!tab.restorable) {
      void send({ type: 'focus-tab', tabId: tab.id });
      return;
    }
    void send({ type: 'save-tabs', groupId: savedGroup.id, windowId, tabIds: [tab.id] });
  }

  function renderSavedTab(groupId: string, tab: SavedTab) {
    return <div className="tab-row flex items-center gap-2 py-2" key={tab.id}><button aria-label={`打开 ${tab.title}`} className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 text-left" title="点击在后台打开" type="button" onClick={() => void send({ type: 'open-tab', groupId, savedTabId: tab.id })}><TabIcon favIconUrl={tab.favIconUrl} title={tab.title} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{tab.title || '未命名标签'}</span><span className="block truncate text-xs text-muted">{tab.url}</span></span></button><Button isIconOnly aria-label={`删除 ${tab.title}`} size="sm" variant="tertiary" onPress={() => void send({ type: 'delete-tab', groupId, savedTabId: tab.id })}><Trash2 size={16} strokeWidth={1.8} /></Button></div>;
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-default bg-background/95 px-4 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Layers3 size={19} strokeWidth={2} /></span>
            <div><p className="m-0 font-semibold">LazyTabs</p><p className="m-0 text-xs text-muted">概览</p></div>
          </div>
          <div className="relative min-w-52 flex-1 sm:max-w-xl"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" size={17} strokeWidth={1.8} /><Input aria-label="全局搜索" className="w-full pl-9" placeholder="搜索标题或 URL" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Button isDisabled={!hasSavedTabs} size="sm" variant="secondary" onPress={() => void send({ type: 'restore-all' })}><RotateCcw size={16} strokeWidth={1.8} />恢复全部</Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <section className="flex min-w-0 flex-col gap-4" aria-labelledby="current-tabs-heading">
            <div className="flex items-center justify-between gap-3"><div><h1 className="m-0 text-lg font-semibold" id="current-tabs-heading">当前标签</h1><p className="m-0 mt-1 text-sm text-muted">跟随当前浏览器窗口</p></div>{snapshot && <span className="text-sm text-muted">{currentWindow?.tabs.length ?? 0} 个标签</span>}</div>
            {!snapshot && <><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /></>}
            {snapshot && currentWindows.length === 0 && <EmptyState icon={<Layers3 size={23} strokeWidth={1.7} />} title="没有普通窗口" description="打开网页标签后会显示在这里。" />}
            {currentWindows.map((window, index) => {
              const visibleTabs = window.tabs.filter((tab) => matchesSearch(search, tab.title, tab.url));
              const restorableCount = window.tabs.filter((tab) => tab.restorable).length;
              const renderTab = (tab: BrowserTab) => <div className={`tab-row flex items-center gap-2 py-2 ${tab.active ? 'bg-primary/5' : ''}`} key={tab.id}>
                <button className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 text-left" title={tab.restorable ? '点击自动收纳到最近的收纳组' : undefined} type="button" onClick={() => handleTabClick(window.id, tab)}>
                  <TabIcon favIconUrl={tab.favIconUrl} title={tab.title} />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{tab.title || '未命名标签'}</span><span className="block truncate text-xs text-muted">{tab.url}</span></span>
                </button>
                {!tab.restorable && <span className="hidden text-xs text-muted sm:inline">{tab.pinned ? '固定标签，无法收纳' : '特殊标签，无法收纳'}</span>}
                <Button isIconOnly aria-label={`关闭 ${tab.title}`} size="sm" variant="tertiary" onPress={() => void send({ type: 'close-tabs', tabIds: [tab.id] })}><X size={17} strokeWidth={1.9} /></Button>
              </div>;
              const groupedTabs = (window.groups ?? []).map((group) => {
                const groupTabs = window.tabs.filter((tab) => tab.groupId === group.id);
                return { group, tabs: visibleTabs.filter((tab) => tab.groupId === group.id), restorableTabIds: groupTabs.filter((tab) => tab.restorable).map((tab) => tab.id) };
              }).filter(({ tabs }) => tabs.length > 0);
              const ungroupedTabs = visibleTabs.filter((tab) => tab.groupId < 0 || !(window.groups ?? []).some((group) => group.id === tab.groupId));
              return <Card className="w-full min-w-0 overflow-hidden" key={window.id}>
                <Card.Header className="relative flex flex-col items-stretch gap-3">
                  <div className="pr-10"><Card.Title>窗口 {index + 1}{window.focused ? ' · 当前窗口' : ''}</Card.Title><Card.Description>{window.tabs.length} 个标签</Card.Description></div>
                  <Button className="absolute right-4 top-4" isDisabled={!restorableCount} isIconOnly aria-label="收纳窗口" size="sm" variant="tertiary" onPress={() => void send({ type: 'save-window-tabs', windowId: window.id })}><FolderArchive size={17} strokeWidth={1.8} /></Button>
                </Card.Header>
                <Card.Content className="pt-0">
                  {!visibleTabs.length && <p className="m-0 py-4 text-sm text-muted">没有匹配的标签。</p>}
                  <div className="space-y-3">
                    {groupedTabs.map(({ group, tabs, restorableTabIds }) => <div className="overflow-hidden rounded-lg border border-default" key={group.id}>
                      <div className="flex items-center gap-2 border-b border-default px-3 py-2.5">
                        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${groupColorClasses[group.color] ?? 'bg-default-500'}`} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.title || '未命名分组'}</span>
                        <span className="text-xs text-muted">{tabs.length} 个标签</span>
                        <Button isDisabled={!restorableTabIds.length} isIconOnly aria-label={`收纳分组 ${group.title || '未命名分组'}`} size="sm" variant="tertiary" onPress={() => void send({ type: 'save-tabs', windowId: window.id, browserGroupId: group.id })}><FolderArchive size={16} strokeWidth={1.8} /></Button>
                      </div>
                      <div className="px-3">{tabs.map(renderTab)}</div>
                    </div>)}
                    {ungroupedTabs.length > 0 && <div className="border-y border-default">{ungroupedTabs.map(renderTab)}</div>}
                  </div>
                </Card.Content>
              </Card>;
            })}
          </section>

          <section className="flex min-w-0 flex-col gap-4" aria-labelledby="saved-groups-heading">
            <div><h2 className="m-0 text-lg font-semibold" id="saved-groups-heading">收纳组</h2><p className="m-0 mt-1 text-sm text-muted">{snapshot ? `${savedGroup.tabs.length} 个单项 · ${(savedGroup.groups ?? []).length} 个分组` : '正在加载'}</p></div>
            {snapshot && <div aria-label={`收纳组 ${savedGroup.name}`} className="min-w-0" role="region"><Card className="w-full min-w-0 overflow-hidden">
              <Card.Header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-48 flex-1"><Card.Title>{savedGroup.name}</Card.Title><Card.Description>{savedGroup.tabs.length} 个单项 · {(savedGroup.groups ?? []).length} 个分组</Card.Description></div>
                <Button isDisabled={!savedGroup.tabs.length} isIconOnly aria-label="恢复默认收纳组" size="sm" variant="tertiary" onPress={() => void openSavedGroupTabs()}><RotateCcw size={16} strokeWidth={1.8} /></Button>
              </Card.Header>
              <Card.Content className="pt-0"><div className="space-y-3">
                {visibleSavedTabs.length > 0 && <div className="border-y border-default">{visibleSavedTabs.map((tab) => renderSavedTab(savedGroup.id, tab))}</div>}
                {visibleSavedGroups.map(({ group, tabs }) => <div className="overflow-hidden rounded-lg border border-default" key={group.id}>
                  <div className="flex items-center gap-2 border-b border-default px-3 py-2.5">
                    <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${groupColorClasses[group.color ?? 'grey'] ?? 'bg-default-500'}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.name}</span>
                    <span className="text-xs text-muted">{group.tabs.length} 个标签</span>
                    <Button isDisabled={!group.tabs.length} isIconOnly aria-label={`恢复分组 ${group.name}`} size="sm" variant="tertiary" onPress={() => void send({ type: 'restore-group', groupId: group.id })}><RotateCcw size={16} strokeWidth={1.8} /></Button>
                  </div>
                  <div className="px-3">{tabs.map((tab) => renderSavedTab(group.id, tab))}</div>
                </div>)}
                {!visibleSavedTabs.length && !visibleSavedGroups.length && <p className="m-0 py-6 text-center text-sm text-muted">{hasSavedTabs ? '没有匹配的标签。' : '暂无标签，点击左侧网页即可加入。'}</p>}
              </div></Card.Content>
            </Card></div>}
          </section>
        </div>
      </div>

      {error && <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger shadow-lg"><CircleAlert size={18} strokeWidth={2} /><span className="flex-1">{error}</span><Button isIconOnly aria-label="关闭错误提示" size="sm" variant="tertiary" onPress={() => setError(undefined)}><X size={16} /></Button></div>}

    </main>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <Card><Card.Content className="grid place-items-center py-12 text-center"><span className="grid size-11 place-items-center rounded-lg bg-default text-muted">{icon}</span><p className="mb-0 mt-4 font-medium">{title}</p><p className="mb-0 mt-1 text-sm text-muted">{description}</p></Card.Content></Card>;
}
