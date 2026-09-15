import type { QuotationTurnModel } from './quotationStateMachine';
import { quotationQuestionOptions } from './quotationOptionMatchingService';
import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { runAiBehaviorStructuredModel } from './aiBehaviorRuntime';
import { canonicalQuotationAnswer } from './quotationStateMachine';
import {
  isQuotationSummaryConfirmed,
  normalizeIranMobile,
  normalizeQuotationCity,
  normalizeQuotationFullName,
  type QuotationSubmissionState,
  type QuotationSummaryDecision,
} from './quotationSubmissionFlow';

export type QuotationTerminalIntent = 'RETRY_SUBMISSION' | 'ASK_FAILURE_REASON' | 'START_NEW_QUOTATION' | 'REPLAY_RESULT' | 'OTHER';

export type SummaryClassifierOutput = {
  action: 'CONFIRM' | 'FIELD_CORRECTION' | 'UNSPECIFIED_CORRECTION' | 'OTHER';
  fieldKey: string | null;
  proposedValue: string | null;
  evidence: string | null;
  selectedOptionId: string | null;
  selectedOptionValue: string | null;
  confidence: number;
  reason: string;
};

const SUMMARY_PROFILE_FIELDS = {
  fullName: { label: 'نام و نام خانوادگی', normalize: normalizeQuotationFullName },
  mobile: { label: 'شماره همراه', normalize: normalizeIranMobile },
  city: { label: 'شهر یا محل مورد بیمه', normalize: normalizeQuotationCity },
} as const;

function evidenceExists(message: string, evidence: string | null): boolean {
  if (!evidence?.trim()) return false;
  const normalize = (value: string) => value.replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return normalize(message).includes(normalize(evidence));
}

export async function validateQuotationSummaryClassifierOutput(input: {
  message: string;
  state: QuotationSubmissionState;
  questions: QuotationTurnQuestion[];
  output: SummaryClassifierOutput;
  behaviorRuntime?: unknown;
}): Promise<QuotationSummaryDecision & { behaviorRuntime?: unknown }> {
  const { output } = input;
  const runtime = input.behaviorRuntime === undefined ? {} : { behaviorRuntime: input.behaviorRuntime };
  if (output.confidence < .75) return { action: output.action === 'UNSPECIFIED_CORRECTION' ? 'UNSPECIFIED_CORRECTION' : 'OTHER', confidence: output.confidence, reason: output.reason, ...runtime };
  if (output.action === 'CONFIRM') return { action: 'CONFIRM', confidence: output.confidence, reason: output.reason, ...runtime };
  if (output.action !== 'FIELD_CORRECTION' || !output.fieldKey || !evidenceExists(input.message, output.evidence)) {
    return { action: output.action === 'UNSPECIFIED_CORRECTION' ? 'UNSPECIFIED_CORRECTION' : 'OTHER', confidence: output.confidence, reason: output.reason, ...runtime };
  }
  const candidate = output.selectedOptionValue || output.proposedValue || output.evidence || '';
  if (output.fieldKey.startsWith('profile.')) {
    const fieldName = output.fieldKey.slice('profile.'.length) as keyof typeof SUMMARY_PROFILE_FIELDS;
    const field = SUMMARY_PROFILE_FIELDS[fieldName];
    const value = field?.normalize(candidate);
    return value
      ? { action: 'FIELD_CORRECTION', target: 'PROFILE', fieldName, canonicalValue: value, confidence: output.confidence, reason: output.reason, ...runtime }
      : { action: 'INVALID_CORRECTION', confidence: output.confidence, reason: 'Profile value failed backend validation', ...runtime };
  }
  if (output.fieldKey.startsWith('answer.')) {
    const fieldName = output.fieldKey.slice('answer.'.length);
    const question = input.questions.find(item => item.fieldName === fieldName);
    const answer = input.state.answers.find(item => item.fieldName === fieldName);
    if (question && answer) {
      const value = await canonicalQuotationAnswer(question, output.evidence || '', candidate, output.selectedOptionId, output.confidence);
      if (value !== null) return { action: 'FIELD_CORRECTION', target: 'ANSWER', fieldName, canonicalValue: value, confidence: output.confidence, reason: output.reason, ...runtime };
    }
  }
  return { action: 'INVALID_CORRECTION', confidence: output.confidence, reason: 'Correction failed backend field validation', ...runtime };
}

export async function classifyQuotationSummaryResponseWithAi(input: {
  message: string;
  state: QuotationSubmissionState;
  questions: QuotationTurnQuestion[];
  recentMessages?: Array<{ senderType: string; content: string }>;
  behaviorContext?: { channel: string; productId?: string | null; categoryId?: string | null; currentPageUrl?: string | null; intent?: string | null; conversationState?: string | null; quotationState?: string | null; currentField?: string | null; messageType?: string | null; userRole?: string | null };
}): Promise<QuotationSummaryDecision & { behaviorRuntime?: unknown }> {
  if (isQuotationSummaryConfirmed(input.message)) {
    return { action: 'CONFIRM', confidence: 1, reason: 'Deterministic normalized confirmation' };
  }
  const profileFields = Object.entries(SUMMARY_PROFILE_FIELDS).map(([fieldName, field]) => ({
    fieldKey: `profile.${fieldName}`,
    label: field.label,
    value: input.state.profile[fieldName as keyof typeof input.state.profile] || '',
  }));
  const answerFields = input.state.answers.map(answer => {
    const question = input.questions.find(item => item.fieldName === answer.fieldName);
    return {
      fieldKey: `answer.${answer.fieldName}`,
      label: answer.fieldLabel,
      value: answer.value,
      type: question?.type || 'text',
      options: question ? quotationQuestionOptions(question) : [],
      validation: question ? { minVal: question.minVal, maxVal: question.maxVal, minLength: question.minLength, maxLength: question.maxLength } : null,
    };
  });
  const fieldKeys = [...profileFields, ...answerFields].map(field => field.fieldKey);
  let result;
  try {
    result = await runAiBehaviorStructuredModel<SummaryClassifierOutput>({
      context: { ...input.behaviorContext, channel: input.behaviorContext?.channel || 'GOFTINO', conversationState: 'QUOTATION', quotationState: 'AWAITING_CONFIRMATION' },
      taskContract: 'فقط پیام کاربر در مرحله تأیید خلاصه را طبقه‌بندی کن. CONFIRM یعنی تأیید معنایی تمام خلاصه؛ FIELD_CORRECTION فقط وقتی مقدار جدید برای دقیقاً یکی از fieldKeyهای واقعی داده شده؛ UNSPECIFIED_CORRECTION یعنی گفته اصلاح لازم است اما فیلد یا مقدار روشن نیست؛ OTHER برای بقیه. فقط fieldKey موجود را برگردان، proposedValue باید مقدار خالص و بدون جمله پیرامونی باشد، evidence باید عین بخش حاوی مقدار در پیام باشد و عملیات یا پاسخ مکالمه تولید نکن.',
      schemaName: 'quotation_summary_confirmation',
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['CONFIRM', 'FIELD_CORRECTION', 'UNSPECIFIED_CORRECTION', 'OTHER'] },
          fieldKey: { type: ['string', 'null'], enum: [...fieldKeys, null] },
          proposedValue: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] },
          selectedOptionId: { type: ['string', 'null'] },
          selectedOptionValue: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string' },
        },
        required: ['action', 'fieldKey', 'proposedValue', 'evidence', 'selectedOptionId', 'selectedOptionValue', 'confidence', 'reason'],
      },
      payload: { message: input.message, fields: [...profileFields, ...answerFields], recentMessages: (input.recentMessages || []).slice(-4) },
    });
  } catch {
    return { action: 'OTHER', confidence: 0, reason: 'Provider unavailable and no deterministic confirmation' };
  }
  return validateQuotationSummaryClassifierOutput({
    message: input.message,
    state: input.state,
    questions: input.questions,
    output: result.output,
    behaviorRuntime: result.resolution,
  });
}

export async function classifyQuotationTerminalIntentWithAi(input: {
  message: string;
  status: 'SUBMITTED' | 'FAILED';
  deliveryChoice?: 'CALL' | 'CHAT';
  recentMessages?: Array<{ senderType: string; content: string }>;
  behaviorContext?: { channel: string; productId?: string | null; categoryId?: string | null; currentPageUrl?: string | null; intent?: string | null; conversationState?: string | null; quotationState?: string | null; currentField?: string | null; messageType?: string | null; userRole?: string | null };
}): Promise<{ intent: QuotationTerminalIntent; confidence: number; reason: string; source: 'AI' | 'FALLBACK'; behaviorRuntime?: unknown }> {
  {
    try {
      const result = await runAiBehaviorStructuredModel<{ intent: QuotationTerminalIntent; confidence: number; reason: string }>({
        context: { ...input.behaviorContext, channel: input.behaviorContext?.channel || 'GOFTINO', quotationState: input.status },
        taskContract: 'intent پیام را در state پایانی استعلام طبقه‌بندی کن. RETRY_SUBMISSION یعنی تلاش دوباره برای همان ثبت؛ ASK_FAILURE_REASON یعنی پرسش علت شکست؛ START_NEW_QUOTATION فقط درخواست روشن استعلام تازه؛ REPLAY_RESULT یعنی درخواست نتیجه همان ثبت؛ OTHER برای بقیه. عملیات اجرا نکن.',
        schemaName: 'quotation_terminal_intent',
        schema: {
            type: 'object', additionalProperties: false,
            properties: {
              intent: { type: 'string', enum: ['RETRY_SUBMISSION', 'ASK_FAILURE_REASON', 'START_NEW_QUOTATION', 'REPLAY_RESULT', 'OTHER'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              reason: { type: 'string' },
            },
            required: ['intent', 'confidence', 'reason'],
        },
        payload: { ...input, behaviorContext: undefined, recentMessages: (input.recentMessages || []).slice(-6) },
      });
      const parsed = result.output as Record<string, unknown>;
      const intents: QuotationTerminalIntent[] = ['RETRY_SUBMISSION', 'ASK_FAILURE_REASON', 'START_NEW_QUOTATION', 'REPLAY_RESULT', 'OTHER'];
      if (intents.includes(parsed.intent as QuotationTerminalIntent) && typeof parsed.confidence === 'number') {
        return { intent: parsed.intent as QuotationTerminalIntent, confidence: parsed.confidence, reason: String(parsed.reason || ''), source: 'AI', behaviorRuntime: result.resolution };
      }
    } catch {
      // A provider error falls back to a deliberately small operational parser.
    }
  }
  const message = input.message.replace(/\u200c/g, ' ').trim();
  if (/^(?:دوباره|مجدد|تلاش دوباره|باز هم)\s*(?:ثبت|امتحان|تلاش)?/u.test(message)) return { intent: 'RETRY_SUBMISSION', confidence: .8, reason: 'Provider-unavailable explicit retry fallback', source: 'FALLBACK' };
  if (/^(?:چرا|علت(?:ش| خطا)? چیه|چه خطایی)/u.test(message)) return { intent: 'ASK_FAILURE_REASON', confidence: .8, reason: 'Provider-unavailable failure-question fallback', source: 'FALLBACK' };
  if (/استعلام\s+(?:جدید|دیگه)|محصول\s+دیگر/u.test(message)) return { intent: 'START_NEW_QUOTATION', confidence: .8, reason: 'Provider-unavailable explicit new-quotation fallback', source: 'FALLBACK' };
  return { intent: 'OTHER', confidence: 0, reason: 'Provider unavailable and no safe operational match', source: 'FALLBACK' };
}

export const classifyQuotationTurnWithAi: QuotationTurnModel = async (input) => {
  const result = await runAiBehaviorStructuredModel<Record<string, unknown>>({
    context: { ...input.behaviorContext, channel: input.behaviorContext?.channel || 'GOFTINO', conversationState: 'QUOTATION', quotationState: input.session.status, currentField: input.currentQuestion?.fieldName || null },
    taskContract: 'فقط classifier معنایی موتور استعلام باش. یکی از statusهای schema را انتخاب کن. assignments فقط برای پاسخ معتبر، پاسخ همراه سؤال، چندفیلدی یا اصلاح مجاز است. فقط fieldName و option id/value واقعی ورودی مجاز است؛ evidence باید عین بخشی از message باشد. عملیات یا متن پاسخ نهایی تولید نکن.',
    schemaName: 'quotation_turn_interpretation',
    schema: { type: 'object', additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['VALID_ANSWER', 'QUESTION_ABOUT_CURRENT_FIELD', 'ANSWER_AND_QUESTION', 'RELATED_BUT_WRONG_CATEGORY', 'AMBIGUOUS', 'UNRELATED', 'CORRECTION', 'MULTI_FIELD_ANSWER', 'REQUEST_HUMAN', 'CANCEL_OR_PAUSE', 'START_NEW_QUOTATION'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 }, reason: { type: 'string' },
          relatedFieldName: { type: ['string', 'null'] },
          relatedExplanation: { type: ['string', 'null'] },
          clarification: { type: ['string', 'null'] },
          assignments: { type: 'array', items: { type: 'object', additionalProperties: false,
            properties: { fieldName: { type: 'string' }, value: { type: 'string' }, selectedOptionId: { type: ['string', 'null'] }, selectedOptionValue: { type: ['string', 'null'] }, evidence: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 } },
            required: ['fieldName', 'value', 'selectedOptionId', 'selectedOptionValue', 'evidence', 'confidence'] } },
        }, required: ['status', 'confidence', 'reason', 'relatedFieldName', 'relatedExplanation', 'clarification', 'assignments'] },
    payload: {
        ...input,
        behaviorContext: undefined,
        currentQuestion: input.currentQuestion ? { ...input.currentQuestion, options: quotationQuestionOptions(input.currentQuestion) } : null,
        questions: input.questions.map(question => ({ ...question, options: quotationQuestionOptions(question) })),
    },
  });
  return { ...result.output, behaviorRuntime: result.resolution };
};

export async function selectQuotationGuidanceWithAi(input: {
  message: string;
  question: QuotationTurnQuestion;
  knowledge: string;
  source: 'HELP_TEXT' | 'PRODUCT_KNOWLEDGE' | 'CATEGORY_KNOWLEDGE' | 'GENERAL_MODEL_KNOWLEDGE';
  sourceText: string;
  tone: string;
  helpText?: string;
  productKnowledge?: string;
  categoryKnowledge?: string;
  allowedOptions?: string[];
  behaviorContext?: { channel: string; productId?: string | null; categoryId?: string | null; currentPageUrl?: string | null; intent?: string | null; conversationState?: string | null; quotationState?: string | null; currentField?: string | null; messageType?: string | null; userRole?: string | null };
}) {
  const result = await runAiBehaviorStructuredModel<Record<string, unknown>>({
    context: { ...input.behaviorContext, channel: input.behaviorContext?.channel || 'GOFTINO', conversationState: 'QUOTATION', currentField: input.question.fieldName },
    taskContract: `فقط با منبع تعیین‌شده در payload پاسخ راهنمای کوتاه و طبیعی بساز. اگر source از نوع دانش ذخیره‌شده است، هیچ ادعایی بیرون از sourceText نساز. اگر GENERAL_MODEL_KNOWLEDGE است فقط توضیح عمومی مفهومی بده و مبلغ، گزینه، پوشش، استثنا یا شرط اختصاصی بیمه نساز؛ اگر پاسخ مطمئن ممکن نیست source خروجی را HONEST_LIMITATION قرار بده. در سایر حالت‌ها source خروجی دقیقاً برابر source ورودی باشد؛ متن کامل سؤال را تکرار نکن.`,
    schemaName: 'quotation_grounded_guidance',
    schema: {
        type: 'object', additionalProperties: false,
        properties: {
          helpResponse: { type: 'string', maxLength: 600 },
          passages: { type: 'array', maxItems: 2, items: { type: 'string' } },
          source: { type: 'string', enum: ['HELP_TEXT', 'PRODUCT_KNOWLEDGE', 'CATEGORY_KNOWLEDGE', 'GENERAL_MODEL_KNOWLEDGE', 'HONEST_LIMITATION'] },
        },
        required: ['helpResponse', 'passages', 'source'],
    },
    payload: { ...input, behaviorContext: undefined },
  });
  return { ...result.output, behaviorRuntime: result.resolution };
}
