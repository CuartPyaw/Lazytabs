export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;

export const MATCH_OPERATORS = ['contains', 'startsWith', 'endsWith', 'equals', 'regex'] as const;
export const MATCH_FIELDS = ['hostname', 'url', 'title', 'titleIgnoreCase'] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];
export type RuleColor = GroupColor | 'auto';
export type RuleOperator = (typeof MATCH_OPERATORS)[number];
export type RuleField = (typeof MATCH_FIELDS)[number];

export type MatchCondition = {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
};

export type MatchTarget = {
  hostname?: string;
  url?: string;
  title?: string;
};

export type Rule = {
  id: string;
  name: string;
  conditions: MatchCondition[];
};

export type Group = {
  id: string;
  name: string;
  color: RuleColor;
  enabled: boolean;
  rules: Rule[];
};

export type GroupInput = Omit<Group, 'id'> & {
  id?: string;
};

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function normalizeValue(value: string, field: RuleField) {
  if (field === 'hostname') return normalizeHostname(value);
  return field === 'titleIgnoreCase' ? value.trim().toLowerCase() : value.trim();
}

function matchesValue(target: string, condition: MatchCondition) {
  const source = normalizeValue(target, condition.field);
  const value = normalizeValue(condition.value, condition.field);

  if (!value) return false;
  if (condition.operator === 'contains') return source.includes(value);
  if (condition.operator === 'startsWith') return source.startsWith(value);
  if (condition.operator === 'endsWith') return source.endsWith(value);
  if (condition.operator === 'equals') return source === value;

  try {
    return new RegExp(condition.value, condition.field === 'hostname' || condition.field === 'titleIgnoreCase' ? 'i' : '').test(source);
  } catch {
    return false;
  }
}

export function matchesCondition(target: MatchTarget, condition: MatchCondition) {
  const value = condition.field === 'hostname' ? target.hostname : condition.field === 'url' ? target.url : target.title;
  return value ? matchesValue(value, condition) : false;
}

export function conditionsOverlap(first: MatchCondition, second: MatchCondition) {
  const firstField = first.field === 'titleIgnoreCase' ? 'title' : first.field;
  const secondField = second.field === 'titleIgnoreCase' ? 'title' : second.field;
  if (firstField !== secondField) return false;

  const comparisonField: RuleField = first.field === 'titleIgnoreCase' || second.field === 'titleIgnoreCase' ? 'titleIgnoreCase' : first.field;
  const left = normalizeValue(first.value, comparisonField);
  const right = normalizeValue(second.value, comparisonField);
  if (!left || !right) return true;
  if (first.operator === 'regex' || second.operator === 'regex') return first.operator === second.operator && first.value === second.value;

  if (first.operator === 'equals') return matchesValue(left, { ...second, field: comparisonField });
  if (second.operator === 'equals') return matchesValue(right, { ...first, field: comparisonField });
  if (first.operator === 'startsWith' && second.operator === 'startsWith') return left.startsWith(right) || right.startsWith(left);
  if (first.operator === 'endsWith' && second.operator === 'endsWith') return left.endsWith(right) || right.endsWith(left);
  if (first.operator === 'contains' && second.operator === 'contains') return left.includes(right) || right.includes(left);
  if (first.operator === 'contains') return right.includes(left);
  if (second.operator === 'contains') return left.includes(right);

  // ponytail: this rejects only statically provable overlaps; use regex automata if exhaustive conflict detection becomes necessary.
  return false;
}

export function validateCondition(condition: MatchCondition) {
  if (!condition.value.trim()) return '请输入匹配值。';

  if (condition.operator === 'regex') {
    try {
      new RegExp(condition.value, 'i');
    } catch {
      return '请输入有效的正则表达式。';
    }
  }
}

export function findGroupConflict(candidate: GroupInput, groups: Group[]) {
  if (!candidate.enabled) return undefined;

  return groups.find((group) =>
    group.enabled
    && group.id !== candidate.id
    && candidate.rules.some((rule) => rule.conditions.some((condition) => group.rules.some((existing) => existing.conditions.some((other) => conditionsOverlap(condition, other))))),
  )?.name;
}

export function validateGroup(candidate: GroupInput, groups: Group[]) {
  const conditionError = candidate.rules.flatMap((rule) => rule.conditions.map(validateCondition)).find(Boolean);
  if (conditionError) return conditionError;
  if (!candidate.name.trim()) return '请输入分组名称。';
  if (!candidate.rules.length) return '请至少添加一条匹配规则。';
  if (candidate.rules.some((rule) => !rule.name.trim())) return '请输入规则名称。';
  if (groups.some((group) => group.id !== candidate.id && group.name.trim() === candidate.name.trim())) return '分组名称已存在。';

  const conflict = findGroupConflict(candidate, groups);
  return conflict ? `规则冲突：可能会与“${conflict}”同时匹配。` : undefined;
}

export function matchingGroup(target: MatchTarget, groups: Group[]) {
  return groups.find((group) => group.enabled && group.rules.some((rule) => rule.conditions.some((condition) => matchesCondition(target, condition))));
}
