import { Button, Card, Chip, Input, Skeleton, Switch } from '@heroui/react';
import { Check, FolderCog, Globe2, Layers3, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { GROUP_COLORS, type Group, type GroupColor, type GroupInput, splitPatterns, validateGroup } from '../../src/lib/rules';
import { getSettings, saveSettings, type Settings } from '../../src/lib/settings';

const emptyGroup: GroupInput = { name: '', patterns: '', color: 'blue', enabled: true };

function nextId() {
  return crypto.randomUUID();
}

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>({ enabled: true, groups: [] });
  const [draft, setDraft] = useState<GroupInput>(emptyGroup);
  const [editingId, setEditingId] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });
  }, []);

  const error = useMemo(() => validateGroup(draft, settings.groups), [draft, settings.groups]);

  async function updateSettings(next: Settings) {
    setSettings(next);
    await saveSettings(next);
  }

  async function setEnabled(enabled: boolean) {
    await updateSettings({ ...settings, enabled });
  }

  async function toggleGroup(group: Group) {
    await updateSettings({ ...settings, groups: settings.groups.map((item) => item.id === group.id ? { ...item, enabled: !item.enabled } : item) });
  }

  function beginEdit(group: Group) {
    setDraft({ ...group, patterns: group.rules.map((rule) => rule.pattern).join('\n') });
    setEditingId(group.id);
    setEditorOpen(true);
  }

  function beginCreate() {
    setDraft(emptyGroup);
    setEditingId(undefined);
    setEditorOpen(true);
  }

  async function removeGroup(id: string) {
    await updateSettings({ ...settings, groups: settings.groups.filter((group) => group.id !== id) });
    if (editingId === id) cancelEdit();
  }

  function cancelEdit() {
    setEditingId(undefined);
    setDraft(emptyGroup);
    setEditorOpen(false);
  }

  async function saveGroup() {
    if (error) return;
    const existing = settings.groups.find((group) => group.id === editingId);
    const group: Group = {
      id: editingId ?? nextId(),
      name: draft.name.trim(),
      color: draft.color,
      enabled: draft.enabled,
      rules: splitPatterns(draft.patterns).map((pattern) => existing?.rules.find((rule) => rule.pattern === pattern) ?? { id: nextId(), pattern }),
    };
    const groups = existing ? settings.groups.map((item) => item.id === group.id ? group : item) : [...settings.groups, group];
    await updateSettings({ ...settings, groups });
    cancelEdit();
  }

  return (
    <main className="min-h-[100dvh] bg-default/35 text-foreground">
      <header className="border-b border-default bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Layers3 size={21} strokeWidth={2} /></span>
            <div>
              <h1 className="m-0 text-lg font-semibold">LazyTabs</h1>
              <p className="m-0 mt-0.5 text-sm text-muted">标签页自动分组设置</p>
            </div>
          </div>
          <Switch isSelected={settings.enabled} isDisabled={!loaded} onChange={setEnabled}>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            自动分组
          </Switch>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="self-start lg:sticky lg:top-6">
          <div className="rounded-xl border border-default bg-surface p-3">
            <div className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary">
              <FolderCog size={17} strokeWidth={1.8} />
              分组规则
            </div>
            <div className="mt-3 px-3 py-2 text-sm text-muted">
              <span className="block font-medium text-foreground">{loaded ? settings.groups.reduce((count, group) => count + group.rules.length, 0) : '--'} 条规则</span>
              <span className="mt-1 block text-xs">匹配域名后自动归类</span>
            </div>
          </div>
        </aside>

        <div className="grid gap-6">
          <Card>
            <Card.Header className="flex items-start justify-between gap-4">
              <div>
                <Card.Title>分组规则</Card.Title>
                <Card.Description>每个分组可包含多条域名规则。</Card.Description>
              </div>
              <Button size="sm" onPress={beginCreate}><Plus size={17} strokeWidth={1.9} /> 添加分组</Button>
            </Card.Header>
            <Card.Content>
              {!loaded && <div className="grid gap-3"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-16 rounded-lg" /></div>}
              {loaded && settings.groups.length === 0 && (
                <div className="grid place-items-center py-12 text-center">
                  <span className="grid size-11 place-items-center rounded-xl bg-default text-muted"><Globe2 size={21} strokeWidth={1.7} /></span>
                  <p className="mb-0 mt-4 font-medium">还没有分组</p>
                  <p className="mb-0 mt-1 text-sm text-muted">添加分组和域名规则开始自动整理。</p>
                </div>
              )}
              {loaded && settings.groups.length > 0 && <div className="divide-y divide-default border-y border-default">
                {settings.groups.map((group) => (
                  <div className="flex min-h-20 flex-wrap items-center gap-4 py-3" key={group.id}>
                    <Switch aria-label={`启用 ${group.name}`} isSelected={group.enabled} onChange={() => void toggleGroup(group)}>
                      <Switch.Control><Switch.Thumb /></Switch.Control>
                    </Switch>
                    <div className="min-w-48 flex-1">
                      <p className="m-0 text-sm font-medium">{group.name}</p>
                      <p className="m-0 mt-1 text-sm text-muted">{group.rules.map((rule) => rule.pattern).join('、')}</p>
                    </div>
                    <Chip size="sm" variant="soft"><span className={`group-swatch mr-1.5 inline-block size-2 rounded-full color-${group.color}`} />{group.rules.length} 条规则</Chip>
                    <div className="ml-auto flex gap-1">
                      <Button isIconOnly aria-label={`编辑 ${group.name}`} size="sm" variant="tertiary" onPress={() => beginEdit(group)}><Pencil size={16} strokeWidth={1.8} /></Button>
                      <Button isIconOnly aria-label={`删除 ${group.name}`} size="sm" variant="tertiary" onPress={() => void removeGroup(group.id)}><Trash2 size={16} strokeWidth={1.8} /></Button>
                    </div>
                  </div>
                ))}
              </div>}
            </Card.Content>
          </Card>

          {editorOpen && <Card>
            <Card.Header>
              <label className="flex items-center gap-2 text-sm font-medium">分组名称：
                <Input className="w-64" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="代码" />
              </label>
            </Card.Header>
            <Card.Content>
              <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void saveGroup(); }}>
                <label className="grid gap-2 text-sm font-medium">域名规则
                  <textarea aria-invalid={Boolean(error)} className="min-h-32 w-full rounded-lg border border-default bg-surface px-3 py-2 text-sm outline-none" value={draft.patterns} onChange={(event) => setDraft({ ...draft, patterns: event.target.value })} placeholder={'github.com\n*.github.com'} />
                  {error && <span className="text-sm font-normal text-danger">{error}</span>}
                </label>
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="p-0 text-sm font-medium">标签组颜色</legend>
                  <div className="color-palette" aria-label="标签组颜色">
                    {GROUP_COLORS.map((color) => (
                      <button key={color} aria-label={color} aria-pressed={draft.color === color} className={`color-choice color-${color}`} data-selected={draft.color === color} type="button" onClick={() => setDraft({ ...draft, color: color as GroupColor })} />
                    ))}
                  </div>
                </fieldset>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onPress={cancelEdit}>取消</Button>
                  <Button type="submit" isDisabled={Boolean(error)}><Check size={17} strokeWidth={2} />{editingId ? '保存修改' : '保存分组'}</Button>
                </div>
              </form>
            </Card.Content>
          </Card>}
        </div>
      </div>
    </main>
  );
}
