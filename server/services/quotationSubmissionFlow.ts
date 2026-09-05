import { validStoredFullName } from './humanHandoffNameFlow';

export type QuotationSubmissionStep = 'FULL_NAME' | 'LAST_NAME' | 'MOBILE' | 'CITY' | 'CONFIRM';
export type QuotationSubmissionStatus = 'COLLECTING_PROFILE' | 'AWAITING_CONFIRMATION' | 'SUBMITTED' | 'NOT_SUBMITTED';

export type QuotationSubmissionAnswer = {
  order: number;
  question: string;
  fieldName: string;
  value: string;
};

export type QuotationSubmissionState = {
  pending: true;
  status: QuotationSubmissionStatus;
  step: QuotationSubmissionStep;
  sessionId: string;
  productId: string;
  productName: string;
  answers: QuotationSubmissionAnswer[];
  profile: { fullName?: string; mobile?: string; city?: string };
  givenName?: string;
};

export type QuotationSubmissionDecision =
  | { action: 'ASK'; replyText: string; state: QuotationSubmissionState }
  | { action: 'SUBMIT'; replyText: string; state: QuotationSubmissionState };

const FULL_NAME_PROMPT = 'برای ثبت درخواست، لطفاً نام و نام خانوادگی‌تان را بفرمایید.';
const LAST_NAME_PROMPT = 'ممنونم؛ لطفاً نام خانوادگی‌تان را هم بفرمایید.';
const MOBILE_PROMPT = 'لطفاً شماره موبایل‌تان را برای پیگیری درخواست بفرمایید.';
const CITY_PROMPT = 'لطفاً شهر محل سکونت یا محل مورد بیمه را بفرمایید.';
const CONFIRM_PROMPT = 'اگر اطلاعات درست است، لطفاً با «تأیید می‌کنم» ثبت درخواست را تأیید کنید.';

function normalizeDigits(value: string): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return value.replace(/[۰-۹]/g, (digit) => String(fa.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ar.indexOf(digit)));
}

export function normalizeIranMobile(value: unknown): string | null {
  const digits = normalizeDigits(String(value || '')).replace(/[^\d+]/g, '');
  const local = digits.startsWith('+98') ? `0${digits.slice(3)}` : digits.startsWith('98') ? `0${digits.slice(2)}` : digits;
  return /^09\d{9}$/.test(local) ? local : null;
}

function normalizeCity(value: unknown): string | null {
  const city = String(value || '').trim().replace(/\s+/g, ' ');
  return city && !['نامشخص', 'ثبت نشده', 'ندارم'].includes(city) ? city : null;
}

function parseName(value: unknown): { fullName?: string; givenName?: string } {
  const candidate = String(value || '').trim().replace(/\s+/g, ' ')
    .replace(/^(?:اسمم|نامم|نام من|من)\s+/u, '')
    .replace(/\s+(?:هستم|استم|است)\.?$/u, '');
  const fullName = validStoredFullName(candidate);
  if (fullName) return { fullName };
  return /^\p{L}[\p{L}\u200c'-]{1,39}$/u.test(candidate) ? { givenName: candidate } : {};
}

function nextMissingStep(profile: QuotationSubmissionState['profile']): QuotationSubmissionStep {
  if (!validStoredFullName(profile.fullName)) return 'FULL_NAME';
  if (!normalizeIranMobile(profile.mobile)) return 'MOBILE';
  if (!normalizeCity(profile.city)) return 'CITY';
  return 'CONFIRM';
}

function questionFor(step: QuotationSubmissionStep): string {
  if (step === 'FULL_NAME') return FULL_NAME_PROMPT;
  if (step === 'LAST_NAME') return LAST_NAME_PROMPT;
  if (step === 'MOBILE') return MOBILE_PROMPT;
  if (step === 'CITY') return CITY_PROMPT;
  return CONFIRM_PROMPT;
}

export function quotationSubmissionSummary(state: QuotationSubmissionState): string {
  const answers = [...state.answers]
    .sort((a, b) => a.order - b.order)
    .map((answer) => `${answer.order}. ${answer.question}: ${answer.value}`)
    .join('\n');
  return `خلاصهٔ درخواست «${state.productName}»:\n${answers || 'پاسخ‌های استعلام تکمیل شده است.'}\nنام: ${state.profile.fullName}\nموبایل: ${state.profile.mobile}\nشهر: ${state.profile.city}\n${CONFIRM_PROMPT}`;
}

export function startQuotationSubmission(input: {
  sessionId: string;
  productId: string;
  productName: string;
  answers: QuotationSubmissionAnswer[];
  existingProfile: { fullName?: string | null; mobile?: string | null; city?: string | null };
}): QuotationSubmissionDecision {
  const profile = {
    ...(validStoredFullName(input.existingProfile.fullName) ? { fullName: validStoredFullName(input.existingProfile.fullName)! } : {}),
    ...(normalizeIranMobile(input.existingProfile.mobile) ? { mobile: normalizeIranMobile(input.existingProfile.mobile)! } : {}),
    ...(normalizeCity(input.existingProfile.city) ? { city: normalizeCity(input.existingProfile.city)! } : {}),
  };
  const step = nextMissingStep(profile);
  const state: QuotationSubmissionState = {
    pending: true,
    status: step === 'CONFIRM' ? 'AWAITING_CONFIRMATION' : 'COLLECTING_PROFILE',
    step,
    sessionId: input.sessionId,
    productId: input.productId,
    productName: input.productName,
    answers: [...input.answers].sort((a, b) => a.order - b.order),
    profile,
  };
  return { action: 'ASK', replyText: step === 'CONFIRM' ? quotationSubmissionSummary(state) : questionFor(step), state };
}

export function advanceQuotationSubmission(state: QuotationSubmissionState, message: string): QuotationSubmissionDecision {
  const next = { ...state, profile: { ...state.profile } };
  if (state.step === 'FULL_NAME') {
    const name = parseName(message);
    if (name.fullName) next.profile.fullName = name.fullName;
    else if (name.givenName) {
      next.givenName = name.givenName;
      next.step = 'LAST_NAME';
      return { action: 'ASK', replyText: LAST_NAME_PROMPT, state: next };
    } else return { action: 'ASK', replyText: FULL_NAME_PROMPT, state: next };
  } else if (state.step === 'LAST_NAME') {
    const lastName = String(message || '').trim().replace(/\s+/g, ' ');
    const fullName = validStoredFullName(`${state.givenName || ''} ${lastName}`);
    if (!fullName) return { action: 'ASK', replyText: LAST_NAME_PROMPT, state: next };
    next.profile.fullName = fullName;
    delete next.givenName;
  } else if (state.step === 'MOBILE') {
    const mobile = normalizeIranMobile(message);
    if (!mobile) return { action: 'ASK', replyText: MOBILE_PROMPT, state: next };
    next.profile.mobile = mobile;
  } else if (state.step === 'CITY') {
    const city = normalizeCity(message);
    if (!city) return { action: 'ASK', replyText: CITY_PROMPT, state: next };
    next.profile.city = city;
  } else {
    const normalized = String(message || '').replace(/‌/g, ' ').trim();
    if (/^(تأیید|تایید)( می کنم| میکنم| است)?$|^(بله|آره|اره)،?\s*(تأیید|تایید|ثبت)/i.test(normalized)) {
      next.status = 'AWAITING_CONFIRMATION';
      return { action: 'SUBMIT', replyText: '', state: next };
    }
    return {
      action: 'ASK',
      replyText: `درخواست هنوز ثبت نشده است.\n${quotationSubmissionSummary(next)}`,
      state: next,
    };
  }

  next.step = nextMissingStep(next.profile);
  next.status = next.step === 'CONFIRM' ? 'AWAITING_CONFIRMATION' : 'COLLECTING_PROFILE';
  return {
    action: 'ASK',
    replyText: next.step === 'CONFIRM' ? quotationSubmissionSummary(next) : questionFor(next.step),
    state: next,
  };
}
