import { Button, Input, Switch } from '@heroui/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { GROUP_COLORS, type GroupColor, type Rule, type RuleInput, validateRule } from '../../src/lib/rules';
import { getSettings, saveSettings, type Settings } from '../../src/lib/settings';

const emptyRule: RuleInput = { pattern: '', groupName: '', color: 'blue', enabled: true };

function nextId() {
  return crypto.randomUUID();
}

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>({ enabled: true, rules: [] });
  const [draft, setDraft] = useState<RuleInput>(emptyRule);
  const [editingId, setEditingId] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    });
  }, []);

  const error = useMemo(() => validateRule(draft, settings.rules), [draft, settings.rules]);

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
  }

  async function removeRule(id: string) {
    await updateSettings({ ...settings, rules: settings.rules.filter((rule) => rule.id !== id) });
    if (editingId === id) cancelEdit();
  }

  function cancelEdit() {
    setEditingId(undefined);
    setDraft(emptyRule);
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

  if (!loaded) return null;

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-default pb-5">
        <div>
          <h1 className="m-0 text-2xl font-medium">LazyTabs</h1>
          <p className="mb-0 mt-1 text-muted">按域名通配符自动整理 Chrome 标签页</p>
        </div>
        <Switch isSelected={settings.enabled} onChange={setEnabled}>
          <Switch.Control><Switch.Thumb /></Switch.Control>
          自动分组
        </Switch>
      </header>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-medium">规则</h2>
          <Button size="sm" variant="secondary" onPress={cancelEdit}><Plus size={16} /> 新建规则</Button>
        </div>

        <div className="border-y border-default">
          {settings.rules.length === 0 && <p className="my-0 py-6 text-sm text-muted">还没有规则。</p>}
          {settings.rules.map((rule) => (
            <div className="flex min-h-16 flex-wrap items-center gap-3 border-b border-default py-3 last:border-b-0" key={rule.id}>
              <Switch aria-label={`启用 ${rule.pattern}`} isSelected={rule.enabled} onChange={() => void toggleRule(rule)}>
                <Switch.Control><Switch.Thumb /></Switch.Control>
              </Switch>
              <div className="min-w-44 flex-1">
                <code>{rule.pattern}</code>
                <p className="mb-0 mt-1 text-sm text-muted">域名通配符</p>
              </div>
              <div className="flex min-w-28 items-center gap-2"><span className={`group-swatch size-3 rounded color-${rule.color}`} />{rule.groupName}</div>
              <div className="ml-auto flex gap-1">
                <Button isIconOnly aria-label={`编辑 ${rule.pattern}`} size="sm" variant="tertiary" onPress={() => beginEdit(rule)}><Pencil size={16} /></Button>
                <Button isIconOnly aria-label={`删除 ${rule.pattern}`} size="sm" variant="tertiary" onPress={() => void removeRule(rule.id)}><Trash2 size={16} /></Button>
              </div>
            </div>
          ))}
        </div>

        <form className="mt-5 grid gap-4 sm:grid-cols-[1.35fr_1fr_190px_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void saveRule(); }}>
          <label className="grid gap-1.5 text-sm text-muted">域名通配符
            <Input aria-invalid={Boolean(error)} value={draft.pattern} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} placeholder="*.github.com" />
            {error && <span className="text-danger">{error}</span>}
          </label>
          <label className="grid gap-1.5 text-sm text-muted">分组名称
            <Input value={draft.groupName} onChange={(event) => setDraft({ ...draft, groupName: event.target.value })} placeholder="代码" />
          </label>
          <fieldset className="m-0 grid gap-1.5 border-0 p-0 text-sm text-muted">
            <legend className="p-0">标签组颜色</legend>
            <div className="color-palette" aria-label="标签组颜色">
              {GROUP_COLORS.map((color) => (
                <button key={color} className={`color-choice color-${color}`} data-selected={draft.color === color} type="button" aria-label={color} onClick={() => setDraft({ ...draft, color: color as GroupColor })} />
              ))}
            </div>
          </fieldset>
          <Button type="submit" isDisabled={Boolean(error)}>{editingId ? '保存修改' : '保存规则'}</Button>
        </form>
      </section>
    </main>
  );
}
