export const GREETING_COALESCE_WINDOW_MS = 700;

export type GreetingCoalescingMessage = {
  id: string;
  content: string;
  createdAt: Date;
  greetingOnly: boolean;
};

export function coalesceConsecutiveGreetingMessages(
  triggerMessageId: string,
  messages: GreetingCoalescingMessage[],
  windowMs = GREETING_COALESCE_WINDOW_MS,
) {
  const ordered = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const triggerIndex = ordered.findIndex(message => message.id === triggerMessageId);
  const trigger = triggerIndex >= 0 ? ordered[triggerIndex] : null;
  if (!trigger?.greetingOnly) return null;

  const sourceMessageIds = [trigger.id];
  let selected = trigger;
  for (const message of ordered.slice(triggerIndex + 1)) {
    if (message.createdAt.getTime() - trigger.createdAt.getTime() > windowMs) break;
    if (!message.greetingOnly) break;
    sourceMessageIds.push(message.id);
    selected = message;
  }

  return { messageId: selected.id, userMessageContent: selected.content, sourceMessageIds };
}
