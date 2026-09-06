import type { QuotationTurnQuestion } from './quotationConversationFlow';

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
const WORDS: Record<string, number> = {
  صفر: 0, یک: 1, يه: 1, یه: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9,
  ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19,
  بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90,
  صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, ششصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900,
};

function normalize(value: unknown): string {
  return String(value || '').replace(/[۰-۹٠-٩]/g, digit => {
    const fa = FA.indexOf(digit); return String(fa >= 0 ? fa : AR.indexOf(digit));
  }).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ')
    .replace(/٬/g, '').replace(/٫/g, '.').replace(/\b\d{1,3}(?:,\d{3})+\b/g, n => n.replace(/,/g, ''))
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function scalar(value: string): number | null {
  const clean = value.trim().replace(/^(?:و\s*)+/, '').trim();
  if (/^-?\d+(?:\.\d+)?$/.test(clean)) return Number(clean);
  if (/^(?:یک|يه|یه)\s+و\s+نیم$/.test(clean)) return 1.5;
  if (clean === 'نیم') return 0.5;
  const tokens = clean.split(/\s+و\s+|\s+/).filter(Boolean);
  if (!tokens.length || tokens.some(token => WORDS[token] === undefined)) return null;
  return tokens.reduce((sum, token) => sum + WORDS[token], 0);
}

export function parseQuotationMoney(value: unknown, inferColloquialMillion = false): number | null {
  const text = normalize(value);
  if (!text) return null;
  const units = /(.*?)(میلیارد|میلیون|هزار)(?=\s|تومان|تومن|و|$)/g;
  let total = 0;
  let found = false;
  let consumed = 0;
  for (const match of text.matchAll(units)) {
    const amount = scalar(match[1]);
    if (amount == null || amount < 0) return null;
    total += amount * (match[2] === 'میلیارد' ? 1_000_000_000 : match[2] === 'میلیون' ? 1_000_000 : 1_000);
    found = true;
    consumed = (match.index || 0) + match[0].length;
  }
  if (found) {
    const remainder = text.slice(consumed).replace(/^(?:\s*و\s*)?/, '').replace(/تومان|تومن/g, '').trim();
    return !remainder && Number.isSafeInteger(total) ? total : null;
  }
  const amount = scalar(text.replace(/تومان|تومن/g, '').trim());
  if (amount == null || amount < 0) return null;
  const result = inferColloquialMillion && amount > 0 && amount < 100_000 && /تومان|تومن/.test(text) ? amount * 1_000_000 : amount;
  return Number.isSafeInteger(result) ? result : null;
}

function optionValues(question: QuotationTurnQuestion): string[] {
  if (Array.isArray(question.options)) return question.options.flatMap((raw) => typeof raw === 'string' ? [raw] : raw && typeof raw === 'object' && typeof (raw as { value?: unknown }).value === 'string' ? [(raw as { value: string }).value] : []);
  if (!question.options) return [];
  try { const parsed = JSON.parse(question.options); return Array.isArray(parsed) ? parsed.flatMap((raw) => typeof raw === 'string' ? [raw] : raw && typeof raw === 'object' && typeof raw.value === 'string' ? [raw.value] : []) : []; }
  catch { return String(question.options).split(',').map(v => v.trim()).filter(Boolean); }
}

export function isQuotationMoneyQuestion(question: QuotationTurnQuestion): boolean {
  const values = optionValues(question);
  const parsedOptions = values.filter(value => parseQuotationMoney(value) != null);
  return /تومان|تومن|مبلغ|سرمایه|ارزش|تعهد.*مالی|سقف.*پوشش/.test(normalize(`${question.title} ${question.aiQuestion || ''}`)) ||
    (values.length > 0 && parsedOptions.length === values.length);
}

export function isAmbiguousQuotationMoney(question: QuotationTurnQuestion, message: string): boolean {
  return isQuotationMoneyQuestion(question) && /میلیارد|میلیون|هزار|تومان|تومن/.test(normalize(message)) && parseQuotationMoney(message, true) == null;
}

export type QuotationMoneyDecision = {
  amountToman: number; formattedAmount: string; status: 'MATCHED' | 'OUT_OF_OPTIONS';
  matchedOption?: string; nearbyOptions: string[];
};

export function resolveQuotationMoney(question: QuotationTurnQuestion, message: string): QuotationMoneyDecision | null {
  const values = optionValues(question);
  const optionAmounts = values.map(value => ({ value, amount: parseQuotationMoney(value) })).filter((item): item is { value: string; amount: number } => item.amount != null);
  if (!isQuotationMoneyQuestion(question) || !values.length || !/\d|صفر|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|صد|نیم/.test(normalize(message))) return null;
  const millionScale = optionAmounts.length > 0 && optionAmounts.every(option => option.amount >= 1_000_000);
  const amount = parseQuotationMoney(message, millionScale);
  if (amount == null) return null;
  const exact = optionAmounts.find(option => option.amount === amount);
  return {
    amountToman: amount,
    formattedAmount: `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`,
    status: exact ? 'MATCHED' : 'OUT_OF_OPTIONS',
    matchedOption: exact?.value,
    nearbyOptions: [...optionAmounts].sort((a, b) => Math.abs(a.amount - amount) - Math.abs(b.amount - amount) || a.amount - b.amount).slice(0, 3).map(option => option.value),
  };
}

export function quotationMoneyMismatchReply(decision: QuotationMoneyDecision): string {
  return `مبلغ ${decision.formattedAmount} را متوجه شدم، اما این مبلغ جزو گزینه‌های ثبت‌شدهٔ سؤال نیست.${decision.nearbyOptions.length ? ` گزینه‌های معتبر نزدیک: ${decision.nearbyOptions.join('، ')}.` : ''} لطفاً یکی از گزینه‌های واقعی را انتخاب کنید.`;
}
