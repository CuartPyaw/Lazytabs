import { describe, expect, it } from 'vitest';

import { findRuleConflict, matchesHost, patternsOverlap } from '../src/lib/rules';

describe('domain rules', () => {
  it('matches a full hostname with only the supported wildcard syntax', () => {
    expect(matchesHost('api.github.com', '*.github.com')).toBe(true);
    expect(matchesHost('github.com', '*.github.com')).toBe(false);
    expect(matchesHost('github.com', 'github.com')).toBe(true);
  });

  it('rejects overlapping enabled rules that send tabs to different groups', () => {
    expect(
      findRuleConflict(
        { id: 'new', pattern: 'api.github.com', groupName: 'work', color: 'green', enabled: true },
        [{ id: 'code', pattern: '*.github.com', groupName: 'code', color: 'blue', enabled: true }],
      ),
    ).toBe('*.github.com');
  });

  it('allows overlaps that lead to the same group', () => {
    expect(
      findRuleConflict(
        { id: 'new', pattern: 'api.github.com', groupName: 'code', color: 'blue', enabled: true },
        [{ id: 'code', pattern: '*.github.com', groupName: 'code', color: 'blue', enabled: true }],
      ),
    ).toBeUndefined();
  });

  it('distinguishes overlapping wildcard patterns from separate domains', () => {
    expect(patternsOverlap('*.github.com', 'api.github.com')).toBe(true);
    expect(patternsOverlap('*.github.com', 'github.com')).toBe(false);
    expect(patternsOverlap('github.com', 'gitlab.com')).toBe(false);
  });
});
