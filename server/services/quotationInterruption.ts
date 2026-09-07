import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { isQuotationHelpRequest, quotationQuestionHelp } from './quotationQuestionHelp';

export type QuotationGuidanceSource = 'QUESTION_HELP_TEXT' | 'PRODUCT_KNOWLEDGE' | 'FIELD_SCHEMA' | 'EXPERT_REVIEW';

export async function resolveQuotationGuidance(input: {
  message: string; knowledge: string;
  question: QuotationTurnQuestion;
  select: (context: { message: string; question: QuotationTurnQuestion; knowledge: string }) => Promise<unknown>;
}): Promise<{ text: string; source: QuotationGuidanceSource }> {
  if (input.question.helpText?.trim()) {
    return { text: quotationQuestionHelp(input.question), source: 'QUESTION_HELP_TEXT' };
  }

  if (input.knowledge.trim()) {
    try {
      const raw = await input.select({ message: input.message, question: input.question, knowledge: input.knowledge });
      const candidate = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const passages = Array.isArray(candidate.passages) ? candidate.passages : [];
      const valid = passages.filter((passage): passage is string =>
        typeof passage === 'string' &&
        passage.trim().length >= 8 &&
        passage.length <= 1200 &&
        input.knowledge.includes(passage) &&
        !/[؟?]|کد\s*یکتا|ثبت\s*شد|ارسال\s*شد|کمتر\s*از\s*\d+\s*دقیقه/.test(passage)
      );
      if (valid.length) return { text: [...new Set(valid)].slice(0, 2).join('\n'), source: 'PRODUCT_KNOWLEDGE' };
    } catch {
      // A model/provider failure must not interrupt or advance the questionnaire.
    }
  }

  const generic = quotationQuestionHelp(input.question);
  if (generic.trim()) return { text: generic, source: 'FIELD_SCHEMA' };
  return {
    text: `جزئیات تخصصی مربوط به «${input.question.title}» نیاز به بررسی کارشناس دارد.`,
    source: 'EXPERT_REVIEW',
  };
}

/** Operational guidance uses the field schema; insurance claims remain grounded in knowledge. */
export async function explainQuotationInterruption(input: {
  message: string; knowledge: string;
  question?: QuotationTurnQuestion | null;
  select: (context: { message: string; question?: QuotationTurnQuestion | null; knowledge: string }) => Promise<unknown>;
}): Promise<string> {
  if (input.question && isQuotationHelpRequest(input.message)) {
    return (await resolveQuotationGuidance({
      ...input,
      question: input.question,
      select: context => input.select(context),
    })).text;
  }
  const fallback = 'پاسخ تخصصی این بخش در محتوای محصول ثبت نشده و نیاز به بررسی کارشناس دارد. سؤال استعلام فعلی و پاسخ‌های قبلی محفوظ می‌ماند.';
  if (!input.knowledge.trim()) return fallback;
  try {
    const raw = await input.select(input);
    const candidate = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const passages = Array.isArray(candidate.passages) ? candidate.passages : [];
    const valid = passages.filter((passage): passage is string =>
      typeof passage === 'string' && passage.trim().length >= 8 && passage.length <= 1200 &&
      input.knowledge.includes(passage) && !/[؟?]|کد\s*یکتا|ثبت\s*شد|ارسال\s*شد|کمتر\s*از\s*\d+\s*دقیقه/.test(passage)
    );
    return valid.length ? [...new Set(valid)].slice(0, 2).join('\n') : fallback;
  } catch {
    return fallback;
  }
}
