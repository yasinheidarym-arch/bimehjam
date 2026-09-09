export const AI_BEHAVIOR_RUNTIME_VERSION = 1 as const;

export const AI_BEHAVIOR_ALLOWED_ACTIONS = [
  'NONE',
  'SAVE_VALID_ANSWER',
  'KEEP_CURRENT_QUESTION',
  'ADVANCE_QUESTION',
  'CORRECT_ANSWER',
  'START_NEW_QUOTATION',
  'PAUSE_QUOTATION',
  'REQUEST_HUMAN',
  'RETRY_SUBMISSION',
] as const;

export type AiBehaviorAllowedAction = typeof AI_BEHAVIOR_ALLOWED_ACTIONS[number];

export type AiBehaviorRuleScope = {
  channels?: string[];
  productIds?: string[];
  categoryIds?: string[];
  intents?: string[];
  conversationStates?: string[];
  quotationStates?: string[];
  fieldNames?: string[];
  messageTypes?: string[];
  userRoles?: string[];
};

export type AiBehaviorRuleEnvelope = {
  version: 1;
  instruction: string;
  scope?: AiBehaviorRuleScope;
  conflictKey?: string;
};

const cleanList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((item): item is string => typeof item === 'string')
    .map(item => item.trim()).filter(Boolean).slice(0, 100);
  return result.length ? result : undefined;
};

export function parseAiBehaviorRuleEnvelope(value: unknown): AiBehaviorRuleEnvelope | null {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.version !== AI_BEHAVIOR_RUNTIME_VERSION || typeof parsed.instruction !== 'string' || !parsed.instruction.trim()) return null;
    const rawScope = parsed.scope && typeof parsed.scope === 'object' ? parsed.scope as Record<string, unknown> : {};
    return {
      version: AI_BEHAVIOR_RUNTIME_VERSION,
      instruction: parsed.instruction.trim(),
      scope: {
        channels: cleanList(rawScope.channels),
        productIds: cleanList(rawScope.productIds),
        categoryIds: cleanList(rawScope.categoryIds),
        intents: cleanList(rawScope.intents),
        conversationStates: cleanList(rawScope.conversationStates),
        quotationStates: cleanList(rawScope.quotationStates),
        fieldNames: cleanList(rawScope.fieldNames),
        messageTypes: cleanList(rawScope.messageTypes),
        userRoles: cleanList(rawScope.userRoles),
      },
      conflictKey: typeof parsed.conflictKey === 'string' && parsed.conflictKey.trim() ? parsed.conflictKey.trim() : undefined,
    };
  } catch {
    return null;
  }
}

export function serializeAiBehaviorRuleEnvelope(value: AiBehaviorRuleEnvelope): string {
  if (!value.instruction.trim()) throw new Error('متن قانون رفتار نمی‌تواند خالی باشد.');
  return JSON.stringify({
    version: AI_BEHAVIOR_RUNTIME_VERSION,
    instruction: value.instruction.trim(),
    scope: value.scope || {},
    ...(value.conflictKey?.trim() ? { conflictKey: value.conflictKey.trim() } : {}),
  }, null, 2);
}

export function readableAiBehaviorDirective(value: string): string {
  return parseAiBehaviorRuleEnvelope(value)?.instruction || value;
}
