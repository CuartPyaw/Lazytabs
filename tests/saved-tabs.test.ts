import { describe, expect, it } from 'vitest';

import { normalizeSavedTabGroups, parseSavedTabLines, serializeSavedTabLines, todayDayKey } from '../src/lib/saved-tabs';

describe('saved tabs day groups, import and export', () => {
  it('parses dated lines, defaults missing dates to today, and skips invalid rows', () => {
    const result = parseSavedTabLines('2099-01-01 | https://example.com/one | One\nnot-a-url\nchrome://settings\nhttps://example.com/two | Two | Docs\n2099-01-02 | https://example.com/three | Three');

    expect(result).toMatchObject({
      skipped: 2,
      days: {
        '2099-01-01': [{ url: 'https://example.com/one', title: 'One' }],
        [todayDayKey()]: [{ url: 'https://example.com/two', title: 'Two | Docs' }],
        '2099-01-02': [{ url: 'https://example.com/three', title: 'Three' }],
      },
    });
    expect(Object.values(result.days).flat()[0].id).toEqual(expect.any(String));
  });

  it('serializes day groups as dated lines sorted descending', () => {
    expect(serializeSavedTabLines([{ id: 'outer', name: '默认收纳组', createdAt: 1, tabs: [], groups: [
      { id: 'day-one', name: '2099-01-01', createdAt: 1, kind: 'day' as const, tabs: [{ id: 'one', url: 'https://example.com/one', title: 'One' }] },
      { id: 'day-two', name: '2099-01-02', createdAt: 2, kind: 'day' as const, tabs: [{ id: 'two', url: 'https://example.com/two', title: 'Two' }] },
    ] }])).toBe('2099-01-02 | https://example.com/two | Two\n2099-01-01 | https://example.com/one | One');
  });

  it('includes nested sub-block tabs under their day in exports', () => {
    expect(serializeSavedTabLines([{ id: 'outer', name: '默认收纳组', createdAt: 1, tabs: [], groups: [{ id: 'day', name: '2099-01-01', createdAt: 1, kind: 'day' as const, tabs: [], groups: [{ id: 'inner', name: '视频', color: 'blue', createdAt: 1, tabs: [{ id: 'two', url: 'https://example.com/two', title: 'Two' }] }] }] }])).toBe('2099-01-01 | https://example.com/two | Two');
  });

  it('migrates legacy tabs into today and keeps browser group sub-blocks', () => {
    const [group] = normalizeSavedTabGroups([{ id: 'outer', name: '默认收纳组', createdAt: 1, tabs: [{ id: 'flat', url: 'https://example.com/a', title: 'A' }], groups: [{ id: 'video', name: '视频', color: 'blue' as const, createdAt: 1, tabs: [{ id: 'saved', url: 'https://example.com/v', title: 'V' }] }] }]);

    const today = group.groups?.find((item) => item.kind === 'day' && item.name === todayDayKey());
    expect(group.tabs).toEqual([]);
    expect(today?.tabs).toMatchObject([{ url: 'https://example.com/a' }]);
    expect(today?.groups).toMatchObject([{ name: '视频', color: 'blue', tabs: [{ url: 'https://example.com/v' }] }]);
  });

  it('keeps day groups sorted descending and normalizes idempotently', () => {
    const first = normalizeSavedTabGroups([{ id: 'outer', name: '默认收纳组', createdAt: 1, tabs: [], groups: [
      { id: 'day-one', name: '2026-08-01', createdAt: 1, kind: 'day' as const, tabs: [{ id: 'one', url: 'https://example.com/one', title: 'One' }] },
      { id: 'day-two', name: '2026-08-02', createdAt: 2, kind: 'day' as const, tabs: [{ id: 'two', url: 'https://example.com/two', title: 'Two' }] },
    ] }]);

    expect(first[0].groups?.map((group) => group.name)).toEqual(['2026-08-02', '2026-08-01']);
    expect(normalizeSavedTabGroups(first)).toEqual(first);
  });
});
