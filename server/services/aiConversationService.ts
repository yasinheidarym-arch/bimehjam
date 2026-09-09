import { buildAiBehaviorSystemPrompt, resolveAiBehaviorRules } from './aiBehaviorRuntime';

/**
 * The admin inspection endpoint now exposes the same minimal contract and
 * freshly-resolved rules that production uses. The removed legacy conversation
 * implementation had its own prompts and was not called by the webhook path.
 */
export async function getActiveSystemPrompt(): Promise<string> {
  const resolution = await resolveAiBehaviorRules({
    channel: 'ADMIN_PREVIEW',
    conversationState: 'GENERAL',
    messageType: 'CUSTOMER_MESSAGE',
    userRole: 'CUSTOMER',
  });
  return buildAiBehaviorSystemPrompt(resolution, 'پیش‌نمایش قرارداد پاسخ‌گویی؛ هیچ عملیات تجاری اجرا نمی‌شود.');
}
