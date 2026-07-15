export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export type Rule = {
  id: string;
  pattern: string;
  groupName: string;
  color: GroupColor;
  enabled: boolean;
};

export type RuleInput = Omit<Rule, 'id'> & { id?: string };

const wildcardPattern = /^[a-z0-9*.-]+$/i;

export function normalizePattern(pattern: string) {
  return pattern.trim().toLowerCase().replace(/\.$/, '');
}

export function matchesHost(host: string, pattern: string) {
  const normalized = normalizePattern(pattern);
  const expression = normalized
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${expression}$`, 'i').test(host.toLowerCase());
}

export function patternsOverlap(first: string, second: string) {
  const left = normalizePattern(first);
  const right = normalizePattern(second);
  const queue: Array<[number, number]> = [[0, 0]];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const [leftIndex, rightIndex] = queue.shift()!;
    const key = `${leftIndex}:${rightIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (leftIndex === left.length && rightIndex === right.length) return true;
    const leftChar = left[leftIndex];
    const rightChar = right[rightIndex];

    if (leftChar === '*') queue.push([leftIndex + 1, rightIndex]);
    if (rightChar === '*') queue.push([leftIndex, rightIndex + 1]);
    if (!leftChar || !rightChar) continue;

    const compatible = leftChar === '*' || rightChar === '*' || leftChar === rightChar;
    if (compatible) {
      queue.push([leftChar === '*' ? leftIndex : leftIndex + 1, rightChar === '*' ? rightIndex : rightIndex + 1]);
    }
  }

  return false;
}

export function findRuleConflict(candidate: RuleInput, rules: Rule[]) {
  if (!candidate.enabled) return undefined;

  return rules.find((rule) =>
    rule.enabled &&
    rule.id !== candidate.id &&
    rule.groupName.trim() !== candidate.groupName.trim() &&
    patternsOverlap(rule.pattern, candidate.pattern),
  )?.pattern;
}

export function validateRule(candidate: RuleInput, rules: Rule[]) {
  const pattern = normalizePattern(candidate.pattern);
  const groupName = candidate.groupName.trim();

  if (!pattern || !wildcardPattern.test(pattern)) return '域名通配符只能包含字母、数字、连字符、点和 *。';
  if (!groupName) return '请输入分组名称。';
  if (candidate.enabled && rules.some((rule) => rule.enabled && rule.id !== candidate.id && rule.groupName.trim() === groupName && rule.color !== candidate.color)) {
    return '同名目标分组必须使用相同颜色。';
  }

  const conflict = findRuleConflict({ ...candidate, pattern, groupName }, rules);
  return conflict ? `规则冲突：该模式会与 ${conflict} 同时匹配。` : undefined;
}

export function matchingRule(host: string, rules: Rule[]) {
  return rules.find((rule) => rule.enabled && matchesHost(host, rule.pattern));
}
