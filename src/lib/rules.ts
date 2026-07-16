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
const domainPattern = /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export function normalizePattern(pattern: string) {
  return pattern.trim().toLowerCase().replace(/\.$/, '');
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
  if (!domainPattern.test(pattern)) return '域名规则必须是完整域名，或以 *. 开头的子域名通配符。';
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
