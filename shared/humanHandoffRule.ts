export const FULL_NAME_HANDOFF_RULE_ID = 'system-full-name-before-human-handoff';
export const FULL_NAME_HANDOFF_RULE_CATEGORY = 'SYSTEM_HANDOFF_FULL_NAME';
export const FULL_NAME_HANDOFF_RULE_TITLE = 'دریافت نام کامل پیش از ارجاع انسانی';
export const LEGACY_FULL_NAME_HANDOFF_RULE_DIRECTIVE = [
  'زمان اجرا: تکمیل استعلام قیمت یا درخواست مستقیم کارشناس',
  'رفتار: اگر نام کامل مشتری ثبت نشده است، پیش از ایجاد وظیفه نام و نام خانوادگی را درخواست کن. اگر نام موجود است، دوباره نپرس. در صورت امتناع، وظیفه ایجاد شود و نام ثبت‌نشده مشخص باشد.',
  'کاربرد: نام برای تماس اپراتور و نمایش نام مشتری در پیامک اعلان وظیفه استفاده می‌شود.',
].join('\n');

export type HumanHandoffRuleConfig = {
  version: 1;
  instruction: string;
  fullNamePrompt: string;
  lastNamePrompt: string;
  mobilePrompt: string;
  cityPrompt: string;
  interruptionPrefix: string;
  successPrompt: string;
  policyBlockedPrompt: string;
};

export const DEFAULT_HUMAN_HANDOFF_RULE_CONFIG: HumanHandoffRuleConfig = {
  version: 1,
  instruction: LEGACY_FULL_NAME_HANDOFF_RULE_DIRECTIVE,
  fullNamePrompt: 'برای ثبت درخواست، لطفاً نام و نام خانوادگی‌تان را بفرمایید.',
  lastNamePrompt: 'ممنونم؛ لطفاً نام خانوادگی‌تان را هم بفرمایید.',
  mobilePrompt: 'لطفاً شماره موبایل‌تان را برای پیگیری درخواست بفرمایید.',
  cityPrompt: 'لطفاً شهر محل سکونت یا محل مورد بیمه را بفرمایید.',
  interruptionPrefix: 'اطلاعات قبلی محفوظ است.',
  successPrompt: 'درخواست شما ثبت شد و همکارم ادامهٔ پیگیری را انجام می‌دهد. 🌹',
  policyBlockedPrompt: 'برای بررسی دقیق درخواست شما، همکاران متخصص بیمه جم ادامهٔ گفتگو را پیگیری می‌کنند. 🌹',
};

export function parseHumanHandoffRule(value: unknown): HumanHandoffRuleConfig | null {
  if (value === LEGACY_FULL_NAME_HANDOFF_RULE_DIRECTIVE) return DEFAULT_HUMAN_HANDOFF_RULE_CONFIG;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>).version !== 1) return null;
    const result = { ...DEFAULT_HUMAN_HANDOFF_RULE_CONFIG, ...(parsed as Partial<HumanHandoffRuleConfig>) };
    return ['instruction', 'fullNamePrompt', 'lastNamePrompt', 'mobilePrompt', 'cityPrompt', 'interruptionPrefix', 'successPrompt', 'policyBlockedPrompt']
      .every(key => typeof result[key as keyof HumanHandoffRuleConfig] === 'string' && String(result[key as keyof HumanHandoffRuleConfig]).trim()) ? result : null;
  } catch { return null; }
}

export function serializeHumanHandoffRule(value: HumanHandoffRuleConfig): string {
  if (!parseHumanHandoffRule(value)) throw new Error('تنظیمات دریافت مشخصات و ارجاع نامعتبر است.');
  return JSON.stringify(value, null, 2);
}

export const FULL_NAME_HANDOFF_RULE_DIRECTIVE = serializeHumanHandoffRule(DEFAULT_HUMAN_HANDOFF_RULE_CONFIG);
