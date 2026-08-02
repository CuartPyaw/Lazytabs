import { describe, expect, it } from 'vitest';

import { parseOneTabUrls, serializeOneTabUrls } from '../src/lib/saved-tabs';

describe('saved tabs import and export', () => {
  it('parses OneTab URL lines and skips invalid rows', () => {
    const result = parseOneTabUrls('https://example.com/one | One\nnot-a-url\nchrome://settings\nhttps://example.com/two | Two | Docs');

    expect(result).toMatchObject({
      skipped: 2,
      tabs: [
        { url: 'https://example.com/one', title: 'One' },
        { url: 'https://example.com/two', title: 'Two | Docs' },
      ],
    });
    expect(result.tabs[0].id).toEqual(expect.any(String));
  });

  it('serializes saved tabs as OneTab URL lines', () => {
    expect(serializeOneTabUrls([{ id: 'group', name: '默认收纳组', createdAt: 1, tabs: [
      { id: 'one', url: 'https://example.com/one', title: 'One' },
      { id: 'two', url: 'https://example.com/two', title: 'Two' },
    ] }])).toBe('https://example.com/one | One\nhttps://example.com/two | Two');
  });

  it('includes nested group tabs in OneTab exports', () => {
    expect(serializeOneTabUrls([{ id: 'outer', name: '默认收纳组', createdAt: 1, tabs: [{ id: 'one', url: 'https://example.com/one', title: 'One' }], groups: [{ id: 'inner', name: '视频', color: 'blue', createdAt: 1, tabs: [{ id: 'two', url: 'https://example.com/two', title: 'Two' }] }] }])).toBe('https://example.com/one | One\nhttps://example.com/two | Two');
  });
});
