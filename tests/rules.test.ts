import { describe, expect, it } from 'vitest';

import { findRuleConflict, matchesHost, matchingGroup, normalizePattern, patternsOverlap, splitPatterns, validateGroup, validatePattern } from '../src/lib/rules';

describe('domain rules', () => {
  it('normalizes patterns before they are validated or matched', () => {
    expect(normalizePattern('  API.GitHub.COM.  ')).toBe('api.github.com');
  });

  it('matches exact domains and one-level subdomain wildcards', () => {
    expect(matchesHost('api.github.com', '*.github.com')).toBe(true);
    expect(matchesHost('github.com', '*.github.com')).toBe(false);
    expect(matchesHost('api.v1.github.com', '*.github.com')).toBe(false);
    expect(matchesHost('github.com', 'github.com')).toBe(true);
    expect(matchesHost('api.github.com', 'github.com')).toBe(false);
  });

  it('accepts a group with several valid domain rules', () => {
    expect(splitPatterns('github.com\n*.github.com\ngithub.com')).toEqual(['github.com', '*.github.com']);
    expect(validatePattern('github.com')).toBeUndefined();
    expect(validatePattern('*.github.com')).toBeUndefined();
    expect(validateGroup({ name: '代码', color: 'blue', enabled: true, patterns: 'github.com\n*.github.com' }, [])).toBeUndefined();
    expect(validateGroup({ name: '代码', color: 'blue', enabled: true, patterns: '*github.com' }, [])).toBeDefined();
  });

  it('rejects blank patterns and group names', () => {
    expect(validateGroup({ name: '代码', color: 'blue', enabled: true, patterns: '' }, [])).toBe('域名通配符只能包含字母、数字、连字符、点和 *。');
    expect(validateGroup({ name: ' ', color: 'blue', enabled: true, patterns: 'github.com' }, [])).toBe('请输入分组名称。');
  });

  it('rejects overlapping enabled rules in different groups', () => {
    const groups = [{ id: 'code', name: '代码', color: 'blue' as const, enabled: true, rules: [{ id: 'github', pattern: '*.github.com' }] }];
    expect(findRuleConflict({ id: 'work', name: '工作', color: 'green', enabled: true, patterns: 'api.github.com' }, groups)).toBe('*.github.com');
  });

  it('matches a group when any of its rules matches', () => {
    const groups = [{ id: 'code', name: '代码', color: 'blue' as const, enabled: true, rules: [{ id: 'github', pattern: 'github.com' }, { id: 'gitlab', pattern: 'gitlab.com' }] }];
    expect(matchingGroup('gitlab.com', groups)?.name).toBe('代码');
    expect(matchingGroup('github.com', [{ ...groups[0], enabled: false }])).toBeUndefined();
  });

  it('distinguishes overlapping wildcard patterns from separate domains', () => {
    expect(patternsOverlap('*.github.com', 'api.github.com')).toBe(true);
    expect(patternsOverlap('*.github.com', 'github.com')).toBe(false);
    expect(patternsOverlap('*.github.com', 'api.v1.github.com')).toBe(false);
    expect(patternsOverlap('github.com', 'gitlab.com')).toBe(false);
  });
});
