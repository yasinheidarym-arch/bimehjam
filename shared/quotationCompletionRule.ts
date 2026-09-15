export const QUOTATION_COMPLETION_RULE_ID = 'system-quotation-completion-routing';
export const QUOTATION_COMPLETION_RULE_CATEGORY = 'SYSTEM_QUOTATION_COMPLETION_ROUTING';
export const QUOTATION_COMPLETION_RULE_TITLE = 'انتخاب نحوه دریافت نتیجه استعلام';
export const DEFAULT_QUOTATION_COMPLETION_PROMPT = 'اطلاعات لازم را دارم. ترجیح می‌دهید کارشناس با شما تماس بگیرد یا قیمت پس از بررسی همین‌جا در چت اعلام شود؟';
export const LEGACY_QUOTATION_CALL_SUCCESS = 'اوکی، کارشناس حداکثر تا ۵ دقیقهٔ دیگر با شما تماس می‌گیرد.';
export const LEGACY_QUOTATION_CHAT_SUCCESS = 'اوکی، کارشناس قیمت را بررسی می‌کند و به‌محض آماده‌شدن همین‌جا به شما اعلام می‌کنیم.';

export type QuotationCompletionRuleConfig = {
  version: 1;
  summaryPrompt: string;
  summaryCorrectionPrompt: string;
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
  summaryPrompt: 'لطفاً خلاصه اطلاعات زیر را بررسی کنید:\n{{summary}}\n\nاگر اطلاعات درست است، تأیید بفرمایید تا درخواست ثبت شود.',
  summaryCorrectionPrompt: 'اگر موردی نیاز به اصلاح دارد، همان مورد و مقدار درست را بفرمایید؛ در غیر این صورت صحت اطلاعات را تأیید کنید.',
  choicePrompt: DEFAULT_QUOTATION_COMPLETION_PROMPT,
  callSuccess: 'ممنونم {{customerTitle}} {{customerLastName}}. اطلاعات درخواست‌تون کامل شد و برای کارشناسان مربوطه ارسال شد. همکاران ما در اولین فرصت با شما تماس می‌گیرند تا راهنمایی‌های لازم رو ارائه بدن و قیمت بیمه رو اعلام کنند.',
  chatSuccess: 'حتماً، کارشناس قیمت را بررسی می‌کند{{slaText}} و همین‌جا در چت با شما در ارتباط خواهد بود.',
  failure: 'در تکمیل ثبت درخواست و اعلان به کارشناس مشکلی پیش آمد. فعلاً نمی‌توانم زمان تماس یا اعلام قیمت را تأیید کنم؛ اطلاعات شما محفوظ است.',
  failedTerminal: 'ثبت درخواست در مرحلهٔ قبل کامل نشد. اطلاعات استعلام محفوظ است؛ در صورت تمایل می‌توانید درخواست کنید ثبت دوباره انجام شود.',
  callSubmitted: 'درخواست تماس با کارشناس قبلاً ثبت شده است.',
  chatSubmitted: 'درخواست بررسی و اعلام قیمت در چت قبلاً ثبت شده است.',
};

const COMPLETION_KEYS = ['summaryPrompt', 'summaryCorrectionPrompt', 'choicePrompt', 'callSuccess', 'chatSuccess', 'failure', 'failedTerminal', 'callSubmitted', 'chatSubmitted'] as const;

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
        .every(match => ['slaText', 'slaMinutes', 'customerTitle', 'customerLastName', 'summary', 'customerName', 'productName'].includes(match[1].trim()));
    });
    return variablesAreSafe ? result : null;
  } catch { return null; }
}

export function serializeQuotationCompletionRule(value: QuotationCompletionRuleConfig): string {
  if (!parseQuotationCompletionRule(value)) throw new Error('تنظیمات مرحله پایانی استعلام نامعتبر است.');
  return JSON.stringify(value, null, 2);
}

export type CustomerDisplayIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  fullName?: string | null;
};

function safeCustomerIdentity(value?: string | null | CustomerDisplayIdentity): { title: string; name: string } {
  const identity: CustomerDisplayIdentity = value !== null && typeof value === 'object'
    ? value
    : { fullName: typeof value === 'string' ? value : null };
  const title = typeof identity.title === 'string' && /^(?:آقای|خانم)$/u.test(identity.title.trim())
    ? identity.title.trim()
    : '';
  const structuredName = [identity.firstName, identity.lastName].map(part => String(part || '').trim()).filter(Boolean).join(' ');
  const fullName = String(identity.fullName || '').trim();
  return { title, name: title ? String(identity.lastName || structuredName || fullName || 'مشتری محترم').trim() : structuredName || fullName || 'مشتری گرامی' };
}

function stripUnresolvedTemplateTokens(value: string): string {
  return value
    .replace(/{{\s*[^{}]+\s*}}/g, '')
    .replace(/[\[【]?\s*آقای\s*(?:\/|یا)\s*خانم\s*[\]】]?/gu, '')
    .replace(/\[[^\[\]\n]{1,50}\]/g, '')
    .replace(/\s+([.،؛])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function renderQuotationCompletionSuccess(template: string, slaMinutes: number | null, customer?: string | null | CustomerDisplayIdentity): string {
  const safeMinutes = Number.isInteger(slaMinutes) && Number(slaMinutes) > 0 && Number(slaMinutes) <= 1440
    ? Number(slaMinutes)
    : null;
  const slaText = safeMinutes ? ` و حداکثر تا ${safeMinutes.toLocaleString('fa-IR')} دقیقهٔ دیگر` : '';
  const identity = safeCustomerIdentity(customer);
  return stripUnresolvedTemplateTokens(template
    .replace(/{{\s*slaMinutes\s*}}/g, safeMinutes ? safeMinutes.toLocaleString('fa-IR') : '')
    .replace(/{{\s*slaText\s*}}/g, slaText)
    .replace(/{{\s*customerTitle\s*}}/g, identity.title)
    .replace(/{{\s*customerLastName\s*}}/g, identity.name));
}

export function renderQuotationSummaryTemplate(
  template: string,
  input: { productName: string; answers: Array<{ fieldLabel: string; value: string }>; profile: { fullName?: string; mobile?: string; city?: string } },
): string {
  const lines = [
    `محصول: ${input.productName}`,
    ...input.answers.map(answer => `${answer.fieldLabel}: ${answer.value}`),
    `نام و نام خانوادگی: ${input.profile.fullName || 'ثبت نشده'}`,
    `شماره همراه: ${input.profile.mobile || 'ثبت نشده'}`,
    `شهر یا محل مورد بیمه: ${input.profile.city || 'ثبت نشده'}`,
  ];
  return template
    .replace(/{{\s*summary\s*}}/g, lines.join('\n'))
    .replace(/{{\s*customerName\s*}}/g, input.profile.fullName || '')
    .replace(/{{\s*productName\s*}}/g, input.productName)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const QUOTATION_COMPLETION_RULE_DIRECTIVE = serializeQuotationCompletionRule(DEFAULT_QUOTATION_COMPLETION_CONFIG);

