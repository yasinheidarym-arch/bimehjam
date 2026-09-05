import type { QuotationTurnQuestion } from './quotationConversationFlow';

export type CanonicalQuotationOption = { id: string; value: string };
export type QuotationOptionSelection = {
  fieldName: string;
  selectedOptionId: string | null;
  selectedOptionValue: string | null;
  confidence: number;
  status: 'MATCHED' | 'AMBIGUOUS' | 'UNRELATED';
  source: 'DETERMINISTIC' | 'AI' | 'FALLBACK';
};

export type QuotationOptionModelSelector = (input: {
  fieldName: string;
  question: string;
  normalizedAnswer: string;
  options: CanonicalQuotationOption[];
}) => Promise<unknown>;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const NUMBER_UNITS: Record<string, number> = {
  صفر: 0, یک: 1, يه: 1, یه: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9,
  ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19,
  بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, صد: 100,
};
const SEMANTIC_ALIASES: Record<string, string[]> = {
  مسکونی: ['خانه', 'خونه', 'منزل', 'سکونت'],
  تجاری: ['مغازه', 'فروشگاه', 'کسب و کار', 'کسب‌وکار'],
  اداری: ['دفتر', 'اداره', 'شرکت'],
  صنعتی: ['کارخانه', 'کارگاه', 'تولیدی'],
  بله: ['آره', 'اره', 'دارد', 'هست'],
  خیر: ['نه', 'ندارد', 'نیست'],
};

export function normalizeQuotationOptionText(value: unknown): string {
  return String(value || '')
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persianIndex = PERSIAN_DIGITS.indexOf(digit);
      return String(persianIndex >= 0 ? persianIndex : ARABIC_DIGITS.indexOf(digit));
    })
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ|ة/g, 'ه')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function quotationQuestionOptions(question: QuotationTurnQuestion): CanonicalQuotationOption[] {
  let values: string[] = [];
  if (Array.isArray(question.options)) values = question.options.map(String);
  else if (question.options) {
    try {
      const parsed = JSON.parse(question.options);
      if (Array.isArray(parsed)) values = parsed.map(String);
    } catch {
      values = String(question.options).split(',');
    }
  }
  return values.map((value, index) => ({ id: `option-${index + 1}`, value: value.trim() })).filter((item) => item.value);
}

function numbersIn(value: string, requireAnswerShape = false): number[] {
  const normalized = normalizeQuotationOptionText(value);
  const numeric = [...normalized.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((match) => Number(match[0].replace(',', '.')));
  if (numeric.length > 0) return numeric.filter(Number.isFinite);
  const tokens = normalized.split(/[\s،,.!؟?؛:()\-_/]+/).filter(Boolean);
  if (requireAnswerShape) {
    const hasUnit = /سال|ساله|طبقه|دستگاه|واحد|ماه|روز|نفر|متر/.test(normalized);
    const allowedFillers = new Set(['و', 'حدود', 'حدودا', 'حدوداً', 'تقریبا', 'تقریباً']);
    const isBareNumberPhrase = tokens.every((token) => NUMBER_UNITS[token] !== undefined || allowedFillers.has(token));
    if (!hasUnit && !isBareNumberPhrase) return [];
  }
  const found: number[] = [];
  let aggregate: number | null = null;
  for (const token of tokens) {
    if (token === 'و' && aggregate !== null) continue;
    const number = NUMBER_UNITS[token];
    if (number === undefined) {
      if (aggregate !== null) { found.push(aggregate); aggregate = null; }
      continue;
    }
    aggregate = aggregate === null ? number : aggregate + number;
  }
  if (aggregate !== null) found.push(aggregate);
  return found;
}

function optionContainsNumber(option: string, value: number): boolean {
  const normalized = normalizeQuotationOptionText(option);
  const bounds = numbersIn(normalized);
  if (bounds.length >= 2 && /تا|الی|\-|–|—/.test(normalized)) return value >= bounds[0] && value <= bounds[1];
  if (bounds.length === 1) {
    if (/بیش\s*از|بالاتر\s*از/.test(normalized)) return value > bounds[0];
    if (/کمتر\s*از/.test(normalized)) return value < bounds[0];
    if (/^تا\s|حداکثر/.test(normalized)) return value <= bounds[0];
    if (/به\s*بالا|حداقل/.test(normalized)) return value >= bounds[0];
    return value === bounds[0];
  }
  return false;
}

function deterministicSelection(
  fieldName: string,
  normalizedAnswer: string,
  options: CanonicalQuotationOption[],
): QuotationOptionSelection | null {
  const exact = options.filter((option) => {
    const normalizedOption = normalizeQuotationOptionText(option.value);
    if (normalizedAnswer === normalizedOption || normalizedAnswer.includes(normalizedOption)) return true;
    return Object.entries(SEMANTIC_ALIASES).some(([canonical, aliases]) =>
      normalizedOption.includes(canonical) && aliases.some((alias) => normalizedAnswer.includes(normalizeQuotationOptionText(alias))),
    );
  });
  if (exact.length === 1) return matched(fieldName, exact[0], 0.99, 'DETERMINISTIC');

  const answerNumbers = numbersIn(normalizedAnswer, true);
  if (answerNumbers.length === 1) {
    const ranged = options.filter((option) => optionContainsNumber(option.value, answerNumbers[0]));
    if (ranged.length === 1) return matched(fieldName, ranged[0], 0.99, 'DETERMINISTIC');
  }
  return null;
}

function matched(
  fieldName: string,
  option: CanonicalQuotationOption,
  confidence: number,
  source: 'DETERMINISTIC' | 'AI',
): QuotationOptionSelection {
  return {
    fieldName,
    selectedOptionId: option.id,
    selectedOptionValue: option.value,
    confidence,
    status: 'MATCHED',
    source,
  };
}

export async function resolveQuotationOptionSelection(input: {
  question: QuotationTurnQuestion;
  message: string;
  modelSelector?: QuotationOptionModelSelector;
}): Promise<QuotationOptionSelection> {
  const options = quotationQuestionOptions(input.question);
  const normalizedAnswer = normalizeQuotationOptionText(input.message);
  const deterministic = deterministicSelection(input.question.fieldName, normalizedAnswer, options);
  if (deterministic) return deterministic;

  let raw: unknown = null;
  try {
    raw = input.modelSelector ? await input.modelSelector({
      fieldName: input.question.fieldName,
      question: input.question.aiQuestion || input.question.title,
      normalizedAnswer,
      options,
    }) : null;
  } catch {
    raw = null;
  }
  const candidate = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const confidence = Math.max(0, Math.min(1, Number(candidate.confidence) || 0));
  const option = options.find((item) =>
    candidate.fieldName === input.question.fieldName &&
    candidate.selectedOptionId === item.id &&
    candidate.selectedOptionValue === item.value,
  );
  if (option && confidence >= 0.75) return matched(input.question.fieldName, option, confidence, 'AI');
  const ambiguous = confidence >= 0.4 || /حدود|تقریب|فکر\s*کنم|شاید|قدیمی|جدید/.test(normalizedAnswer);
  return {
    fieldName: input.question.fieldName,
    selectedOptionId: null,
    selectedOptionValue: null,
    confidence,
    status: ambiguous ? 'AMBIGUOUS' : 'UNRELATED',
    source: 'FALLBACK',
  };
}

export function quotationOptionFollowup(
  question: QuotationTurnQuestion,
  selection: QuotationOptionSelection,
): string {
  if (selection.status === 'AMBIGUOUS') return `منظورتان برای «${question.title}» دقیقاً کدام بازه یا گزینه است؟`;
  return `لطفاً یکی از گزینه‌های معتبر را انتخاب کنید: ${quotationQuestionOptions(question).map((item) => item.value).join('، ')}`;
}
