import { Button } from '@heroui/react';
import { Check, FolderInput, Layers3, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type PopupState = { enabled: boolean; ruleCount: number; tabCount: number };

export function PopupApp() {
  const [state, setState] = useState<PopupState>();
  const [grouped, setGrouped] = useState<number>();

  useEffect(() => {
    void chrome.runtime.sendMessage({ type: 'popup-state' }).then(setState);
  }, []);

  async function organize() {
    const result = await chrome.runtime.sendMessage({ type: 'organize-current-window' });
    setGrouped(result.grouped);
  }

  return (
    <main className="w-[352px] overflow-hidden rounded-2xl border border-default bg-surface text-foreground shadow-surface">
      <header className="flex items-center justify-between border-b border-default px-4 py-3">
        <div className="flex items-center gap-2.5 font-medium">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Layers3 size={16} /></span>
          LazyTabs
        </div>
        <Button isIconOnly aria-label="打开设置" size="sm" variant="tertiary" onPress={() => void chrome.runtime.openOptionsPage()}>
          <Settings2 size={17} />
        </Button>
      </header>
      <section className="p-4">
        <p className="m-0 text-sm text-muted">当前窗口</p>
        <p className="mb-0 mt-1 text-lg font-medium">{state?.tabCount ?? '...'} 个标签页</p>
        <p className="mb-0 mt-1 text-sm text-muted">{state?.ruleCount ?? '...'} 条规则正在生效</p>
        <Button fullWidth className="mt-5" onPress={organize}>
          <FolderInput size={17} /> 整理当前窗口
        </Button>
        <div className="mt-4 flex items-center gap-2 border-t border-default pt-4 text-sm text-muted">
          <span className="grid size-5 place-items-center rounded-full bg-success/15 text-success"><Check size={13} /></span>
          {grouped === undefined ? (state?.enabled ? '自动分组已启用' : '自动分组已暂停') : `已整理 ${grouped} 个标签页`}
        </div>
      </section>
    </main>
  );
}
