import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { isQuotationHelpRequest, quotationQuestionHelp } from './quotationQuestionHelp';
/** Operational guidance uses the field schema; insurance claims remain grounded in knowledge. */
export async function explainQuotationInterruption(input: {
  message: string; knowledge: string;
  question?: QuotationTurnQuestion | null;
  select: (context: { message: string; knowledge: string }) => Promise<unknown>;
}): Promise<string> {
  if (input.question && isQuotationHelpRequest(input.message)) return quotationQuestionHelp(input.question);
  const fallback = 'برای این مورد توضیح قابل اتکایی در محتوای همین محصول ندارم؛ می‌توانید راهنمایی کارشناس بخواهید. پاسخ‌های قبلی شما محفوظ است.';
  if (!input.knowledge.trim()) return fallback;
  try {
    const raw = await input.select({ message: input.message, knowledge: input.knowledge });
    const candidate = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const passages = Array.isArray(candidate.passages) ? candidate.passages : [];
    const valid = passages.filter((p): p is string => typeof p === 'string' && p.trim().length >= 8 && p.length <= 1200 && input.knowledge.includes(p) && !/[؟?]|کد یکتا|ثبت شد|ارسال شد|دقیقه/.test(p));
    return valid.length ? [...new Set(valid)].slice(0, 2).join('\n') : fallback;
  } catch { return fallback; }
}
