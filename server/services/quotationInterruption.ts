import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { isQuotationHelpRequest, naturalizeQuotationHelp, quotationHelpResponseRequest, quotationQuestionHelp } from './quotationQuestionHelp';

export type QuotationGuidanceSource = 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE' | 'FIELD_SCHEMA' | 'EXPERT_REVIEW';

type GuidanceGenerator = (context: {
  message: string;
  question: QuotationTurnQuestion;
  knowledge: string;
  source: 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE';
  sourceText: string;
  tone: string;
}) => Promise<unknown>;

function groundedCandidate(raw: unknown, sourceText: string, question: QuotationTurnQuestion): string | null {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).helpResponse : null;
  if (typeof candidate !== 'string') return null;
  const text = candidate.trim();
  if (!text || text.length > 600 || /راهنمای\s+(?:این\s+)?س[ؤو]ال\s*:/u.test(text)) return null;
  if (text.includes(question.aiQuestion || question.title) || text === sourceText.trim()) return null;
  const sourceTerms = new Set(sourceText.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(term => term.length >= 3));
  const grounded = text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).some(term => sourceTerms.has(term));
  if (!grounded) return null;
  const unsupportedClaim = /کد\s*یکتا|ثبت\s*شد|ارسال\s*شد|کمتر\s*از\s*\d+\s*دقیقه|قیمت\s*قطعی/.test(text);
  const forbiddenTone = /(?:کافیه|حالا|بفرست(?:ید)?|همشونو|فقط\s+این\s+کار\s+رو\s+بکن|بگو\s+ببینم)/.test(text);
  const guardedTerms = ['پوشش', 'خسارت', 'قیمت', 'حق بیمه', 'تومان', 'ریال', 'استثنا', 'تعهد'];
  const addsInsuranceFact = guardedTerms.some(term => text.includes(term) && !sourceText.includes(term));
  if (unsupportedClaim || addsInsuranceFact || forbiddenTone) return null;
  return /(?:بفرمایید|اعلام\s*کنید|در\s*نظر\s*بگیرید)/.test(text)
    ? text
    : `${text.replace(/[.。]+$/u, '')}. ${quotationHelpResponseRequest(question)}`;
}

export async function resolveQuotationGuidance(input: {
  message: string; knowledge: string;
  question: QuotationTurnQuestion;
  select: GuidanceGenerator;
  tone?: string;
}): Promise<{ text: string; source: QuotationGuidanceSource }> {
  const tone = input.tone || 'کارشناس حرفه‌ای، محترمانه، صمیمی و غیررسمیِ کنترل‌شده؛ خطاب جمع و بدون عبارت دستوری یا بچگانه';
  if (input.question.helpText?.trim()) {
    const sourceText = input.question.helpText.trim();
    try {
      const generated = await input.select({ ...input, source: 'HELP_TEXT', sourceText, tone });
      const candidate = groundedCandidate(generated, sourceText, input.question);
      if (candidate) return { text: candidate, source: 'HELP_TEXT' };
    } catch {
      // Fall through to a safe conversational restatement.
    }
    return { text: naturalizeQuotationHelp(input.question, sourceText), source: 'HELP_TEXT' };
  }

  if (input.knowledge.trim()) {
    try {
      const raw = await input.select({ message: input.message, question: input.question, knowledge: input.knowledge, source: 'PRODUCT_KNOWLEDGE', sourceText: input.knowledge, tone });
      const candidate = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const response = groundedCandidate(candidate, input.knowledge, input.question);
      if (response) return { text: response, source: 'PRODUCT_KNOWLEDGE' };
      const passages = Array.isArray(candidate.passages) ? candidate.passages : [];
      const valid = passages.filter((passage): passage is string =>
        typeof passage === 'string' &&
        passage.trim().length >= 8 &&
        passage.length <= 1200 &&
        input.knowledge.includes(passage) &&
        !/[؟?]|کد\s*یکتا|ثبت\s*شد|ارسال\s*شد|کمتر\s*از\s*\d+\s*دقیقه/.test(passage)
      );
      if (valid.length) return { text: naturalizeQuotationHelp(input.question, [...new Set(valid)].slice(0, 2).join('\n')), source: 'PRODUCT_KNOWLEDGE' };
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
  select: (context: { message: string; question?: QuotationTurnQuestion | null; knowledge: string; source?: 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE'; sourceText?: string }) => Promise<unknown>;
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
