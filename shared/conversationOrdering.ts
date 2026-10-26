export type ConversationActivity = {
  id: string;
  lastMessageAt?: Date | string | number | null;
  createdAt: Date | string | number;
};

function timestamp(value: Date | string | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function conversationActivityTime(conversation: ConversationActivity): number {
  return timestamp(conversation.lastMessageAt) || timestamp(conversation.createdAt);
}

export function compareConversationActivity(
  left: ConversationActivity,
  right: ConversationActivity,
): number {
  const activityDifference = conversationActivityTime(right) - conversationActivityTime(left);
  return activityDifference || left.id.localeCompare(right.id);
}

export function sortConversationsByActivity<T extends ConversationActivity>(conversations: T[]): T[] {
  return [...conversations].sort(compareConversationActivity);
}

export function conversationPageIds(
  conversations: ConversationActivity[],
  page: number,
  limit: number,
): string[] {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const offset = (safePage - 1) * safeLimit;
  return sortConversationsByActivity(conversations)
    .slice(offset, offset + safeLimit)
    .map((conversation) => conversation.id);
}
