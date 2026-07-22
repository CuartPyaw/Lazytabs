import { describe, expect, it } from 'vitest';

import { conditionsOverlap, findGroupConflict, matchesCondition, matchingGroup, validateCondition, validateGroup, type Group, type RuleField } from '../src/lib/rules';

const condition = (operator: 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'regex', value: string, field: RuleField = 'hostname') => ({ id: `${field}-${operator}-${value}`, field, operator, value });

describe('domain rules', () => {
  it('matches every supported operator without case sensitivity', () => {
    const target = { hostname: 'Api.GitHub.com', url: 'https://github.com/Codex', title: 'Codex Guide' };

    expect(matchesCondition(target, condition('contains', 'github'))).toBe(true);
    expect(matchesCondition(target, condition('startsWith', 'api.'))).toBe(true);
    expect(matchesCondition(target, condition('endsWith', '.com'))).toBe(true);
    expect(matchesCondition(target, condition('equals', 'API.GITHUB.COM'))).toBe(true);
    expect(matchesCondition(target, condition('regex', '^api\\.github\\.com$'))).toBe(true);
    expect(matchesCondition(target, condition('contains', 'github.com/Codex', 'url'))).toBe(true);
    expect(matchesCondition(target, condition('contains', 'codex', 'title'))).toBe(false);
    expect(matchesCondition(target, condition('contains', 'codex', 'titleIgnoreCase'))).toBe(true);
  });

  it('matches a group when any contained rule matches', () => {
    const group: Group = {
      id: 'code', name: '代码', color: 'auto', enabled: true,
      rules: [{ id: 'hosting', name: '代码托管', conditions: [condition('contains', 'github'), condition('contains', 'gitlab')] }],
    };

    expect(matchingGroup({ hostname: 'gitlab.com' }, [group])?.name).toBe('代码');
    expect(matchingGroup({ hostname: 'example.com' }, [group])).toBeUndefined();
  });

  it('rejects blank conditions, duplicate names, and conflicting groups', () => {
    const existing: Group[] = [{
      id: 'code', name: '代码', color: 'blue', enabled: true,
      rules: [{ id: 'hosting', name: '代码托管', conditions: [condition('contains', 'github')] }],
    }];
    const candidate = { id: 'work', name: '工作', color: 'green' as const, enabled: true, rules: [{ id: 'api', name: '工作 API', conditions: [condition('contains', 'github')] }] };

    expect(validateCondition(condition('contains', ''))).toBe('请输入匹配值。');
    expect(validateCondition(condition('regex', '['))).toBe('请输入有效的正则表达式。');
    expect(conditionsOverlap(existing[0].rules[0].conditions[0], candidate.rules[0].conditions[0])).toBe(true);
    expect(findGroupConflict(candidate, existing)).toBe('代码');
    expect(validateGroup(candidate, existing)).toBe('规则冲突：可能会与“代码”同时匹配。');
    expect(validateGroup({ ...candidate, name: '代码', enabled: false }, existing)).toBe('分组名称已存在。');
  });
});
