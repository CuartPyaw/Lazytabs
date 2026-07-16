import { Button, Card, Chip, Input, Skeleton, Switch } from '@heroui/react';
import { Check, FolderCog, Globe2, Layers3, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { GROUP_COLORS, type GroupColor, type Rule, type RuleInput, validatePattern, validateRule } from '../../src/lib/rules';
import { getSettings, saveSettings, type Settings } from '../../src/lib/settings';

const emptyRule: RuleInput = { pattern: '', groupName: '', color: 'blue', enabled: true };

function nextId() {
  return crypto.randomUUID();
}

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>({ enabled: true, rules: [] });
  const [draft, setDraft] = useState<RuleInput>(emptyRule);
  const [editingId, setEditingId] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });
  }, []);

  const error = useMemo(() => validateRule(draft, settings.rules), [draft, settings.rules]);
  const patternError = draft.pattern ? validatePattern(draft.pattern) : undefined;

  async function updateSettings(next: Settings) {
    setSettings(next);
    await saveSettings(next);
  }

  async function setEnabled(enabled: boolean) {
    await updateSettings({ ...settings, enabled });
  }

  async function toggleRule(rule: Rule) {
    await updateSettings({ ...settings, rules: settings.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) });
  }

  function beginEdit(rule: Rule) {
    setDraft(rule);
    setEditingId(rule.id);
    setEditorOpen(true);
  }

  function beginCreate() {
    setDraft(emptyRule);
    setEditingId(undefined);
    setEditorOpen(true);
  }

  async function removeRule(id: string) {
    await updateSettings({ ...settings, rules: settings.rules.filter((rule) => rule.id !== id) });
    if (editingId === id) cancelEdit();
  }

  function cancelEdit() {
    setEditingId(undefined);
    setDraft(emptyRule);
    setEditorOpen(false);
  }

  async function saveRule() {
    if (error) return;
    const rule: Rule = { ...draft, id: editingId ?? nextId(), pattern: draft.pattern.trim(), groupName: draft.groupName.trim() };
    const rules = editingId
      ? settings.rules.map((item) => item.id === editingId ? rule : item)
      : [...settings.rules, rule];
    await updateSettings({ ...settings, rules });
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
              <span className="block font-medium text-foreground">{loaded ? settings.rules.length : '--'} 条规则</span>
              <span className="mt-1 block text-xs">匹配域名后自动归类</span>
            </div>
          </div>
        </aside>

        <div className="grid gap-6">
          <Card>
            <Card.Header className="flex items-start justify-between gap-4">
              <div>
                <Card.Title>分组规则</Card.Title>
                <Card.Description>每条规则将匹配的域名整理到指定标签组。</Card.Description>
              </div>
              <Button size="sm" onPress={beginCreate}><Plus size={17} strokeWidth={1.9} /> 添加规则</Button>
            </Card.Header>
            <Card.Content>
              {!loaded && <div className="grid gap-3"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-16 rounded-lg" /></div>}
              {loaded && settings.rules.length === 0 && (
                <div className="grid place-items-center py-12 text-center">
                  <span className="grid size-11 place-items-center rounded-xl bg-default text-muted"><Globe2 size={21} strokeWidth={1.7} /></span>
                  <p className="mb-0 mt-4 font-medium">还没有分组规则</p>
                  <p className="mb-0 mt-1 text-sm text-muted">添加一个域名规则开始自动整理。</p>
                </div>
              )}
              {loaded && settings.rules.length > 0 && <div className="divide-y divide-default border-y border-default">
                {settings.rules.map((rule) => (
                  <div className="flex min-h-20 flex-wrap items-center gap-4 py-3" key={rule.id}>
                    <Switch aria-label={`启用 ${rule.pattern}`} isSelected={rule.enabled} onChange={() => void toggleRule(rule)}>
                      <Switch.Control><Switch.Thumb /></Switch.Control>
                    </Switch>
                    <div className="min-w-48 flex-1">
                      <code className="text-sm font-medium">{rule.pattern}</code>
                      <p className="m-0 mt-1 text-sm text-muted">域名通配符</p>
                    </div>
                    <Chip size="sm" variant="soft"><span className={`group-swatch mr-1.5 inline-block size-2 rounded-full color-${rule.color}`} />{rule.groupName}</Chip>
                    <div className="ml-auto flex gap-1">
                      <Button isIconOnly aria-label={`编辑 ${rule.pattern}`} size="sm" variant="tertiary" onPress={() => beginEdit(rule)}><Pencil size={16} strokeWidth={1.8} /></Button>
                      <Button isIconOnly aria-label={`删除 ${rule.pattern}`} size="sm" variant="tertiary" onPress={() => void removeRule(rule.id)}><Trash2 size={16} strokeWidth={1.8} /></Button>
                    </div>
                  </div>
                ))}
              </div>}
            </Card.Content>
          </Card>

          {editorOpen && <Card>
            <Card.Header>
              <div>
                <Card.Title>{editingId ? '编辑规则' : '添加规则'}</Card.Title>
                <Card.Description>使用完整域名或一层子域名通配符。</Card.Description>
              </div>
            </Card.Header>
            <Card.Content>
              <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void saveRule(); }}>
                <div className="grid items-start gap-5 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">域名通配符
                    <Input aria-invalid={Boolean(patternError)} value={draft.pattern} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} placeholder="*.github.com" />
                    {patternError && <span className="text-sm font-normal text-danger">{patternError}</span>}
                  </label>
                  <label className="grid gap-2 text-sm font-medium">分组名称
                    <Input value={draft.groupName} onChange={(event) => setDraft({ ...draft, groupName: event.target.value })} placeholder="代码" />
                  </label>
                </div>
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
                  <Button type="submit" isDisabled={Boolean(error)}><Check size={17} strokeWidth={2} />{editingId ? '保存修改' : '保存规则'}</Button>
                </div>
              </form>
            </Card.Content>
          </Card>}
        </div>
      </div>
    </main>
  );
}
