import { Button, Card, Chip, Input, Modal, Radio, RadioGroup, Skeleton, Switch, useTheme } from '@heroui/react';
import { Check, FolderCog, Globe2, Layers3, Palette, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type Group, type GroupColor, type GroupInput, splitPatterns, validateGroup } from '../../src/lib/rules';
import { getSettings, saveSettings, type Settings, type Theme } from '../../src/lib/settings';

const emptyGroup: GroupInput = { name: '', patterns: '', color: 'blue', enabled: true };
const paletteColors: GroupColor[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'grey'];
const themeOptions: { value: Theme; label: string }[] = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

function nextId() {
  return crypto.randomUUID();
}

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>({ enabled: true, collapseGroups: true, organizeAllWindows: false, groups: [], theme: 'system' });
  const [draft, setDraft] = useState<GroupInput>(emptyGroup);
  const [editingId, setEditingId] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [ruleInputs, setRuleInputs] = useState<string[]>(['']);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [activeSection, setActiveSection] = useState<'groups' | 'general' | 'appearance'>('groups');
  const { setTheme } = useTheme();

  useEffect(() => {
    void getSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });

    const handleSettingsChange = (changes: { settings?: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local' || !changes.settings) return;

      const nextSettings = changes.settings.newValue as Settings | undefined;
      if (nextSettings?.groups && nextSettings.theme && typeof nextSettings.collapseGroups === 'boolean' && typeof nextSettings.organizeAllWindows === 'boolean') {
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

  const nameError = error === '请输入分组名称。' || error === '分组名称不能重复。';
  const ruleError = Boolean(error && !nameError);

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

  async function updateCollapseGroups(collapseGroups: boolean) {
    const currentSettings = await getSettings();
    const next = { ...currentSettings, collapseGroups };
    setSettings(next);
    await saveSettings(next);
  }

  async function updateOrganizeAllWindows(organizeAllWindows: boolean) {
    const currentSettings = await getSettings();
    const next = { ...currentSettings, organizeAllWindows };
    setSettings(next);
    await saveSettings(next);
  }

  async function toggleGroup(group: Group) {
    await updateSettings(settings.groups.map((item) => item.id === group.id ? { ...item, enabled: !item.enabled } : item));
  }

  function beginEdit(group: Group) {
    const patterns = group.rules.map((rule) => rule.pattern);
    setDraft({ ...group, patterns: patterns.join('\n') });
    setEditingId(group.id);
    setEditorOpen(true);
    setRuleInputs(patterns);
    setError(undefined);
  }

  function beginCreate() {
    setDraft(emptyGroup);
    setEditingId(undefined);
    setEditorOpen(true);
    setRuleInputs(['']);
    setError(undefined);
  }

  async function removeGroup(id: string) {
    await updateSettings(settings.groups.filter((group) => group.id !== id));
    if (editingId === id) cancelEdit();
  }

  function cancelEdit() {
    setEditorOpen(false);
  }

  function setRules(nextRuleInputs: string[]) {
    setRuleInputs(nextRuleInputs);
    setDraft({ ...draft, patterns: nextRuleInputs.join('\n') });
    setError(undefined);
  }

  async function saveGroup(closeEditor = true) {
    const nextError = validateGroup(draft, settings.groups);
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
    if (closeEditor) cancelEdit();
    else setEditingId(group.id);
  }

  return (
    <main className="min-h-[100dvh] bg-default/35 text-foreground">
      <header className="border-b border-default bg-surface">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Layers3 size={21} strokeWidth={2} /></span>
            <div>
              <h1 className="m-0 text-lg font-semibold">LazyTabs</h1>
              <p className="m-0 mt-0.5 text-sm text-muted">标签页自动分组设置</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="self-start lg:sticky lg:top-6">
          <div className="rounded-xl border border-default bg-surface p-3">
            <button aria-pressed={activeSection === 'groups'} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${activeSection === 'groups' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-default'}`} type="button" onClick={() => setActiveSection('groups')}>
              <FolderCog size={17} strokeWidth={1.8} />
              分组规则
            </button>
            <button aria-pressed={activeSection === 'general'} className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${activeSection === 'general' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-default'}`} type="button" onClick={() => setActiveSection('general')}>
              <Settings2 size={17} strokeWidth={1.8} />
              通用
            </button>
            <button aria-pressed={activeSection === 'appearance'} className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${activeSection === 'appearance' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-default'}`} type="button" onClick={() => setActiveSection('appearance')}>
              <Palette size={17} strokeWidth={1.8} />
              外观
            </button>
          </div>
        </aside>

        <div className="grid gap-6">
          {activeSection === 'general' && <Card>
            <Card.Header>
              <div>
                <Card.Title>通用</Card.Title>
                <Card.Description>调整标签页整理的默认行为。</Card.Description>
              </div>
            </Card.Header>
            <Card.Content className="grid gap-5">
              <Switch aria-label="整理后自动折叠" className="soft-switch" isSelected={settings.collapseGroups} onChange={(collapseGroups) => void updateCollapseGroups(collapseGroups)}>
                <Switch.Content>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  整理后自动折叠
                </Switch.Content>
              </Switch>
              <Switch aria-label="整理全部窗口" className="soft-switch" isSelected={settings.organizeAllWindows} onChange={(organizeAllWindows) => void updateOrganizeAllWindows(organizeAllWindows)}>
                <Switch.Content>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  整理全部窗口
                </Switch.Content>
              </Switch>
            </Card.Content>
          </Card>}

          {activeSection === 'appearance' && <Card>
            <Card.Header>
              <div>
                <Card.Title>外观</Card.Title>
                <Card.Description>调整扩展的显示主题。</Card.Description>
              </div>
            </Card.Header>
            <Card.Content>
              <RadioGroup aria-label="主题" className="grid max-w-lg grid-cols-3 gap-4" value={settings.theme} onChange={(theme) => void updateTheme(theme as Theme)}>
                {themeOptions.map(({ value, label }) => (
                  <Radio key={value} className="w-full" value={value}>
                    <Radio.Content className={({ isSelected }) => `theme-choice ${isSelected ? 'theme-choice-selected' : ''}`}>
                      <span aria-hidden="true" className={`theme-preview theme-preview-${value}`}>
                        <span className="theme-preview-window">
                          <span className="theme-preview-title" />
                          <span className="theme-preview-line" />
                          <span className="theme-preview-line theme-preview-line-short" />
                        </span>
                      </span>
                      <span>{label}</span>
                    </Radio.Content>
                  </Radio>
                ))}
              </RadioGroup>
            </Card.Content>
          </Card>}

          {activeSection === 'groups' && <>
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
            <Modal isOpen={editorOpen} onOpenChange={(isOpen) => { if (!isOpen) cancelEdit(); }}>
              <Modal.Backdrop className="group-editor-backdrop">
                <Modal.Container className="group-editor-container" placement="center" size="lg">
                  <Modal.Dialog className="rounded-3xl p-3">
                    <Modal.Header className="items-center gap-3">
                      <Modal.Heading>{editingId ? '编辑分组' : '添加分组'}</Modal.Heading>
                    </Modal.Header>
                    <form onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); const dialog = event.currentTarget.closest<HTMLElement>('[role="dialog"]'); void saveGroup(false).then(() => dialog?.focus()); } }} onSubmit={(event) => { event.preventDefault(); void saveGroup(); }}>
                      <Modal.Body className="mt-4 grid gap-5">
                        <label className="grid gap-2 text-sm font-medium">分组名称
                          <Input aria-invalid={nameError} className={`w-full rounded-lg border border-default bg-default/35 px-4 shadow-none ${nameError ? 'border-danger' : ''}`} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(undefined); }} placeholder="代码" />
                        </label>
                        <div className="grid gap-2 text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <span id="domain-rules-label">域名规则</span>
                            <Chip size="sm" variant="soft">{ruleInputs.length} 条</Chip>
                          </div>
                          <div className="grid gap-2">
                            {ruleInputs.map((value, index) => (
                              <div className="flex items-center gap-2" key={index}>
                                <Input aria-invalid={ruleError} aria-label="域名规则" className="w-full rounded-lg border border-default bg-default/35 px-4 shadow-none" placeholder="example.com" value={value} onChange={(event) => setRules(ruleInputs.map((rule, itemIndex) => itemIndex === index ? event.target.value : rule))} />
                                {ruleInputs.length > 1 && <Button isIconOnly aria-label={`删除第 ${index + 1} 条域名规则`} size="sm" type="button" variant="tertiary" onPress={() => setRules(ruleInputs.filter((_, itemIndex) => itemIndex !== index))}><X size={16} strokeWidth={2} /></Button>}
                              </div>
                            ))}
                          </div>
                          <Button fullWidth size="sm" type="button" variant="secondary" onPress={() => setRules([...ruleInputs, ''])}><Plus size={16} strokeWidth={2} /> 添加域名规则</Button>
                          {error && <span className="text-sm font-normal text-danger">{error}</span>}
                        </div>
                        <div className="grid gap-2 text-sm font-medium">
                          <span>标签组颜色</span>
                          <div aria-label="标签组颜色" className="color-palette">
                            {paletteColors.map((color) => (
                              <button key={color} aria-label={color} aria-pressed={draft.color === color} className={`color-choice color-${color}`} data-selected={draft.color === color} type="button" onClick={() => { setDraft({ ...draft, color }); setError(undefined); }} />
                            ))}
                          </div>
                        </div>
                      </Modal.Body>
                      <Modal.Footer className="mt-5 border-t border-default pt-4">
                        <Button type="button" variant="secondary" onPress={cancelEdit}>取消</Button>
                        <Button type="submit"><Check size={17} strokeWidth={2} />保存</Button>
                      </Modal.Footer>
                    </form>
                  </Modal.Dialog>
                </Modal.Container>
              </Modal.Backdrop>
            </Modal>
          </>}
        </div>
      </div>
    </main>
  );
}
