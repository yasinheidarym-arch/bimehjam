export const QUOTATION_RESPONSE_ENGINE_RULE_ID = 'system-quotation-response-engine';
export const QUOTATION_RESPONSE_ENGINE_CATEGORY = 'SYSTEM_QUOTATION_RESPONSE_ENGINE';
export const QUOTATION_RESPONSE_ENGINE_TITLE = 'موتور تفسیر پاسخ استعلام';

export const QUOTATION_RESPONSE_STATES = [
  'VALID_ANSWER',
  'QUESTION_ABOUT_CURRENT_FIELD',
  'ANSWER_AND_QUESTION',
  'RELATED_BUT_WRONG_CATEGORY',
  'AMBIGUOUS',
  'UNRELATED',
  'CORRECTION',
  'MULTI_FIELD_ANSWER',
  'REQUEST_HUMAN',
  'CANCEL_OR_PAUSE',
  'START_NEW_QUOTATION',
] as const;

export const NON_REPEATING_CLARIFICATION_STATES = [
  'QUESTION_ABOUT_CURRENT_FIELD', 'RELATED_BUT_WRONG_CATEGORY', 'AMBIGUOUS', 'UNRELATED',
] as const;

export type QuotationResponseState = typeof QUOTATION_RESPONSE_STATES[number];

export type QuotationResponseStateRule = {
  template: string;
  tone: string;
  positiveExamples: string[];
  negativeExamples: string[];
};

export type QuotationResponseEngineConfig = {
  version: 1;
  states: Record<QuotationResponseState, QuotationResponseStateRule>;
  questionExamples: Record<string, string[]>;
};

const state = (template: string, tone: string): QuotationResponseStateRule => ({
  template,
  tone,
  positiveExamples: [],
  negativeExamples: [],
});

export const DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG: QuotationResponseEngineConfig = {
  version: 1,
  states: {
    VALID_ANSWER: state('{{nextQuestion}}', 'کوتاه، طبیعی و بدون بازنویسی سؤال'),
    QUESTION_ABOUT_CURRENT_FIELD: state('{{helpResponse}}', 'کارشناس حرفه‌ای، محترمانه، صمیمی و غیررسمیِ کنترل‌شده؛ خطاب همیشه جمع باشد و از عبارت‌های دستوری یا بچگانه استفاده نشود. پاسخ بدون تکرار کامل سؤال، طبیعی و محترمانه پایان یابد.'),
    ANSWER_AND_QUESTION: state('{{helpResponse}}\n\n{{nextQuestion}}', 'ابتدا پاسخ کوتاه و مستند، سپس سؤال واقعی بعدی'),
    RELATED_BUT_WRONG_CATEGORY: state('{{relatedExplanation}}', 'محترمانه و دقیق؛ سؤال اصلی را در همان پیام تکرار نکن'),
    AMBIGUOUS: state('{{clarification}}', 'کوتاه و مشخص'),
    UNRELATED: state('{{clarification}}', 'محترمانه و بدون بن‌بست'),
    CORRECTION: state('{{nextQuestion}}', 'کوتاه و تأییدکننده'),
    MULTI_FIELD_ANSWER: state('{{nextQuestion}}', 'کوتاه و بدون تکرار پاسخ‌های ثبت‌شده'),
    REQUEST_HUMAN: state('{{clarification}}', 'محترمانه و بدون از دست‌دادن پاسخ‌های قبلی'),
    CANCEL_OR_PAUSE: state('{{clarification}}', 'محترمانه و با حفظ وضعیت استعلام'),
    START_NEW_QUOTATION: state('{{clarification}}', 'کوتاه و روشن'),
  },
  questionExamples: {},
};

export const QUOTATION_RESPONSE_ENGINE_DIRECTIVE = JSON.stringify(DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG, null, 2);

const cleanLines = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 30)
  : [];

export function parseQuotationResponseEngineConfig(value: string): QuotationResponseEngineConfig | null {
  try {
    const parsed = JSON.parse(value) as Partial<QuotationResponseEngineConfig>;
    if (!parsed || parsed.version !== 1 || !parsed.states || typeof parsed.states !== 'object') return null;
    const states = {} as Record<QuotationResponseState, QuotationResponseStateRule>;
    for (const key of QUOTATION_RESPONSE_STATES) {
      const legacyStates = parsed.states as Record<string, QuotationResponseStateRule>;
      const item = legacyStates[key] || (key === 'QUESTION_ABOUT_CURRENT_FIELD' ? legacyStates.QUESTION_ABOUT_FIELD : null) || DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG.states[key];
      if (!item || typeof item.template !== 'string' || typeof item.tone !== 'string') return null;
      const template = key === 'QUESTION_ABOUT_CURRENT_FIELD'
        ? '{{helpResponse}}'
        : (NON_REPEATING_CLARIFICATION_STATES as readonly string[]).includes(key)
          ? item.template.replace(/{{\s*currentQuestion\s*}}/g, '').replace(/\n{3,}/g, '\n\n').trim()
          : item.template.trim();
      states[key] = {
        // Guidance is generated from grounded question context. Never expose raw
        // helpText/currentQuestion through an administrator-authored template.
        template: template || DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG.states[key].template,
        tone: item.tone.trim(),
        positiveExamples: cleanLines(item.positiveExamples),
        negativeExamples: cleanLines(item.negativeExamples),
      };
    }
    const questionExamples: Record<string, string[]> = {};
    if (parsed.questionExamples && typeof parsed.questionExamples === 'object') {
      for (const [id, examples] of Object.entries(parsed.questionExamples)) {
        const cleaned = cleanLines(examples);
        if (cleaned.length) questionExamples[id] = cleaned;
      }
    }
    return { version: 1, states, questionExamples };
  } catch {
    return null;
  }
}

export function serializeQuotationResponseEngineConfig(config: QuotationResponseEngineConfig): string {
  return JSON.stringify(config, null, 2);
}
