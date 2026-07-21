import { Button, Card, Chip, Input, ListBox, Modal, Radio, RadioGroup, Select, Skeleton, Switch, useTheme } from '@heroui/react';
import { Check, CircleMinus, CirclePlus, FolderCog, Globe2, Layers3, Palette, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type MatchCondition, type Rule, type RuleColor, type RuleField, type RuleInput, type RuleOperator, validateRule } from '../../src/lib/rules';
import { getSettings, saveSettings, type Settings, type Theme } from '../../src/lib/settings';

const operatorLabels: Record<RuleOperator, string> = {
  contains: '包含',
  startsWith: '前缀为',
  endsWith: '后缀为',
  equals: '完全相等',
  regex: '正则匹配',
};

const fieldLabels: Record<RuleField, string> = {
  hostname: '域名部分',
  url: '完整URL',
  title: '页面标题',
  titleIgnoreCase: '页面标题 (忽略大小写)',
};

const colorOptions: Array<{ value: RuleColor; label: string }> = [
  { value: 'auto', label: '自动（随机）' },
  { value: 'blue', label: '蓝色' },
  { value: 'red', label: '红色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'pink', label: '粉色' },
  { value: 'purple', label: '紫色' },
  { value: 'cyan', label: '青色' },
  { value: 'orange', label: '橙色' },
  { value: 'grey', label: '灰色' },
];

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

function nextId() {
  return crypto.randomUUID();
}

function emptyCondition(): MatchCondition {
  return { id: nextId(), field: 'hostname', operator: 'contains', value: '' };
}

function emptyRule(): RuleInput {
  return { name: '', groupName: '', color: 'auto', enabled: true, conditions: [emptyCondition()] };
}

function describeConditions(conditions: MatchCondition[]) {
  return conditions.map((condition) => `${fieldLabels[condition.field]}${operatorLabels[condition.operator]}“${condition.value}”`).join('；');
}

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>({ enabled: true, collapseGroups: true, organizeAllWindows: false, rules: [], theme: 'system' });
  const [draft, setDraft] = useState<RuleInput>(emptyRule);
  const [editingId, setEditingId] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [activeSection, setActiveSection] = useState<'rules' | 'general' | 'appearance'>('rules');
  const { setTheme } = useTheme();

  useEffect(() => {
    void getSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });

    const handleSettingsChange = (changes: { settings?: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local' || !changes.settings) return;

      const nextSettings = changes.settings.newValue as Settings | undefined;
      if (nextSettings?.rules && nextSettings.theme && typeof nextSettings.collapseGroups === 'boolean' && typeof nextSettings.organizeAllWindows === 'boolean') {
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

  const ruleNameError = error === '请输入规则名称。';
  const groupNameError = error === '请输入分组名称。';
  const conditionError = Boolean(error && !ruleNameError && !groupNameError);

  async function updateSettings(rules: Rule[]) {
    const currentSettings = await getSettings();
    const next = { ...currentSettings, rules };
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

  async function toggleRule(rule: Rule) {
    await updateSettings(settings.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item));
  }

  function beginEdit(rule: Rule) {
    setDraft({ ...rule, conditions: rule.conditions.map((condition) => ({ ...condition })) });
    setEditingId(rule.id);
    setEditorOpen(true);
    setError(undefined);
  }

  function beginCreate() {
    setDraft(emptyRule());
    setEditingId(undefined);
    setEditorOpen(true);
    setError(undefined);
  }

  async function removeRule(id: string) {
    await updateSettings(settings.rules.filter((rule) => rule.id !== id));
    if (editingId === id) cancelEdit();
  }

  function cancelEdit() {
    setEditorOpen(false);
  }

  function setConditions(conditions: MatchCondition[]) {
    setDraft({ ...draft, conditions });
    setError(undefined);
  }

  function updateCondition(index: number, update: Partial<MatchCondition>) {
    setConditions(draft.conditions.map((condition, itemIndex) => itemIndex === index ? { ...condition, ...update } : condition));
  }

  async function saveRule() {
    const nextError = validateRule(draft, settings.rules);
    setError(nextError);
    if (nextError) return;

    const rule: Rule = {
      ...draft,
      id: editingId ?? nextId(),
      name: draft.name.trim(),
      groupName: draft.groupName.trim(),
      conditions: draft.conditions.map((condition) => ({ ...condition, id: condition.id || nextId(), value: condition.value.trim() })),
    };
    const rules = editingId ? settings.rules.map((item) => item.id === rule.id ? rule : item) : [...settings.rules, rule];
    await updateSettings(rules);
    cancelEdit();
  }

  return (
    <main className="min-h-[100dvh] bg-default/35 text-foreground">
      <header className="border-b border-default bg-surface">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Layers3 size={21} strokeWidth={2} /></span>
            <div>
              <h1 className="m-0 text-lg font-semibold">LazyTabs</h1>
              <p className="m-0 mt-0.5 text-sm text-muted">标签页自动分组设置</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="self-start lg:sticky lg:top-6">
          <div className="rounded-lg border border-default bg-surface p-3">
            <button aria-pressed={activeSection === 'rules'} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium ${activeSection === 'rules' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-default'}`} type="button" onClick={() => setActiveSection('rules')}>
              <FolderCog size={17} strokeWidth={1.8} />
              分组规则
            </button>
            <button aria-pressed={activeSection === 'general'} className={`mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium ${activeSection === 'general' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-default'}`} type="button" onClick={() => setActiveSection('general')}>
              <Settings2 size={17} strokeWidth={1.8} />
              通用
            </button>
            <button aria-pressed={activeSection === 'appearance'} className={`mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium ${activeSection === 'appearance' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-default'}`} type="button" onClick={() => setActiveSection('appearance')}>
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
                <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control>整理后自动折叠</Switch.Content>
              </Switch>
              <Switch aria-label="整理全部窗口" className="soft-switch" isSelected={settings.organizeAllWindows} onChange={(organizeAllWindows) => void updateOrganizeAllWindows(organizeAllWindows)}>
                <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control>整理全部窗口</Switch.Content>
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
                      <span aria-hidden="true" className={`theme-preview theme-preview-${value}`}><span className="theme-preview-window"><span className="theme-preview-title" /><span className="theme-preview-line" /><span className="theme-preview-line theme-preview-line-short" /></span></span>
                      <span>{label}</span>
                    </Radio.Content>
                  </Radio>
                ))}
              </RadioGroup>
            </Card.Content>
          </Card>}

          {activeSection === 'rules' && <>
            <Card>
              <Card.Header className="flex items-start justify-between gap-4">
                <div>
                  <Card.Title>分组规则</Card.Title>
                  <Card.Description>每条规则可包含多条匹配条件。</Card.Description>
                </div>
                <Button size="sm" onPress={beginCreate}><Plus size={17} strokeWidth={1.9} /> 添加规则</Button>
              </Card.Header>
              <Card.Content>
                {!loaded && <div className="grid gap-3"><Skeleton className="h-16 rounded-md" /><Skeleton className="h-16 rounded-md" /></div>}
                {loaded && settings.rules.length === 0 && (
                  <div className="grid place-items-center py-12 text-center">
                    <span className="grid size-11 place-items-center rounded-lg bg-default text-muted"><Globe2 size={21} strokeWidth={1.7} /></span>
                    <p className="mb-0 mt-4 font-medium">还没有规则</p>
                    <p className="mb-0 mt-1 text-sm text-muted">添加规则和匹配条件开始自动整理。</p>
                  </div>
                )}
                {loaded && settings.rules.length > 0 && <div className="divide-y divide-default border-y border-default">
                  {settings.rules.map((rule) => (
                    <div className="flex min-h-20 flex-wrap items-center gap-4 py-3" key={rule.id}>
                      <Switch aria-label={`启用 ${rule.name}`} className="soft-switch" isSelected={rule.enabled} onChange={() => void toggleRule(rule)}>
                        <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
                      </Switch>
                      <div className="min-w-48 flex-1">
                        <p className="m-0 text-sm font-medium">{rule.name}</p>
                        <p className="m-0 mt-1 text-sm text-muted">{describeConditions(rule.conditions)}</p>
                      </div>
                      <Chip size="sm" variant="soft">{rule.groupName}</Chip>
                      <div className="ml-auto flex gap-1">
                        <Button isIconOnly aria-label={`编辑 ${rule.name}`} size="sm" variant="tertiary" onPress={() => beginEdit(rule)}><Pencil size={16} strokeWidth={1.8} /></Button>
                        <Button isIconOnly aria-label={`删除 ${rule.name}`} size="sm" variant="tertiary" onPress={() => void removeRule(rule.id)}><Trash2 size={16} strokeWidth={1.8} /></Button>
                      </div>
                    </div>
                  ))}
                </div>}
              </Card.Content>
            </Card>
            <Modal isOpen={editorOpen} onOpenChange={(isOpen) => { if (!isOpen) cancelEdit(); }}>
              <Modal.Backdrop className="group-editor-backdrop">
                <Modal.Container className="group-editor-container" placement="center" size="lg">
                  <Modal.Dialog className="w-full max-w-2xl rounded-lg p-0">
                    <Modal.Header className="items-center gap-3 border-b border-default px-4 py-3">
                      <Modal.Heading>{editingId ? '编辑规则' : '添加规则'}</Modal.Heading>
                    </Modal.Header>
                    <form onSubmit={(event) => { event.preventDefault(); void saveRule(); }}>
                      <Modal.Body className="mt-0 grid gap-4 px-4 py-5">
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(144px,1fr))]">
                          <label className="grid gap-2 text-sm font-medium">规则名称
                            <Input aria-invalid={ruleNameError} className={`w-full rounded-md border border-default bg-default/35 px-3 shadow-none ${ruleNameError ? 'border-danger' : ''}`} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(undefined); }} placeholder="描述你的规则" />
                          </label>
                          <label className="grid gap-2 text-sm font-medium">分组名称
                            <Input aria-invalid={groupNameError} className={`w-full rounded-md border border-default bg-default/35 px-3 shadow-none ${groupNameError ? 'border-danger' : ''}`} value={draft.groupName} onChange={(event) => { setDraft({ ...draft, groupName: event.target.value }); setError(undefined); }} placeholder="一个尽量短的名字" />
                          </label>
                          <label className="grid gap-2 text-sm font-medium">分组颜色
                            <Select aria-label="分组颜色" className="w-full" selectedKey={draft.color} onSelectionChange={(color) => {
                              if (typeof color === 'string') { setDraft({ ...draft, color: color as RuleColor }); setError(undefined); }
                            }}>
                              <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                              <Select.Popover><ListBox>{colorOptions.map((option) => <ListBox.Item id={option.value} key={option.value}>{option.label}</ListBox.Item>)}</ListBox></Select.Popover>
                            </Select>
                          </label>
                        </div>
                        <div className="grid gap-2 text-sm font-medium">
                          <span>匹配规则</span>
                          <div className="grid gap-2">
                            {draft.conditions.map((condition, index) => (
                              <div className="grid grid-cols-1 items-center gap-2 sm:[grid-template-columns:12rem_9rem_minmax(0,1fr)_auto]" key={condition.id}>
                                <Select aria-label="匹配字段" className="w-48 shrink-0" selectedKey={condition.field} onSelectionChange={(field) => {
                                  if (typeof field === 'string') updateCondition(index, { field: field as RuleField });
                                }}>
                                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                                  <Select.Popover><ListBox>{Object.entries(fieldLabels).map(([value, label]) => <ListBox.Item id={value} key={value}>{label}</ListBox.Item>)}</ListBox></Select.Popover>
                                </Select>
                                <Select aria-label="匹配方式" className="w-36 shrink-0" selectedKey={condition.operator} onSelectionChange={(operator) => {
                                  if (typeof operator === 'string') updateCondition(index, { operator: operator as RuleOperator });
                                }}>
                                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                                  <Select.Popover><ListBox>{Object.entries(operatorLabels).map(([value, label]) => <ListBox.Item id={value} key={value}>{label}</ListBox.Item>)}</ListBox></Select.Popover>
                                </Select>
                                <Input aria-invalid={conditionError} aria-label="匹配值" className={`w-full min-w-0 rounded-md border border-default bg-default/35 px-3 shadow-none ${conditionError ? 'border-danger' : ''}`} placeholder="例如 github" value={condition.value} onChange={(event) => updateCondition(index, { value: event.target.value })} />
                                <div className="flex items-center justify-self-end gap-2">
                                  <button aria-label="添加匹配规则" className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" title="添加匹配规则" type="button" onClick={() => setConditions([...draft.conditions, emptyCondition()])}><CirclePlus size={20} strokeWidth={2.1} /></button>
                                  {draft.conditions.length > 1 && <button aria-label={`删除第 ${index + 1} 条匹配规则`} className="grid size-5 shrink-0 place-items-center rounded-full bg-danger text-danger-foreground" title="删除匹配规则" type="button" onClick={() => setConditions(draft.conditions.filter((_, itemIndex) => itemIndex !== index))}><CircleMinus size={20} strokeWidth={2.1} /></button>}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="m-0 text-sm font-normal text-muted">任一条件匹配后，标签页会自动加入这个分组。</p>
                          {error && <span className="text-sm font-normal text-danger">{error}</span>}
                        </div>
                      </Modal.Body>
                      <Modal.Footer className="mt-0 border-t border-default px-4 py-4">
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
