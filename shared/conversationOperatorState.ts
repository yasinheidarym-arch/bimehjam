export type ConversationAiStatus = 'AI_HANDLING' | 'WAITING_OPERATOR';

export function conversationStatusAfterAiTurn(result: {
  handoffCompleted?: boolean;
  deferHumanHandoff?: boolean;
}): ConversationAiStatus {
  return result.handoffCompleted === true && result.deferHumanHandoff !== true
    ? 'WAITING_OPERATOR'
    : 'AI_HANDLING';
}
