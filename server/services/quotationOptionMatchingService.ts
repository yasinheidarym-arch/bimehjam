import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { resolveQuotationMoney } from './quotationMoney';

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
const NUMBER_SCALES: Record<string, number> = { صد: 100, هزار: 1_000, میلیون: 1_000_000, میلیارد: 1_000_000_000 };
const ANSWER_UNITS = new Set([
  'سال', 'ساله', 'ماه', 'ماهه', 'هفته', 'هفته ای', 'روز', 'روزه',
  'طبقه', 'دستگاه', 'واحد', 'نفر', 'متر', 'مترمربع', 'متر مربع',
  'تومان', 'تومن', 'ریال', 'عدد',
]);
export function normalizeQuotationOptionText(value: unknown): string {
  return String(value || '')
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persianIndex = PERSIAN_DIGITS.indexOf(digit);
      return String(persianIndex >= 0 ? persianIndex : ARABIC_DIGITS.indexOf(digit));
    })
    .replace(/ي/g, 'ی')
    .replace(/٫/g, '.')
    .replace(/٬/g, '')
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, value => value.replace(/,/g, ''))
    .replace(/ك/g, 'ک')
    .replace(/ۀ|ة/g, 'ه')
    .replace(/‌/g, ' ')
    .replace(/(یک|یه|يه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)(سال|ساله|طبقه|دستگاه|واحد|ماه|روز|نفر|متر)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function quotationQuestionOptions(question: QuotationTurnQuestion): CanonicalQuotationOption[] {
  let values: unknown[] = [];
  if (Array.isArray(question.options)) values = question.options;
  else if (question.options) {
    try {
      const parsed = JSON.parse(question.options);
      if (Array.isArray(parsed)) values = parsed;
    } catch {
      values = String(question.options).split(',');
    }
  }
  return values.flatMap((raw, index) => {
    if (typeof raw === 'string') return [{ id: `option-${index + 1}`, value: raw.trim() }];
    if (raw && typeof raw === 'object') {
      const item = raw as Record<string, unknown>;
      if (typeof item.value === 'string') return [{ id: typeof item.id === 'string' ? item.id : `option-${index + 1}`, value: item.value.trim() }];
    }
    return [];
  }).filter((item) => item.value);
}

export function numbersIn(value: string, requireAnswerShape = false): number[] {
  const normalized = normalizeQuotationOptionText(value);
  if (requireAnswerShape && /^(نه|آره|اره|بله|خیر)$/.test(normalized)) return [];
  const numeric = [...normalized.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((match) => Number(match[0].replace(',', '.')));
  if (numeric.length > 0) return numeric.filter(Number.isFinite);
  const tokens = normalized.split(/[\s،,.!؟?؛:()\-_/]+/).filter(Boolean);
  if (requireAnswerShape) {
    const hasUnit = [...ANSWER_UNITS].some(unit => normalized.includes(unit));
    const allowedFillers = new Set(['و', 'نیم', 'حدود', 'حدودا', 'حدوداً', 'تقریبا', 'تقریباً']);
    const isBareNumberPhrase = tokens.every((token) => NUMBER_UNITS[token] !== undefined || NUMBER_SCALES[token] !== undefined || allowedFillers.has(token));
    if (!hasUnit && !isBareNumberPhrase) return [];
  }
  const numericTokens = tokens.filter(token => NUMBER_UNITS[token] !== undefined || NUMBER_SCALES[token] !== undefined || token === 'و' || token === 'نیم');
  if (!numericTokens.length) return [];
  let total = 0;
  let group = 0;
  let sawNumber = false;
  for (const token of numericTokens) {
    if (token === 'و') continue;
    if (token === 'نیم') { group += 0.5; sawNumber = true; continue; }
    if (token === 'صد') { group = (group || 1) * 100; sawNumber = true; continue; }
    const scale = NUMBER_SCALES[token];
    if (scale && scale >= 1_000) {
      total += (group || 1) * scale;
      group = 0;
      sawNumber = true;
      continue;
    }
    const number = NUMBER_UNITS[token];
    if (number !== undefined) { group += number; sawNumber = true; }
  }
  return sawNumber ? [total + group] : [];
}

export function isPlainQuotationNumber(value: string): boolean {
  const tokens = normalizeQuotationOptionText(value).replace(/-?\d+(?:[.,٫]\d+)?/g, ' ').split(/\s+/).filter(Boolean);
  const units = new Set(['و', 'نیم', ...ANSWER_UNITS, 'تا', 'حدود', 'حدودا', 'تقریبا', 'است', 'هست', 'دارم', 'داریم']);
  return tokens.every(token => NUMBER_UNITS[token] !== undefined || NUMBER_SCALES[token] !== undefined || units.has(token));
}

type CanonicalDuration = { days: number; sourceValue: number; unit: 'day' | 'week' | 'month' | 'year' };

function durationIn(value: string): CanonicalDuration | null {
  const normalized = normalizeQuotationOptionText(value);
  const units: Array<{ pattern: RegExp; unit: CanonicalDuration['unit']; days: number }> = [
    { pattern: /سال(?:ه)?/u, unit: 'year', days: 365 },
    { pattern: /ماه(?:ه)?/u, unit: 'month', days: 30 },
    { pattern: /هفته(?:\s*ای)?/u, unit: 'week', days: 7 },
    { pattern: /روز(?:ه)?/u, unit: 'day', days: 1 },
  ];
  const matchedUnit = units.find(candidate => candidate.pattern.test(normalized));
  if (!matchedUnit) return null;
  const values = numbersIn(normalized, true);
  if (values.length !== 1 || values[0] < 0) return null;
  return { days: values[0] * matchedUnit.days, sourceValue: values[0], unit: matchedUnit.unit };
}

function durationOptionContains(option: string, duration: CanonicalDuration): boolean {
  const normalized = normalizeQuotationOptionText(option);
  const bound = durationIn(normalized);
  if (!bound) return false;
  if (/کمتر\s*از|زیر/u.test(normalized)) return duration.days < bound.days;
  if (/بیش\s*از|بالاتر\s*از/u.test(normalized)) return duration.days > bound.days;
  if (/حداکثر|^تا\s/u.test(normalized)) return duration.days <= bound.days;
  if (/حداقل|به\s*بالا/u.test(normalized)) return duration.days >= bound.days;
  return duration.days === bound.days;
}

export function canonicalDurationValue(value: string): string | null {
  const duration = durationIn(value);
  if (!duration) return null;
  const suffix = duration.unit === 'year' ? 'Y' : duration.unit === 'month' ? 'M' : duration.unit === 'week' ? 'W' : 'D';
  return `P${duration.sourceValue}${suffix}`;
}

/** Resolves one or more explicit duration expressions to a common day value.
 * Equivalent expressions such as "three months / 90 days" are accepted, while
 * conflicting durations remain ambiguous and are rejected. */
export function canonicalDurationDays(value: string): number | null {
  const normalized = normalizeQuotationOptionText(value);
  const unitPattern = /سال(?:ه)?|ماه(?:ه)?|هفته(?:\s*ای)?|روز(?:ه)?/gu;
  const expressions: string[] = [];
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = unitPattern.exec(normalized)) !== null) {
    expressions.push(normalized.slice(start, match.index + match[0].length));
    start = match.index + match[0].length;
  }
  if (!expressions.length) return null;
  const days = expressions.map(expression => durationIn(expression)?.days).filter((item): item is number => item !== undefined);
  const unique = [...new Set(days)];
  return unique.length === 1 ? unique[0] : null;
}

function optionContainsNumber(option: string, value: number): boolean {
  const normalized = normalizeQuotationOptionText(option);
  const bounds = numbersIn(normalized);
  if (bounds.length >= 2 && /تا|الی|\-|–|—/.test(normalized)) return value >= bounds[0] && value <= bounds[1];
  if (bounds.length === 1) {
    if (/بیش\s*از|بالاتر\s*از/.test(normalized)) return value > bounds[0];
    if (/کمتر\s*از/.test(normalized)) return value < bounds[0];
    if (/^تا\s|حداکثر/.test(normalized)) return value >= 0 && value <= bounds[0];
    if (/به\s*بالا|حداقل/.test(normalized)) return value >= bounds[0];
    return value === bounds[0];
  }
  return false;
}

function deterministicSelection(
  question: QuotationTurnQuestion,
  normalizedAnswer: string,
  options: CanonicalQuotationOption[],
): QuotationOptionSelection | null {
  const fieldName = question.fieldName;
  const money = resolveQuotationMoney(question, normalizedAnswer);
  if (money?.status === 'MATCHED' && money.matchedOption) {
    const option = options.find(item => item.value === money.matchedOption);
    if (option) return matched(fieldName, option, 1, 'DETERMINISTIC');
  }
  const declinesCoverage = /(?:هیچ(?:ی|کدام)?|فاقد\s+پوشش|بدون\s+پوشش|نمی\s*(?:خواهم|خوام|خواهیم)|نیاز\s+(?:ندارم|نداریم)|لازم\s+(?:ندارم|نداریم))/u.test(normalizedAnswer);
  if (declinesCoverage) {
    const noneOptions = options.filter(option => /^(?:فاقد\s+پوشش|هیچ(?:‌|\s|-)?کدام)$/u.test(normalizeQuotationOptionText(option.value)));
    if (noneOptions.length === 1) return matched(fieldName, noneOptions[0], 1, 'DETERMINISTIC');
  }
  const hasWord = (text: string, word: string) => (` ${text} `).includes(` ${word} `);
  const exact = options.filter((option) => {
    const normalizedOption = normalizeQuotationOptionText(option.value);
    if (normalizedAnswer === normalizedOption) return true;
    if (/نیست|نیستم|ندارد|ندارم|نباشد/.test(normalizedAnswer)) return false;
    if (hasWord(normalizedAnswer, normalizedOption)) return true;
    if (normalizedAnswer.length >= 3 && hasWord(normalizedOption, normalizedAnswer)) return true;
    return false;
  });
  if (exact.length === 1) return matched(fieldName, exact[0], 0.99, 'DETERMINISTIC');

  const answerDuration = durationIn(normalizedAnswer);
  if (answerDuration && options.every(option => durationIn(option.value))) {
    const durationMatches = options.filter(option => durationOptionContains(option.value, answerDuration));
    if (durationMatches.length === 1) return matched(fieldName, durationMatches[0], 1, 'DETERMINISTIC');
  }

  const answerNumbers = numbersIn(normalizedAnswer, true);
  if (answerNumbers.length === 1 || (answerNumbers.length === 2 && /تا|الی/.test(normalizedAnswer))) {
    const ranged = options.filter((option) => answerNumbers.every((number) => optionContainsNumber(option.value, number)));
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
  const deterministic = deterministicSelection(input.question, normalizedAnswer, options);
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
  const confidence = typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence) && candidate.confidence >= 0 && candidate.confidence <= 1 ? candidate.confidence : 0;
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
