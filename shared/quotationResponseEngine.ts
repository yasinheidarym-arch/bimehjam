export const QUOTATION_RESPONSE_ENGINE_RULE_ID = 'system-quotation-response-engine';
export const QUOTATION_RESPONSE_ENGINE_CATEGORY = 'SYSTEM_QUOTATION_RESPONSE_ENGINE';
export const QUOTATION_RESPONSE_ENGINE_TITLE = 'موتور تفسیر پاسخ استعلام';

export const QUOTATION_RESPONSE_STATES = [
  'VALID_ANSWER',
  'QUESTION_ABOUT_FIELD',
  'RELATED_BUT_WRONG_CATEGORY',
  'AMBIGUOUS',
  'UNRELATED',
  'CORRECTION',
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
    QUESTION_ABOUT_FIELD: state('{{helpText}}\n{{currentQuestion}}', 'آموزنده، کوتاه و روشن'),
    RELATED_BUT_WRONG_CATEGORY: state('{{relatedExplanation}}\n{{currentQuestion}}', 'محترمانه و دقیق'),
    AMBIGUOUS: state('{{clarification}}', 'کوتاه و مشخص'),
    UNRELATED: state('{{clarification}}', 'محترمانه و بدون بن‌بست'),
    CORRECTION: state('{{nextQuestion}}', 'کوتاه و تأییدکننده'),
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
      const item = parsed.states[key];
      if (!item || typeof item.template !== 'string' || typeof item.tone !== 'string') return null;
      states[key] = {
        template: item.template.trim(),
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

