export type ConversationOpeningState = {
  version: 1;
  phase: 'OPENING' | 'ACTIVE';
  greetingResponseSent: boolean;
  substantiveMessageSeen: boolean;
  updatedAt: string;
};

export const CONVERSATION_OPENING_WINDOW_MS = 2 * 60 * 1000;

export function readConversationOpeningState(value: unknown): ConversationOpeningState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (state.version !== 1 || !['OPENING', 'ACTIVE'].includes(String(state.phase))) return null;
  if (typeof state.greetingResponseSent !== 'boolean' || typeof state.substantiveMessageSeen !== 'boolean') return null;
  return {
    version: 1,
    phase: state.phase as ConversationOpeningState['phase'],
    greetingResponseSent: state.greetingResponseSent,
    substantiveMessageSeen: state.substantiveMessageSeen,
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date(0).toISOString(),
  };
}

export function advanceConversationOpeningState(
  previous: ConversationOpeningState | null,
  intentFamily: 'GREETING' | 'INFORMATIONAL' | 'SALES_QUOTE' | 'SUPPORT_SERVICE',
  now = new Date(),
) {
  const previousAt = previous ? Date.parse(previous.updatedAt) : Number.NaN;
  const isWithinOpeningWindow = Number.isFinite(previousAt)
    && now.getTime() >= previousAt
    && now.getTime() - previousAt <= CONVERSATION_OPENING_WINDOW_MS;
  const duplicateGreeting = intentFamily === 'GREETING'
    && previous?.phase === 'OPENING'
    && previous.greetingResponseSent
    && !previous.substantiveMessageSeen
    && isWithinOpeningWindow;

  if (intentFamily !== 'GREETING') {
    return {
      duplicateGreeting: false,
      state: {
        version: 1, phase: 'ACTIVE', greetingResponseSent: previous?.greetingResponseSent || false,
        substantiveMessageSeen: true, updatedAt: now.toISOString(),
      } satisfies ConversationOpeningState,
    };
  }

  return {
    duplicateGreeting,
    state: {
      version: 1, phase: previous?.phase === 'ACTIVE' ? 'ACTIVE' : 'OPENING',
      greetingResponseSent: true, substantiveMessageSeen: previous?.substantiveMessageSeen || false,
      updatedAt: now.toISOString(),
    } satisfies ConversationOpeningState,
  };
}
