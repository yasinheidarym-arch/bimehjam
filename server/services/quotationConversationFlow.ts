import { isDirectQuotationWorkflowRequest } from '../../shared/productPurchaseLink';

export type QuotationTurnQuestion = {
  id?: string;
  title: string;
  aiQuestion?: string | null;
  fieldName: string;
  required: boolean;
  order: number;
  type?: string | null;
  options?: string | string[] | null;
  minVal?: number | null;
  maxVal?: number | null;
  minLength?: number | null;
  maxLength?: number | null;
};

export type QuotationMessageAnalysis = {
  validAnswer: boolean;
  answerValue: string | null;
  asksQuestion: boolean;
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const NUMBER_WORDS: Record<string, string> = {
  صفر: '0', یک: '1', دو: '2', سه: '3', چهار: '4', پنج: '5', شش: '6', هفت: '7', هشت: '8', نه: '9', ده: '10',
};

function normalize(value: string): string {
  return String(value || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .trim()
    .toLowerCase();
}

function asciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    return String(persianIndex >= 0 ? persianIndex : ARABIC_DIGITS.indexOf(digit));
  });
}

function parseOptions(options: QuotationTurnQuestion['options']): string[] {
  if (Array.isArray(options)) return options.map(String).map((item) => item.trim()).filter(Boolean);
  if (!options) return [];
  try {
    const parsed = JSON.parse(options);
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
  } catch {
    return String(options).split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function questionStartIndex(value: string): number {
  const match = /(?:^|[،,.!؛]\s*)(?:راستی\s*)?(?:این\s*)?(?:بیمه\s*)?(?:چه\s|چرا|چطور|چگونه|چقدر|آیا|میشه|می\s*شه|می\s*تونی|می\s*توانید|توضیح\s*(?:بدی|بده|دهید)|مدت\s*بیمه)/.exec(value);
  return match?.index ?? -1;
}

function answerPortion(value: string, asksQuestion: boolean): string {
  if (!asksQuestion) return value.trim();
  const start = questionStartIndex(value);
  if (start > 0) return value.slice(0, start).replace(/[،,.!؛\s]+$/g, '').trim();
  return '';
}

export function analyzeQuotationMessage(
  question: QuotationTurnQuestion | null,
  message: string,
): QuotationMessageAnalysis {
  const raw = String(message || '').trim();
  const value = normalize(raw);
  const asksQuestion = /[؟?]/.test(value) || questionStartIndex(value) >= 0;
  if (!question || !value || isDirectQuotationWorkflowRequest(value)) {
    return { validAnswer: false, answerValue: null, asksQuestion };
  }

  const candidate = answerPortion(value, asksQuestion) || (asksQuestion ? '' : value);
  const type = normalize(question.type || 'text');
  const options = parseOptions(question.options);

  if (['select', 'radio', 'checkbox'].includes(type) || options.length > 0) {
    const source = candidate || (!asksQuestion ? value : '');
    const matches = options.filter((option) => source.includes(normalize(option)));
    return {
      validAnswer: matches.length > 0,
      answerValue: matches.length > 0 ? (type === 'checkbox' ? matches.join('، ') : matches[0]) : null,
      asksQuestion,
    };
  }

  if (type === 'number') {
    const source = asciiDigits(candidate || (!asksQuestion ? value : ''));
    const numericMatch = source.match(/-?\d+(?:[.,]\d+)?/);
    const wordMatch = Object.entries(NUMBER_WORDS).find(([word]) => new RegExp(`(?:^|\\s)${word}(?:\\s|$)`).test(source));
    const answerValue = numericMatch?.[0]?.replace(',', '.') || wordMatch?.[1] || null;
    const numericValue = answerValue === null ? NaN : Number(answerValue);
    const inRange = Number.isFinite(numericValue) &&
      (question.minVal == null || numericValue >= question.minVal) &&
      (question.maxVal == null || numericValue <= question.maxVal);
    return { validAnswer: inRange, answerValue: inRange ? answerValue : null, asksQuestion };
  }

  if (type === 'boolean') {
    const source = candidate || (!asksQuestion ? value : '');
    if (/^(بله|آره|اره|دارد|هست|هستم|دارم)$/.test(source)) return { validAnswer: true, answerValue: 'بله', asksQuestion };
    if (/^(نه|خیر|ندارد|نیست|ندارم)$/.test(source)) return { validAnswer: true, answerValue: 'خیر', asksQuestion };
    return { validAnswer: false, answerValue: null, asksQuestion };
  }

  if (type === 'date') {
    const source = asciiDigits(candidate || (!asksQuestion ? value : ''));
    const match = source.match(/\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b/);
    return { validAnswer: Boolean(match), answerValue: match?.[0] || null, asksQuestion };
  }

  const textAnswer = candidate || (!asksQuestion ? raw : '');
  const validLength = textAnswer.length > 0 &&
    (question.minLength == null || textAnswer.length >= question.minLength) &&
    (question.maxLength == null || textAnswer.length <= question.maxLength);
  return { validAnswer: validLength, answerValue: validLength ? textAnswer.trim() : null, asksQuestion };
}

export function isInsuranceQuotationRequest(message: string): boolean {
  const text = String(message || '').toLowerCase();
  return isDirectQuotationWorkflowRequest(text) || ['قیمت', 'استعلام', 'خرید', 'صدور', 'چقدر میشه', 'چنده', 'چند درمیاد', 'چند در میاد', 'هزینه', 'نرخ', 'محاسبه']
    .some((term) => text.includes(term));
}

export function isExplicitQuotationFormRequest(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  const mentionsForm = /فرم|لینک\s*استعلام|استعلام\s*آنلاین/.test(normalized);
  const requestsIt = /می\s*خوام|میخواهم|می‌خواهم|بفرست|ارسال|باز\s*کن|لینک|از\s*فرم/.test(normalized);
  return mentionsForm && requestsIt;
}

export function quotationQuestionReply(question: QuotationTurnQuestion): string {
  // The administrator-authored AI question is the canonical customer-facing
  // text. Returning it directly keeps the LLM out of question generation and
  // prevents rewording, option injection, or reordering in the quotation flow.
  return question.aiQuestion?.trim() || question.title.trim();
}

export function quotationFormReply(): string {
  return 'حتماً؛ می‌توانید از فرم استعلام همین صفحه استفاده کنید و اطلاعات را مستقیماً در فرم وارد کنید.';
}

export function quotationCompletedReply(): string {
  return 'پاسخ سؤال‌های استعلام کامل شد. برای ثبت درخواست، اطلاعات تماس و تأیید نهایی شما لازم است.';
}

export function currentRequiredQuestion(
  questions: QuotationTurnQuestion[],
  collectedData: Record<string, string>,
): QuotationTurnQuestion | null {
  return [...questions]
    .sort((a, b) => a.order - b.order || String(a.id || '').localeCompare(String(b.id || '')))
    .find((question) => question.required && !collectedData[question.fieldName]) || null;
}

export function captureCurrentQuestionAnswer(
  question: QuotationTurnQuestion | null,
  message: string,
): Record<string, string> {
  const analysis = analyzeQuotationMessage(question, message);
  return question && analysis.validAnswer && analysis.answerValue
    ? { [question.fieldName]: analysis.answerValue }
    : {};
}

export function shouldCaptureCurrentQuestionAnswer(
  sameProductWorkflowActive: boolean,
  question: QuotationTurnQuestion | null,
  message: string,
): boolean {
  return sameProductWorkflowActive && analyzeQuotationMessage(question, message).validAnswer;
}
