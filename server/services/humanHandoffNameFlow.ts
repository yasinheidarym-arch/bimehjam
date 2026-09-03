export const FULL_NAME_REQUEST_MESSAGE = 'برای اینکه همکارم بتواند با شما تماس بگیرد، لطفاً نام و نام خانوادگی‌تان را بفرمایید.';
export const LAST_NAME_REQUEST_MESSAGE = 'ممنونم؛ لطفاً نام خانوادگی‌تان را هم بفرمایید.';

export type HumanHandoffReason = 'QUOTATION_COMPLETED' | 'DIRECT_HUMAN_REQUEST';
export type HumanHandoffNameState = {
  pending: true;
  reason: HumanHandoffReason;
  nameStatus: 'AWAITING_FULL_NAME' | 'AWAITING_LAST_NAME';
  givenName?: string;
};

export type HumanHandoffNameResult =
  | { action: 'ASK_NAME'; replyText: string; state: HumanHandoffNameState }
  | { action: 'CREATE_TASK'; fullName: string | null; reason: HumanHandoffReason; nameStatus: 'RECORDED' | 'NOT_PROVIDED' };

const PLACEHOLDER_NAMES = new Set(['مشتری', 'مشتری گفتینو', 'ناشناس', 'ثبت نشده', 'بدون نام']);
const REFUSAL_PATTERN = /^(?:نه|خیر|بیخیال)[.!؟\s]*$|نمی[‌ ]?(?:گم|گویم|خوام|خواهم)|مایل نیستم|تمایل ندارم|اعلام نمی|لازم نیست|رد می‌کنم/i;

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').replace(/^[،,:؛.\-]+|[،,:؛.\-]+$/g, '');
}

function extractName(message: string): string {
  return normalizeName(message)
    .replace(/^(?:سلام[،,]?\s*)/u, '')
    .replace(/^(?:اسمم|نامم|نام من|من)\s+/u, '')
    .replace(/\s+(?:هستم|استم|هست|است)\.?$/u, '')
    .trim();
}

export function isValidNamePart(value: string): boolean {
  return /^\p{L}[\p{L}\u200c'-]{1,39}$/u.test(value);
}

export function validStoredFullName(value: unknown): string | null {
  const normalized = normalizeName(value);
  if (!normalized || PLACEHOLDER_NAMES.has(normalized)) return null;
  const parts = normalized.split(' ');
  return parts.length >= 2 && parts.length <= 6 && parts.every(isValidNamePart) ? normalized : null;
}

export function advanceHumanHandoffName(input: {
  reason: HumanHandoffReason;
  existingCustomerName?: string | null;
  message?: string;
  state?: HumanHandoffNameState | null;
}): HumanHandoffNameResult {
  const existingFullName = validStoredFullName(input.existingCustomerName);
  if (existingFullName) return { action: 'CREATE_TASK', fullName: existingFullName, reason: input.reason, nameStatus: 'RECORDED' };

  if (!input.state) {
    const existingFirstName = normalizeName(input.existingCustomerName);
    if (existingFirstName && !PLACEHOLDER_NAMES.has(existingFirstName) && isValidNamePart(existingFirstName)) {
      return {
        action: 'ASK_NAME',
        replyText: LAST_NAME_REQUEST_MESSAGE,
        state: { pending: true, reason: input.reason, nameStatus: 'AWAITING_LAST_NAME', givenName: existingFirstName },
      };
    }
    return {
      action: 'ASK_NAME',
      replyText: FULL_NAME_REQUEST_MESSAGE,
      state: { pending: true, reason: input.reason, nameStatus: 'AWAITING_FULL_NAME' },
    };
  }

  const message = normalizeName(input.message);
  if (!message || REFUSAL_PATTERN.test(message)) {
    return { action: 'CREATE_TASK', fullName: null, reason: input.state.reason, nameStatus: 'NOT_PROVIDED' };
  }

  const candidate = extractName(message);
  const parts = candidate.split(' ').filter(Boolean);
  if (input.state.nameStatus === 'AWAITING_LAST_NAME' && parts.length >= 1 && parts.length <= 5 && parts.every(isValidNamePart)) {
    return { action: 'CREATE_TASK', fullName: `${input.state.givenName} ${candidate}`.trim(), reason: input.state.reason, nameStatus: 'RECORDED' };
  }
  if (parts.length >= 2 && parts.length <= 6 && parts.every(isValidNamePart)) {
    return { action: 'CREATE_TASK', fullName: candidate, reason: input.state.reason, nameStatus: 'RECORDED' };
  }
  if (parts.length === 1 && isValidNamePart(parts[0])) {
    return {
      action: 'ASK_NAME',
      replyText: LAST_NAME_REQUEST_MESSAGE,
      state: { pending: true, reason: input.state.reason, nameStatus: 'AWAITING_LAST_NAME', givenName: parts[0] },
    };
  }
  return { action: 'CREATE_TASK', fullName: null, reason: input.state.reason, nameStatus: 'NOT_PROVIDED' };
}

export function resolveHumanHandoffNameRule(input: {
  ruleActive: boolean;
  reason: HumanHandoffReason;
  existingCustomerName?: string | null;
  message?: string;
  state?: HumanHandoffNameState | null;
}): HumanHandoffNameResult {
  if (input.ruleActive) return advanceHumanHandoffName(input);
  const fullName = validStoredFullName(input.existingCustomerName);
  return {
    action: 'CREATE_TASK',
    fullName,
    reason: input.state?.reason || input.reason,
    nameStatus: fullName ? 'RECORDED' : 'NOT_PROVIDED',
  };
}

export function handoffReasonLabel(reason: HumanHandoffReason): string {
  return reason === 'QUOTATION_COMPLETED' ? 'تکمیل استعلام قیمت' : 'درخواست مستقیم کارشناس';
}
