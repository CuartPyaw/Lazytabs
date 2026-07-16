export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export type Rule = {
  id: string;
  pattern: string;
};

export type Group = {
  id: string;
  name: string;
  color: GroupColor;
  enabled: boolean;
  rules: Rule[];
};

export type GroupInput = Omit<Group, 'id' | 'rules'> & {
  id?: string;
  patterns: string;
};

const wildcardPattern = /^[a-z0-9*.-]+$/i;
const domainPattern = /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export function normalizePattern(pattern: string) {
  return pattern.trim().toLowerCase().replace(/\.$/, '');
}

export function splitPatterns(value: string) {
  return [...new Set(value.split(/\r?\n/).map(normalizePattern).filter(Boolean))];
}

export function validatePattern(value: string) {
  const pattern = normalizePattern(value);

  if (!pattern || !wildcardPattern.test(pattern)) return '域名通配符只能包含字母、数字、连字符、点和 *。';
  if (!domainPattern.test(pattern)) return '域名规则必须是完整域名，或以 *. 开头的子域名通配符。';
}

export function matchesHost(host: string, pattern: string) {
  const normalized = normalizePattern(pattern);
  const normalizedHost = normalizePattern(host);

  if (!normalized.startsWith('*.')) return normalizedHost === normalized;

  const domain = normalized.slice(2);
  return normalizedHost.endsWith(`.${domain}`) && normalizedHost.split('.').length === domain.split('.').length + 1;
}

export function patternsOverlap(first: string, second: string) {
  const left = normalizePattern(first);
  const right = normalizePattern(second);

  if (left === right) return true;
  if (left.startsWith('*.')) return matchesHost(right, left);
  if (right.startsWith('*.')) return matchesHost(left, right);
  return false;
}

export function findRuleConflict(candidate: GroupInput, groups: Group[]) {
  if (!candidate.enabled) return undefined;

  return groups
    .filter((group) => group.enabled && group.id !== candidate.id)
    .flatMap((group) => group.rules)
    .find((rule) => splitPatterns(candidate.patterns).some((pattern) => patternsOverlap(rule.pattern, pattern)))?.pattern;
}

export function validateGroup(candidate: GroupInput, groups: Group[]) {
  const patterns = splitPatterns(candidate.patterns);
  const patternError = patterns.map(validatePattern).find(Boolean) ?? (patterns.length ? undefined : validatePattern(''));
  if (patternError) return patternError;
  if (!candidate.name.trim()) return '请输入分组名称。';
  if (groups.some((group) => group.id !== candidate.id && group.name.trim() === candidate.name.trim())) return '分组名称不能重复。';

  const conflict = findRuleConflict(candidate, groups);
  return conflict ? `规则冲突：该模式会与 ${conflict} 同时匹配。` : undefined;
}

export function matchingGroup(host: string, groups: Group[]) {
  return groups.find((group) => group.enabled && group.rules.some((rule) => matchesHost(host, rule.pattern)));
}
