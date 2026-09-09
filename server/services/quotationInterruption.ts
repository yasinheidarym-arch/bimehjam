import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { isQuotationHelpRequest, naturalizeQuotationHelp, quotationHelpResponseRequest, quotationQuestionHelp } from './quotationQuestionHelp';
import { quotationQuestionOptions } from './quotationOptionMatchingService';

export type QuotationGuidanceSource = 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE' | 'CATEGORY_KNOWLEDGE' | 'GENERAL_MODEL_KNOWLEDGE' | 'FIELD_SCHEMA' | 'HONEST_LIMITATION';

type GuidanceGenerator = (context: {
  message: string;
  question: QuotationTurnQuestion;
  knowledge: string;
  source: 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE' | 'CATEGORY_KNOWLEDGE' | 'GENERAL_MODEL_KNOWLEDGE';
  sourceText: string;
  tone: string;
  helpText?: string;
  productKnowledge?: string;
  categoryKnowledge?: string;
  allowedOptions?: string[];
  behaviorContext?: { channel: string; productId?: string | null; categoryId?: string | null; currentPageUrl?: string | null; intent?: string | null; conversationState?: string | null; quotationState?: string | null; currentField?: string | null; messageType?: string | null; userRole?: string | null };
}) => Promise<unknown>;

const normalize = (value: string) => value.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).toLowerCase();
const words = (value: string) => normalize(value).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(term => /^\d+$/u.test(term) || term.length >= 3);
const LOW_INFORMATION = /^(?:این\s+)?فیلد\s+را\s+(?:بررسی|تکمیل)\s+کنید|(?:لطفا\s+)?یکی\s+از\s+گزینه(?:\s*ها)?\s+را\s+انتخاب\s+کنید/u;

function sourceCanAnswer(sourceText: string, message: string, question: QuotationTurnQuestion, source: 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE' | 'CATEGORY_KNOWLEDGE'): boolean {
  const sourceValue = normalize(sourceText.trim());
  if (!sourceValue || sourceValue.length < 18 || LOW_INFORMATION.test(sourceValue)) return false;
  if (/چیست|چیه|یعنی|منظور/u.test(normalize(message))) {
    const subjectTerms = words(message).filter(term => !['چیست', 'چیه', 'یعنی', 'منظور', 'سوال', 'این'].includes(term));
    if (subjectTerms.length && !subjectTerms.some(term => new Set(words(sourceValue)).has(term))) return false;
  }
  if (source === 'HELP_TEXT' && /چطور|چگونه|چجوری|روش|حساب|محاسبه/u.test(normalize(message))) {
    return /جمع|محاسبه|حساب|شامل|در\s*نظر|واحد|مجموع|روش|گزینه|وارد|مشخص|توضیح/u.test(sourceValue);
  }
  const queryTerms = new Set(words(`${message} ${question.title} ${question.aiQuestion || ''}`).filter(term => !['چیست', 'چیه', 'یعنی', 'منظور', 'سوال', 'پاسخ', 'چطور', 'چگونه'].includes(term)));
  const sourceTerms = new Set(words(sourceValue));
  const overlap = [...queryTerms].filter(term => sourceTerms.has(term));
  if (!overlap.length) return false;
  return true;
}

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
  const responseNumbers = normalize(text).match(/\d+(?:[.,]\d+)?/g) || [];
  const groundedNumbers = new Set(normalize(`${sourceText} ${question.title} ${question.aiQuestion || ''}`).match(/\d+(?:[.,]\d+)?/g) || []);
  if (unsupportedClaim || addsInsuranceFact || forbiddenTone || responseNumbers.some(number => !groundedNumbers.has(number))) return null;
  return /(?:بفرمایید|اعلام\s*کنید|در\s*نظر\s*بگیرید)/.test(text)
    ? text
    : `${text.replace(/[.。]+$/u, '')}. ${quotationHelpResponseRequest(question)}`;
}

function safeGeneralCandidate(raw: unknown, question: QuotationTurnQuestion): string | null {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).helpResponse : null;
  if (typeof candidate !== 'string') return null;
  const text = candidate.trim();
  if (!text || text.length > 600 || text.includes(question.aiQuestion || question.title)) return null;
  if (/(?:کافیه|حالا|بفرست(?:ید)?|همشونو|فقط\s+این\s+کار\s+رو\s+بکن|بگو\s+ببینم)/.test(text)) return null;
  if (/تومان|ریال|درصد|کد\s*یکتا|ثبت\s*شد|ارسال\s*شد|کمتر\s*از\s*\d+\s*دقیقه|حق\s*بیمه|سقف\s*تعهد|استثنا(?:ها|ء)?|شرایط\s*اختصاصی\s*بیمه(?:گر|نامه)/.test(text)) return null;
  const normalizeDigits = (value: string) => value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  const responseNumbers = normalizeDigits(text).match(/\d+(?:[.,]\d+)?/g) || [];
  const allowedNumbers = new Set(normalizeDigits(`${question.title} ${question.aiQuestion || ''}`).match(/\d+(?:[.,]\d+)?/g) || []);
  if (responseNumbers.some(number => !allowedNumbers.has(number))) return null;
  return text;
}

export async function resolveQuotationGuidance(input: {
  message: string; knowledge: string;
  categoryKnowledge?: string;
  question: QuotationTurnQuestion;
  select: GuidanceGenerator;
  tone?: string;
  behaviorContext?: { channel: string; productId?: string | null; categoryId?: string | null; currentPageUrl?: string | null; intent?: string | null; conversationState?: string | null; quotationState?: string | null; currentField?: string | null; messageType?: string | null; userRole?: string | null };
}): Promise<{ text: string; source: QuotationGuidanceSource }> {
  const tone = input.tone || 'کارشناس حرفه‌ای، محترمانه، صمیمی و غیررسمیِ کنترل‌شده؛ خطاب جمع و بدون عبارت دستوری یا بچگانه';
  const helpText = input.question.helpText?.trim() || '';
  const productKnowledge = input.knowledge.trim();
  const categoryKnowledge = input.categoryKnowledge?.trim() || '';
  try {
    const groundedSources = [
      { source: 'HELP_TEXT' as const, text: helpText },
      { source: 'PRODUCT_KNOWLEDGE' as const, text: productKnowledge },
      { source: 'CATEGORY_KNOWLEDGE' as const, text: categoryKnowledge },
    ];
    for (const candidateSource of groundedSources) {
      if (!sourceCanAnswer(candidateSource.text, input.message, input.question, candidateSource.source)) continue;
      const raw = await input.select({
        ...input, source: candidateSource.source, sourceText: candidateSource.text,
        helpText, productKnowledge, categoryKnowledge,
        allowedOptions: quotationQuestionOptions(input.question).map(option => option.value), tone,
        behaviorContext: input.behaviorContext,
      });
      const response = groundedCandidate(raw, candidateSource.text, input.question);
      if (response) return { text: response, source: candidateSource.source };
    }
    const raw = await input.select({
      ...input, source: 'GENERAL_MODEL_KNOWLEDGE', sourceText: '', helpText,
      productKnowledge, categoryKnowledge,
      allowedOptions: quotationQuestionOptions(input.question).map(option => option.value), tone,
      behaviorContext: input.behaviorContext,
    });
    const response = safeGeneralCandidate(raw, input.question);
    if (response) {
      const limitation = raw && typeof raw === 'object' && (raw as Record<string, unknown>).source === 'HONEST_LIMITATION';
      return { text: response, source: limitation ? 'HONEST_LIMITATION' : 'GENERAL_MODEL_KNOWLEDGE' };
    }
  } catch {
    // Provider failure uses only deterministic grounded fallbacks below.
  }

  // When the model is unavailable, never guess. A stored helpText remains the
  // safest field-specific fallback, followed by field schema guidance.
  if (sourceCanAnswer(helpText, input.message, input.question, 'HELP_TEXT')) return { text: naturalizeQuotationHelp(input.question, helpText), source: 'HELP_TEXT' };

  const generic = quotationQuestionHelp(input.question);
  if (generic.trim()) return { text: generic, source: 'FIELD_SCHEMA' };
  return {
    text: `جزئیات تخصصی مربوط به «${input.question.title}» نیاز به بررسی کارشناس دارد.`,
    source: 'HONEST_LIMITATION',
  };
}

/** Operational guidance uses the field schema; insurance claims remain grounded in knowledge. */
export async function explainQuotationInterruption(input: {
  message: string; knowledge: string;
  question?: QuotationTurnQuestion | null;
  select: (context: { message: string; question?: QuotationTurnQuestion | null; knowledge: string; source?: 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE' | 'CATEGORY_KNOWLEDGE' | 'GENERAL_MODEL_KNOWLEDGE'; sourceText?: string }) => Promise<unknown>;
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
