import { Button, Chip, Skeleton } from '@heroui/react';
import { Check, FolderInput, Layers3, Settings2, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

type PopupState = { enabled: boolean; ruleCount: number; tabCount: number };

export function PopupApp() {
  const [state, setState] = useState<PopupState>();
  const [grouped, setGrouped] = useState<number>();
  const [organizeError, setOrganizeError] = useState<string>();
  const [isOrganizing, setIsOrganizing] = useState(false);
  const isLoading = state === undefined;

  useEffect(() => {
    void chrome.runtime.sendMessage({ type: 'popup-state' }).then(setState);
  }, []);

  async function organize() {
    setIsOrganizing(true);
    setOrganizeError(undefined);

    try {
      const result = await chrome.runtime.sendMessage({ type: 'organize-current-window' });
      setGrouped(result.grouped);
    } catch {
      setOrganizeError('整理失败，请重试。');
    } finally {
      setIsOrganizing(false);
    }
  }

  return (
    <main className="min-h-[284px] w-full bg-surface text-foreground">
      <header className="flex items-center justify-between px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Layers3 size={19} strokeWidth={2} /></span>
          <div>
            <p className="m-0 text-base font-semibold leading-5">LazyTabs</p>
            <p className="m-0 mt-0.5 text-xs text-muted">标签页自动分组</p>
          </div>
        </div>
        <Button isIconOnly aria-label="打开设置" size="sm" variant="tertiary" onPress={() => void chrome.runtime.openOptionsPage()}>
          <Settings2 size={18} strokeWidth={1.8} />
        </Button>
      </header>

      <section className="mx-5 rounded-xl border border-default bg-default/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-sm font-medium">当前窗口</p>
            {isLoading ? <Skeleton className="mt-2 h-8 w-28 rounded-lg" /> : <p className="m-0 mt-1 text-3xl font-semibold leading-8">{state.tabCount}<span className="ml-1 text-sm font-medium text-muted">个标签页</span></p>}
          </div>
          {isLoading ? <Skeleton className="h-6 w-16 rounded-full" /> : <Chip color={state.enabled ? 'success' : 'default'} size="sm" variant="soft">{state.enabled ? '已启用' : '已暂停'}</Chip>}
        </div>
        {isLoading ? <Skeleton className="mt-4 h-4 w-36 rounded" /> : <p className="m-0 mt-4 flex items-center gap-1.5 text-sm text-muted"><SlidersHorizontal size={15} strokeWidth={1.8} /> {state.ruleCount} 条规则正在生效</p>}
      </section>

      <section className="px-5 pb-5 pt-4">
        <Button fullWidth isDisabled={isLoading || isOrganizing} size="lg" onPress={organize}>
          <FolderInput size={18} strokeWidth={1.9} /> {isOrganizing ? '正在整理...' : '整理当前窗口'}
        </Button>
        <div className="mt-4 flex items-center gap-2 text-sm text-muted">
          <span className="grid size-5 place-items-center rounded-full bg-success/15 text-success"><Check size={13} strokeWidth={2.4} /></span>
          {organizeError ?? (grouped === undefined ? (state?.enabled ? '新打开的标签页会自动分组' : '自动分组当前已暂停') : `已整理 ${grouped} 个标签页`)}
        </div>
      </section>
    </main>
  );
}
