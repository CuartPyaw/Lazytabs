import { Button, Card, Chip, Input, Skeleton, Switch, useTheme } from '@heroui/react';
import { Check, FolderCog, Globe2, Layers3, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type Group, type GroupColor, type GroupInput, splitPatterns, validateGroup, validatePattern } from '../../src/lib/rules';
import { getSettings, saveSettings, type Settings, type Theme } from '../../src/lib/settings';

const emptyGroup: GroupInput = { name: '', patterns: '', color: 'blue', enabled: true };
const paletteColors: GroupColor[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'grey'];

function nextId() {
  return crypto.randomUUID();
}

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>({ enabled: true, groups: [], theme: 'system' });
  const [draft, setDraft] = useState<GroupInput>(emptyGroup);
  const [editingId, setEditingId] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingRule, setEditingRule] = useState<{ pattern?: string; value: string }>();
  const [pasteError, setPasteError] = useState<string>();
  const [error, setError] = useState<string>();
  const { setTheme } = useTheme();

  useEffect(() => {
    void getSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });

    const handleSettingsChange = (changes: { settings?: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local' || !changes.settings) return;

      const nextSettings = changes.settings.newValue as Settings | undefined;
      if (nextSettings?.groups && nextSettings.theme) {
        setSettings(nextSettings);
      } else {
        void getSettings().then(setSettings);
      }
    };
    chrome.storage.onChanged.addListener(handleSettingsChange);

    return () => chrome.storage.onChanged.removeListener(handleSettingsChange);
  }, []);

  useEffect(() => {
    setTheme(settings.theme);
  }, [setTheme, settings.theme]);

  const ruleError = Boolean(error && (error.startsWith('域名') || error === pasteError));
  const nameError = error === '请输入分组名称。' || error === '分组名称不能重复。';
  const patterns = splitPatterns(draft.patterns);

  async function updateSettings(groups: Group[]) {
    const currentSettings = await getSettings();
    const next = { ...currentSettings, groups };
    setSettings(next);
    await saveSettings(next);
  }

  async function updateTheme(theme: Theme) {
    const currentSettings = await getSettings();
    const next = { ...currentSettings, theme };
    setSettings(next);
    await saveSettings(next);
  }

  async function toggleGroup(group: Group) {
    await updateSettings(settings.groups.map((item) => item.id === group.id ? { ...item, enabled: !item.enabled } : item));
  }

  function beginEdit(group: Group) {
    setDraft({ ...group, patterns: group.rules.map((rule) => rule.pattern).join('\n') });
    setEditingId(group.id);
    setEditorOpen(true);
    setEditingRule(undefined);
    setPasteError(undefined);
    setError(undefined);
  }

  function beginCreate() {
    setDraft(emptyGroup);
    setEditingId(undefined);
    setEditorOpen(true);
    setEditingRule(undefined);
    setPasteError(undefined);
    setError(undefined);
  }

  async function removeGroup(id: string) {
    await updateSettings(settings.groups.filter((group) => group.id !== id));
    if (editingId === id) cancelEdit();
  }

  function cancelEdit() {
    setEditingId(undefined);
    setDraft(emptyGroup);
    setEditorOpen(false);
    setEditingRule(undefined);
    setPasteError(undefined);
    setError(undefined);
  }

  function setPatterns(nextPatterns: string[]) {
    setDraft({ ...draft, patterns: splitPatterns(nextPatterns.join('\n')).join('\n') });
    setPasteError(undefined);
    setError(undefined);
  }

  function beginAddRule() {
    setEditingRule({ value: '' });
    setPasteError(undefined);
  }

  function saveRuleEdit() {
    if (!editingRule || validatePattern(editingRule.value)) return;
    setPatterns(editingRule.pattern ? patterns.map((pattern) => pattern === editingRule.pattern ? editingRule.value : pattern) : [...patterns, editingRule.value]);
    setEditingRule(undefined);
  }

  async function saveGroup() {
    const nextError = pasteError ?? (editingRule?.value ? validatePattern(editingRule.value) : undefined) ?? validateGroup(draft, settings.groups);
    setError(nextError);
    if (nextError) return;
    const existing = settings.groups.find((group) => group.id === editingId);
    const group: Group = {
      id: editingId ?? nextId(),
      name: draft.name.trim(),
      color: draft.color,
      enabled: draft.enabled,
      rules: splitPatterns(draft.patterns).map((pattern) => existing?.rules.find((rule) => rule.pattern === pattern) ?? { id: nextId(), pattern }),
    };
    const groups = existing ? settings.groups.map((item) => item.id === group.id ? group : item) : [...settings.groups, group];
    await updateSettings(groups);
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
          <label className="flex items-center gap-2 text-sm text-muted">
            主题
            <select aria-label="主题" className="rounded-md border border-default bg-surface px-2 py-1.5 text-sm text-foreground" value={settings.theme} onChange={(event) => void updateTheme(event.target.value as Theme)}>
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
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
                    <Switch aria-label={`启用 ${group.name}`} className="soft-switch" isSelected={group.enabled} onChange={() => void toggleGroup(group)}>
                      <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
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
                <Input aria-invalid={nameError} className={`w-64 ${nameError ? 'border-danger' : ''}`} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(undefined); }} placeholder="代码" />
              </label>
            </Card.Header>
            <Card.Content>
              <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void saveGroup(); }}>
                <div className="grid gap-2 text-sm font-medium">
                  <span id="domain-rules-label">域名规则</span>
                  <div aria-invalid={ruleError} aria-labelledby="domain-rules-label" className="flex flex-wrap items-center gap-2" role="list">
                    {patterns.map((pattern) => editingRule?.pattern === pattern ? (
                      <Chip className={`border bg-surface px-2.5 py-1.5 shadow-sm ${ruleError ? 'border-danger' : 'border-default/80'}`} key={pattern} variant="soft" role="listitem">
                        <input autoFocus aria-label={`编辑 ${pattern}`} className="min-w-32 bg-transparent text-sm outline-none" value={editingRule.value} onBlur={() => setEditingRule(undefined)} onChange={(event) => { setEditingRule({ ...editingRule, value: event.target.value }); setPasteError(undefined); setError(undefined); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveRuleEdit(); } }} onPaste={(event) => { if (/\r?\n/.test(event.clipboardData.getData('text'))) { event.preventDefault(); setPasteError('一次只能添加一条规则。'); } }} />
                      </Chip>
                    ) : (
                      <Chip className="gap-1.5 border border-default/80 bg-surface px-2.5 py-1.5 text-sm shadow-sm" key={pattern} variant="soft" role="listitem">
                        <button aria-label={`编辑 ${pattern}`} className="border-0 bg-transparent p-0 text-left text-inherit" type="button" onClick={() => { setEditingRule({ pattern, value: pattern }); setPasteError(undefined); }}>{pattern}</button>
                        <Button isIconOnly aria-label={`删除 ${pattern}`} className="size-5 min-h-5 min-w-5 text-inherit" size="sm" variant="tertiary" onPress={() => setPatterns(patterns.filter((item) => item !== pattern))}><X size={14} strokeWidth={2} /></Button>
                      </Chip>
                    ))}
                    {editingRule && !editingRule.pattern && <Chip className={`border bg-surface px-2.5 py-1.5 shadow-sm ${ruleError ? 'border-danger' : 'border-default/80'}`} variant="soft" role="listitem">
                      <input autoFocus aria-label="添加域名规则" className="min-w-32 bg-transparent text-sm outline-none" placeholder="输入域名" value={editingRule.value} onBlur={() => setEditingRule(undefined)} onChange={(event) => { setEditingRule({ ...editingRule, value: event.target.value }); setPasteError(undefined); setError(undefined); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveRuleEdit(); } }} onPaste={(event) => { if (/\r?\n/.test(event.clipboardData.getData('text'))) { event.preventDefault(); setPasteError('一次只能添加一条规则。'); } }} />
                    </Chip>}
                    <Button isIconOnly aria-label="添加域名规则" size="sm" type="button" variant="tertiary" onPress={beginAddRule}><Plus size={16} strokeWidth={2} /></Button>
                  </div>
                  {error && <span className="text-sm font-normal text-danger">{error}</span>}
                </div>
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="p-0 text-sm font-medium">标签组颜色</legend>
                  <div className="color-palette" aria-label="标签组颜色">
                    {paletteColors.map((color) => (
                      <button key={color} aria-label={color} aria-pressed={draft.color === color} className={`color-choice color-${color}`} data-selected={draft.color === color} type="button" onClick={() => { setDraft({ ...draft, color: color as GroupColor }); setError(undefined); }} />
                    ))}
                  </div>
                </fieldset>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onPress={cancelEdit}>取消</Button>
                  <Button type="submit"><Check size={17} strokeWidth={2} />{editingId ? '保存修改' : '保存分组'}</Button>
                </div>
              </form>
            </Card.Content>
          </Card>}
        </div>
      </div>
    </main>
  );
}
