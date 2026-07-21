import { describe, expect, it } from 'vitest';

import { conditionsOverlap, findRuleConflict, matchesCondition, matchingRule, validateCondition, validateRule } from '../src/lib/rules';

const condition = (operator: 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'regex', value: string) => ({ id: `${operator}-${value}`, field: 'hostname' as const, operator, value });

describe('domain rules', () => {
  it('matches every supported operator without case sensitivity', () => {
    expect(matchesCondition('Api.GitHub.com', condition('contains', 'github'))).toBe(true);
    expect(matchesCondition('api.github.com', condition('startsWith', 'api.'))).toBe(true);
    expect(matchesCondition('api.github.com', condition('endsWith', '.com'))).toBe(true);
    expect(matchesCondition('api.github.com', condition('equals', 'API.GITHUB.COM'))).toBe(true);
    expect(matchesCondition('api.github.com', condition('regex', '^api\\.github\\.com$'))).toBe(true);
  });

  it('matches a rule when any condition matches', () => {
    const rule = {
      id: 'code',
      name: '代码托管',
      groupName: '代码',
      color: 'auto' as const,
      enabled: true,
      conditions: [condition('contains', 'github'), condition('contains', 'gitlab')],
    };

    expect(matchingRule('gitlab.com', [rule])?.name).toBe('代码托管');
    expect(matchingRule('example.com', [rule])).toBeUndefined();
  });

  it('rejects blank and invalid regular-expression conditions', () => {
    expect(validateCondition(condition('contains', ''))).toBe('请输入匹配值。');
    expect(validateCondition(condition('regex', '['))).toBe('请输入有效的正则表达式。');
    expect(validateRule({ name: '', groupName: '代码', color: 'auto', enabled: true, conditions: [condition('equals', 'github.com')] }, [])).toBe('请输入规则名称。');
    expect(validateRule({ name: '代码托管', groupName: '', color: 'auto', enabled: true, conditions: [condition('equals', 'github.com')] }, [])).toBe('请输入分组名称。');
  });

  it('rejects enabled rules that may target different groups for the same host', () => {
    const existing = [{
      id: 'code',
      name: '代码托管',
      groupName: '代码',
      color: 'blue' as const,
      enabled: true,
      conditions: [condition('contains', 'github')],
    }];
    const candidate = { id: 'work', name: 'GitHub 工作', groupName: '工作', color: 'green' as const, enabled: true, conditions: [condition('contains', 'github')] };

    expect(conditionsOverlap(existing[0].conditions[0], candidate.conditions[0])).toBe(true);
    expect(findRuleConflict(candidate, existing)).toBe('代码托管');
    expect(validateRule(candidate, existing)).toBe('规则冲突：可能会与“代码托管”同时匹配。');
  });
});
