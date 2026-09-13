export const QUOTATION_COMPLETION_RULE_ID = 'system-quotation-completion-routing';
export const QUOTATION_COMPLETION_RULE_CATEGORY = 'SYSTEM_QUOTATION_COMPLETION_ROUTING';
export const QUOTATION_COMPLETION_RULE_TITLE = 'انتخاب نحوه دریافت نتیجه استعلام';
export const DEFAULT_QUOTATION_COMPLETION_PROMPT = 'اطلاعات لازم را دارم. ترجیح می‌دهید کارشناس با شما تماس بگیرد یا قیمت پس از بررسی همین‌جا در چت اعلام شود؟';
export const LEGACY_QUOTATION_CALL_SUCCESS = 'اوکی، کارشناس حداکثر تا ۵ دقیقهٔ دیگر با شما تماس می‌گیرد.';
export const LEGACY_QUOTATION_CHAT_SUCCESS = 'اوکی، کارشناس قیمت را بررسی می‌کند و به‌محض آماده‌شدن همین‌جا به شما اعلام می‌کنیم.';

export type QuotationCompletionRuleConfig = {
  version: 1;
  choicePrompt: string;
  callSuccess: string;
  chatSuccess: string;
  failure: string;
  failedTerminal: string;
  callSubmitted: string;
  chatSubmitted: string;
};

export const DEFAULT_QUOTATION_COMPLETION_CONFIG: QuotationCompletionRuleConfig = {
  version: 1,
  choicePrompt: DEFAULT_QUOTATION_COMPLETION_PROMPT,
  callSuccess: 'حتماً، درخواست تماس با کارشناس ثبت شد{{slaText}}.',
  chatSuccess: 'حتماً، کارشناس قیمت را بررسی می‌کند{{slaText}} و همین‌جا در چت با شما در ارتباط خواهد بود.',
  failure: 'در تکمیل ثبت درخواست و اعلان به کارشناس مشکلی پیش آمد. فعلاً نمی‌توانم زمان تماس یا اعلام قیمت را تأیید کنم؛ اطلاعات شما محفوظ است.',
  failedTerminal: 'ثبت درخواست در مرحلهٔ قبل کامل نشد. اطلاعات استعلام محفوظ است؛ در صورت تمایل می‌توانید درخواست کنید ثبت دوباره انجام شود.',
  callSubmitted: 'درخواست تماس با کارشناس قبلاً ثبت شده است.',
  chatSubmitted: 'درخواست بررسی و اعلام قیمت در چت قبلاً ثبت شده است.',
};

const COMPLETION_KEYS = ['choicePrompt', 'callSuccess', 'chatSuccess', 'failure', 'failedTerminal', 'callSubmitted', 'chatSubmitted'] as const;

export function parseQuotationCompletionRule(value: unknown): QuotationCompletionRuleConfig | null {
  if (typeof value === 'string' && value.trim() && !value.trim().startsWith('{')) {
    return { ...DEFAULT_QUOTATION_COMPLETION_CONFIG, choicePrompt: value.trim() };
  }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>).version !== 1) return null;
    const result = { ...DEFAULT_QUOTATION_COMPLETION_CONFIG, ...(parsed as Partial<QuotationCompletionRuleConfig>) };
    const variablesAreSafe = COMPLETION_KEYS.every(key => {
      if (typeof result[key] !== 'string' || !result[key].trim()) return false;
      return [...result[key].matchAll(/{{\s*([^{}]+?)\s*}}/g)]
        .every(match => ['slaText', 'slaMinutes'].includes(match[1].trim()));
    });
    return variablesAreSafe ? result : null;
  } catch { return null; }
}

export function serializeQuotationCompletionRule(value: QuotationCompletionRuleConfig): string {
  if (!parseQuotationCompletionRule(value)) throw new Error('تنظیمات مرحله پایانی استعلام نامعتبر است.');
  return JSON.stringify(value, null, 2);
}

export function renderQuotationCompletionSuccess(template: string, slaMinutes: number | null): string {
  const safeMinutes = Number.isInteger(slaMinutes) && Number(slaMinutes) > 0 && Number(slaMinutes) <= 1440
    ? Number(slaMinutes)
    : null;
  const slaText = safeMinutes ? ` و حداکثر تا ${safeMinutes.toLocaleString('fa-IR')} دقیقهٔ دیگر` : '';
  return template
    .replace(/{{\s*slaMinutes\s*}}/g, safeMinutes ? safeMinutes.toLocaleString('fa-IR') : '')
    .replace(/{{\s*slaText\s*}}/g, slaText)
    .replace(/\s+([.،؛])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const QUOTATION_COMPLETION_RULE_DIRECTIVE = serializeQuotationCompletionRule(DEFAULT_QUOTATION_COMPLETION_CONFIG);

