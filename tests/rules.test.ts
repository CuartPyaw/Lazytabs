import { describe, expect, it } from 'vitest';

import { findRuleConflict, matchesHost, matchingRule, normalizePattern, patternsOverlap, validateRule } from '../src/lib/rules';

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

  it('only accepts exact domains and left-side subdomain wildcards', () => {
    const input = { groupName: 'code', color: 'blue' as const, enabled: true };

    expect(validateRule({ ...input, pattern: 'github.com' }, [])).toBeUndefined();
    expect(validateRule({ ...input, pattern: '*.github.com' }, [])).toBeUndefined();
    expect(validateRule({ ...input, pattern: '*github.com' }, [])).toBeDefined();
    expect(validateRule({ ...input, pattern: 'git*hub.com' }, [])).toBeDefined();
  });

  it('rejects blank patterns and group names', () => {
    expect(validateRule({ pattern: '', groupName: 'code', color: 'blue', enabled: true }, [])).toBe('域名通配符只能包含字母、数字、连字符、点和 *。');
    expect(validateRule({ pattern: 'github.com', groupName: ' ', color: 'blue', enabled: true }, [])).toBe('请输入分组名称。');
  });

  it('rejects overlapping enabled rules that send tabs to different groups', () => {
    expect(
      findRuleConflict(
        { id: 'new', pattern: 'api.github.com', groupName: 'work', color: 'green', enabled: true },
        [{ id: 'code', pattern: '*.github.com', groupName: 'code', color: 'blue', enabled: true }],
      ),
    ).toBe('*.github.com');
  });

  it('allows overlaps that lead to the same group and color', () => {
    const existing = [{ id: 'code', pattern: '*.github.com', groupName: 'code', color: 'blue' as const, enabled: true }];

    expect(findRuleConflict({ id: 'new', pattern: 'api.github.com', groupName: 'code', color: 'blue', enabled: true }, existing)).toBeUndefined();
    expect(validateRule({ pattern: 'api.github.com', groupName: 'code', color: 'blue', enabled: true }, existing)).toBeUndefined();
    expect(validateRule({ pattern: 'api.github.com', groupName: 'code', color: 'green', enabled: true }, existing)).toBeDefined();
  });

  it('ignores disabled rules when matching and finding conflicts', () => {
    const disabledRule = { id: 'code', pattern: '*.github.com', groupName: 'code', color: 'blue' as const, enabled: false };

    expect(matchingRule('api.github.com', [disabledRule])).toBeUndefined();
    expect(findRuleConflict({ id: 'new', pattern: 'api.github.com', groupName: 'work', color: 'green', enabled: true }, [disabledRule])).toBeUndefined();
    expect(findRuleConflict({ id: 'new', pattern: 'api.github.com', groupName: 'work', color: 'green', enabled: false }, [{ ...disabledRule, enabled: true }])).toBeUndefined();
  });

  it('distinguishes overlapping wildcard patterns from separate domains', () => {
    expect(patternsOverlap('*.github.com', 'api.github.com')).toBe(true);
    expect(patternsOverlap('*.github.com', 'github.com')).toBe(false);
    expect(patternsOverlap('*.github.com', 'api.v1.github.com')).toBe(false);
    expect(patternsOverlap('github.com', 'gitlab.com')).toBe(false);
  });
});
