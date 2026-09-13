import { validStoredFullName } from './humanHandoffNameFlow';
import { isQuotationInterruption } from './quotationStateMachine';
import { DEFAULT_HUMAN_HANDOFF_RULE_CONFIG, type HumanHandoffRuleConfig } from '../../shared/humanHandoffRule';
import { DEFAULT_QUOTATION_COMPLETION_CONFIG, type QuotationCompletionRuleConfig } from '../../shared/quotationCompletionRule';

export type QuotationSubmissionStep = 'FULL_NAME' | 'LAST_NAME' | 'MOBILE' | 'CITY' | 'DELIVERY_CHOICE' | 'CONFIRM';
export type QuotationSubmissionStatus = 'COLLECTING_PROFILE' | 'AWAITING_DELIVERY_CHOICE' | 'PROCESSING' | 'SUBMITTED' | 'FAILED' | 'AWAITING_CONFIRMATION' | 'NOT_SUBMITTED';
export type QuotationDeliveryChoice = 'CALL' | 'CHAT';
export type QuotationFulfillmentStatus = 'WAITING_FOR_CALLBACK' | 'WAITING_FOR_CHAT_QUOTE';

export type QuotationSubmissionAnswer = {
  order: number;
  fieldLabel: string;
  fieldName: string;
  value: string;
};

export type QuotationSubmissionState = {
  pending: boolean;
  status: QuotationSubmissionStatus;
  step: QuotationSubmissionStep;
  sessionId: string;
  productId: string;
  productName: string;
  answers: QuotationSubmissionAnswer[];
  profile: { fullName?: string; mobile?: string; city?: string };
  givenName?: string;
  choicePrompt: string;
  deliveryChoice?: QuotationDeliveryChoice;
  fulfillmentStatus?: QuotationFulfillmentStatus;
  idempotencyKey?: string;
  taskId?: string;
  leadId?: string;
  smsStatus?: string;
  failureReason?: string;
  currentPageUrl?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
};

export type QuotationSubmissionDecision =
  | { action: 'ASK'; replyText: string; state: QuotationSubmissionState }
  | { action: 'ROUTE'; route: QuotationDeliveryChoice; replyText: string; state: QuotationSubmissionState };

export type QuotationTerminalDecision =
  | { action: 'RELEASE'; state: QuotationSubmissionState }
  | { action: 'REPLY'; replyText: string; state: QuotationSubmissionState }
  | { action: 'RETRY'; route: QuotationDeliveryChoice; state: QuotationSubmissionState };

export function completeQuotationSubmissionState(
  state: QuotationSubmissionState,
  route: QuotationDeliveryChoice,
  idempotencyKey: string,
  outcome: {
    ok: boolean;
    taskId?: string;
    leadId?: string;
    smsStatus?: string;
    error?: string;
  },
): QuotationSubmissionState {
  return {
    ...state,
    pending: false,
    status: outcome.ok ? 'SUBMITTED' : 'FAILED',
    deliveryChoice: route,
    ...(outcome.ok ? {
      fulfillmentStatus: route === 'CALL' ? 'WAITING_FOR_CALLBACK' : 'WAITING_FOR_CHAT_QUOTE',
    } : {}),
    idempotencyKey,
    taskId: outcome.taskId,
    leadId: outcome.leadId,
    smsStatus: outcome.smsStatus,
    failureReason: outcome.ok ? undefined : outcome.error,
  };
}

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
  return 'DELIVERY_CHOICE';
}

function questionFor(step: QuotationSubmissionStep, prompts: HumanHandoffRuleConfig): string {
  if (step === 'FULL_NAME') return prompts.fullNamePrompt;
  if (step === 'LAST_NAME') return prompts.lastNamePrompt;
  if (step === 'MOBILE') return prompts.mobilePrompt;
  if (step === 'CITY') return prompts.cityPrompt;
  return '';
}

export function startQuotationSubmission(input: {
  sessionId: string;
  productId: string;
  productName: string;
  answers: QuotationSubmissionAnswer[];
  existingProfile: { fullName?: string | null; mobile?: string | null; city?: string | null };
  choicePrompt: string;
  currentPageUrl?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  profilePrompts?: HumanHandoffRuleConfig;
}): QuotationSubmissionDecision {
  const profile = {
    ...(validStoredFullName(input.existingProfile.fullName) ? { fullName: validStoredFullName(input.existingProfile.fullName)! } : {}),
    ...(normalizeIranMobile(input.existingProfile.mobile) ? { mobile: normalizeIranMobile(input.existingProfile.mobile)! } : {}),
    ...(normalizeCity(input.existingProfile.city) ? { city: normalizeCity(input.existingProfile.city)! } : {}),
  };
  const step = nextMissingStep(profile);
  const state: QuotationSubmissionState = {
    pending: true,
    status: step === 'DELIVERY_CHOICE' ? 'AWAITING_DELIVERY_CHOICE' : 'COLLECTING_PROFILE',
    step,
    sessionId: input.sessionId,
    productId: input.productId,
    productName: input.productName,
    answers: [...input.answers].sort((a, b) => a.order - b.order),
    profile,
    choicePrompt: input.choicePrompt,
    currentPageUrl: input.currentPageUrl || null,
    categoryId: input.categoryId || null,
    categoryName: input.categoryName || null,
  };
  return { action: 'ASK', replyText: step === 'DELIVERY_CHOICE' ? state.choicePrompt : questionFor(step, input.profilePrompts || DEFAULT_HUMAN_HANDOFF_RULE_CONFIG), state };
}

export function handleTerminalQuotationSubmission(
  state: QuotationSubmissionState,
  intent: 'RETRY_SUBMISSION' | 'ASK_FAILURE_REASON' | 'START_NEW_QUOTATION' | 'REPLAY_RESULT' | 'OTHER',
  templates: QuotationCompletionRuleConfig = DEFAULT_QUOTATION_COMPLETION_CONFIG,
): QuotationTerminalDecision {
  if (intent === 'START_NEW_QUOTATION') return { action: 'RELEASE', state };
  if (state.status === 'FAILED') {
    if (intent === 'RETRY_SUBMISSION' && state.deliveryChoice) {
      return { action: 'RETRY', route: state.deliveryChoice, state: { ...state, pending: true, status: 'PROCESSING' } };
    }
    return {
      action: 'REPLY',
      replyText: templates.failedTerminal,
      state,
    };
  }
  const replyText = state.deliveryChoice === 'CALL' ? templates.callSubmitted : templates.chatSubmitted;
  return { action: 'REPLY', replyText, state };
}

export function quotationDeliveryChoice(message: string): QuotationDeliveryChoice | null {
  const normalized = String(message || '').replace(/‌/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (/تماس|زنگ|تلفن|کارشناس.*(?:صحبت|تماس)/u.test(normalized)) return 'CALL';
  if (/چت|همین\s*جا|اینجا|پیام|در\s*گفتگو|اعلام.*قیمت|قیمت.*اعلام/u.test(normalized)) return 'CHAT';
  return null;
}

export function advanceQuotationSubmission(state: QuotationSubmissionState, message: string, semanticDeliveryChoice?: QuotationDeliveryChoice | null, profilePrompts: HumanHandoffRuleConfig = DEFAULT_HUMAN_HANDOFF_RULE_CONFIG): QuotationSubmissionDecision {
  const next: QuotationSubmissionState = {
    ...state,
    profile: { ...state.profile },
    step: state.step === 'CONFIRM' ? 'DELIVERY_CHOICE' : state.step,
    status: state.step === 'CONFIRM' ? 'AWAITING_DELIVERY_CHOICE' : state.status,
    choicePrompt: state.choicePrompt || 'اطلاعات لازم را دارم. ترجیح می‌دهید کارشناس با شما تماس بگیرد یا قیمت پس از بررسی همین‌جا در چت اعلام شود؟',
  };
  const normalizedResponse = message.replace(/‌/g, ' ').trim();
  if (next.step === 'DELIVERY_CHOICE') {
    const route = semanticDeliveryChoice || quotationDeliveryChoice(message);
    if (!route) return { action: 'ASK', replyText: next.choicePrompt, state: next };
    next.deliveryChoice = route;
    next.status = 'PROCESSING';
    return { action: 'ROUTE', route, replyText: '', state: next };
  }
  if (isQuotationInterruption(message) || /^(آره|اره|بله|نه|خیر|باشه)$/.test(normalizedResponse)) {
    return { action: 'ASK', replyText: `${profilePrompts.interruptionPrefix} ${questionFor(next.step, profilePrompts)}`, state: next };
  }
  if (next.step === 'FULL_NAME') {
    const name = parseName(message);
    if (name.fullName) next.profile.fullName = name.fullName;
    else if (name.givenName) {
      next.givenName = name.givenName;
      next.step = 'LAST_NAME';
      return { action: 'ASK', replyText: profilePrompts.lastNamePrompt, state: next };
    } else return { action: 'ASK', replyText: profilePrompts.fullNamePrompt, state: next };
  } else if (next.step === 'LAST_NAME') {
    const lastName = String(message || '').trim().replace(/\s+/g, ' ');
    const fullName = validStoredFullName(`${next.givenName || ''} ${lastName}`);
    if (!fullName) return { action: 'ASK', replyText: profilePrompts.lastNamePrompt, state: next };
    next.profile.fullName = fullName;
    delete next.givenName;
  } else if (next.step === 'MOBILE') {
    const mobile = normalizeIranMobile(message);
    if (!mobile) return { action: 'ASK', replyText: profilePrompts.mobilePrompt, state: next };
    next.profile.mobile = mobile;
  } else if (next.step === 'CITY') {
    const city = normalizeCity(message);
    if (!city) return { action: 'ASK', replyText: profilePrompts.cityPrompt, state: next };
    next.profile.city = city;
  }

  next.step = nextMissingStep(next.profile);
  next.status = next.step === 'DELIVERY_CHOICE' ? 'AWAITING_DELIVERY_CHOICE' : 'COLLECTING_PROFILE';
  return {
    action: 'ASK',
    replyText: next.step === 'DELIVERY_CHOICE' ? next.choicePrompt : questionFor(next.step, profilePrompts),
    state: next,
  };
}
