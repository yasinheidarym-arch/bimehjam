import { answerPortion, quotationQuestionReply, sortQuotationQuestions, type QuotationTurnQuestion } from './quotationConversationFlow';
import { quotationQuestionHelp } from './quotationQuestionHelp';
import { normalizeQuotationOptionText as normalize, numbersIn, isPlainQuotationNumber, quotationQuestionOptions, resolveQuotationOptionSelection } from './quotationOptionMatchingService';
import { isAmbiguousQuotationMoney, resolveQuotationMoney } from './quotationMoney';
import { DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG, QUOTATION_RESPONSE_STATES, type QuotationResponseEngineConfig, type QuotationResponseState } from '../../shared/quotationResponseEngine';
import { resolveQuotationGuidance, type QuotationGuidanceSource } from './quotationInterruption';

export type QuotationTurnState = { version: 1; sessionId: string; currentQuestion: QuotationTurnQuestion | null; answers: Record<string, string>; attempts: Record<string, number>; ambiguity: 'NONE' | 'CLARIFY' | 'HELP'; lastAnsweredField: string | null };
export type QuotationClassifierAssignment = { fieldName: string; value: string; selectedOptionId?: string | null; selectedOptionValue?: string | null; evidence: string; confidence: number };
export type QuotationClassification = { status: QuotationResponseState; confidence: number; reason: string; assignments: QuotationClassifierAssignment[]; relatedFieldName?: string | null; relatedExplanation?: string | null; clarification?: string | null };
export type QuotationTurnModel = (context: { message: string; currentQuestion: QuotationTurnQuestion | null; questions: QuotationTurnQuestion[]; answers: Record<string, string>; correction: boolean; rule: QuotationResponseEngineConfig; validAnswerExamples: string[]; grounding: { questionId: string | null; questionText: string | null; helpText: string | null; productKnowledge: string } }) => Promise<unknown>;
export type TurnDecision = { status: QuotationResponseState; fieldName: string | null; confidence: number; reason: string; outcome: 'SAVED' | 'CORRECTED' | 'CLARIFY' | 'INTERRUPTION' };

export function isQuotationCorrection(message: string): boolean { return /اصلاح|اشتباه\s*(?:گفتم|شد|کردم)|منظورم|جواب\s*قبلی/.test(normalize(message)); }
/** Safe fallback for non-questionnaire handoff flows; the questionnaire itself uses the structured classifier. */
export function isQuotationInterruption(message: string): boolean { return /[؟?]|چطور|چگونه|راهنما|توضیح/.test(normalize(message)); }

export function applicableQuotationQuestions<T extends QuotationTurnQuestion>(questions: T[], answers: Record<string, string>): T[] {
  const comparable = (value: unknown) => /^(بله|true)$/.test(String(value)) ? 'true' : /^(خیر|false)$/.test(String(value)) ? 'false' : String(value);
  return sortQuotationQuestions(questions).filter(q => {
    if (!q.condition || q.condition === '{}') return true;
    try { const condition = JSON.parse(q.condition); return !condition.dependsOn || comparable(answers[condition.dependsOn]) === comparable(condition.value); }
    catch { return false; }
  });
}

function safeEvidence(message: string, evidence: unknown): string | null {
  if (typeof evidence !== 'string') return null;
  const value = normalize(evidence).trim();
  return value && normalize(message).includes(value) ? value : null;
}
function explicitlyMentionsQuestion(message: string, question: QuotationTurnQuestion): boolean {
  const text = normalize(message);
  return [question.fieldName, question.title, question.aiQuestion || ''].filter(Boolean).some(label => text.includes(normalize(label)));
}

async function canonicalAnswer(q: QuotationTurnQuestion, evidence: string, proposed?: string, optionId?: string | null, confidence = 1): Promise<string | null> {
  const text = normalize(evidence).replace(/[.!،؛]+$/g, '').trim();
  const options = quotationQuestionOptions(q);
  if (!text) return null;
  if (/^(آره|اره|بله|نه|خیر|باشه)$/.test(text) && q.type !== 'boolean' && !options.some(o => /^(بله|خیر|آره|نه|دارد|ندارد)$/.test(normalize(o.value)))) return null;
  if (options.length) {
    const money = resolveQuotationMoney(q, text);
    if (money?.status === 'MATCHED') return money.matchedOption || null;
    if (money?.status === 'OUT_OF_OPTIONS' || isAmbiguousQuotationMoney(q, text)) return null;

    const proposedOption = optionId || proposed ? options.find(option =>
      (!optionId || option.id === optionId) &&
      (!proposed || option.value === proposed)
    ) : undefined;
    const hasNumericEvidence = numbersIn(text, true).length > 0;
    const selection = await resolveQuotationOptionSelection({
      question: q,
      message: text,
      modelSelector: proposedOption && !hasNumericEvidence ? async () => ({
        fieldName: q.fieldName,
        selectedOptionId: proposedOption.id,
        selectedOptionValue: proposedOption.value,
        confidence,
      }) : undefined,
    });
    if (selection.status === 'MATCHED') return selection.selectedOptionValue;

    if (q.type === 'checkbox' && proposed) {
      const values = proposed.split('،').map(value => value.trim()).filter(Boolean);
      if (values.length && values.every(value => options.some(option => option.value === value))) return [...new Set(values)].join('، ');
    }
    return null;
  }
  if (q.type === 'number') {
    const values = numbersIn(text, true);
    if (values.length !== 1 || !isPlainQuotationNumber(text)) return null;
    const value = values[0];
    return (q.minVal == null || value >= q.minVal) && (q.maxVal == null || value <= q.maxVal) ? String(value) : null;
  }
  if (q.type === 'date') {
    const candidate = normalize(proposed || text).replace(/-/g, '/');
    const match = candidate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) return null;
    const month = Number(match[2]); const day = Number(match[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
      ? [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('/')
      : null;
  }
  if ((!q.type || q.type === 'text' || q.type === 'textarea') && proposed === undefined) return null;
  const value = proposed?.trim() || text;
  if (!value || (q.minLength != null && value.length < q.minLength) || (q.maxLength != null && value.length > q.maxLength)) return null;
  return value;
}

function parseClassification(raw: unknown, correction = false): QuotationClassification | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.status !== 'string' || !QUOTATION_RESPONSE_STATES.includes(value.status as QuotationResponseState)) {
    if (Array.isArray(value.assignments)) value.status = value.asksQuestion === true ? 'QUESTION_ABOUT_FIELD' : correction ? 'CORRECTION' : value.assignments.length ? 'VALID_ANSWER' : 'AMBIGUOUS';
    else return null;
  }
  const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence) ? value.confidence : 0;
  if (confidence < 0 || confidence > 1) return null;
  const assignments = Array.isArray(value.assignments) ? value.assignments.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.fieldName !== 'string' || typeof candidate.value !== 'string' || typeof candidate.evidence !== 'string' || typeof candidate.confidence !== 'number') return [];
    return [{ fieldName: candidate.fieldName, value: candidate.value, evidence: candidate.evidence, confidence: candidate.confidence, selectedOptionId: typeof candidate.selectedOptionId === 'string' ? candidate.selectedOptionId : null, selectedOptionValue: typeof candidate.selectedOptionValue === 'string' ? candidate.selectedOptionValue : null }];
  }) : [];
  return { status: value.status as QuotationResponseState, confidence, reason: typeof value.reason === 'string' ? value.reason : 'Classifier returned no reason', assignments, relatedFieldName: typeof value.relatedFieldName === 'string' ? value.relatedFieldName : null, relatedExplanation: typeof value.relatedExplanation === 'string' ? value.relatedExplanation : null, clarification: typeof value.clarification === 'string' ? value.clarification : null };
}

async function safeFallbackClassification(current: QuotationTurnQuestion | null, message: string, correction: boolean): Promise<QuotationClassification> {
  if (!current) return { status: 'UNRELATED', confidence: 1, reason: 'No pending question', assignments: [] };
  const asksQuestion = /[؟?]/.test(message);
  const source = answerPortion(message, asksQuestion) || message;
  const exact = await canonicalAnswer(current, source);
  if (exact !== null) return { status: correction ? 'CORRECTION' : 'VALID_ANSWER', confidence: 1, reason: asksQuestion ? 'Validated answer precedes a secondary question' : 'Deterministic field validation', assignments: [{ fieldName: current.fieldName, value: exact, evidence: source, confidence: 1 }] };
  if (/[؟?]|چطور|چگونه|راهنما|توضیح/.test(message)) return { status: 'QUESTION_ABOUT_FIELD', confidence: .8, reason: 'Safe help-request fallback', assignments: [] };
  return { status: 'AMBIGUOUS', confidence: 0, reason: 'Safe fallback could not validate an answer', assignments: [] };
}

function fillTemplate(template: string, values: Record<string, string>): string { return template.replace(/{{([a-zA-Z]+)}}/g, (_match, key: string) => values[key] || '').replace(/\n{3,}/g, '\n\n').trim(); }
function genericClarification(question: QuotationTurnQuestion, status: QuotationResponseState, attempts: number, message: string): string {
  const options = quotationQuestionOptions(question).map(option => option.value);
  const money = resolveQuotationMoney(question, message);
  if (money?.status === 'OUT_OF_OPTIONS') return `مبلغ ${money.formattedAmount} دریافت شد، اما با گزینه‌های واقعی این سؤال برابر نیست. گزینه‌های معتبر نزدیک: ${money.nearbyOptions.join('، ')}`;
  if (isAmbiguousQuotationMoney(question, message)) return 'مبلغ را دقیق‌تر همراه واحد بفرستید؛ مثلاً مبلغ را کامل به میلیون یا میلیارد تومان بنویسید.';
  if (status === 'RELATED_BUT_WRONG_CATEGORY') return `این پاسخ برای فیلد دیگری قابل استفاده است. برای این مرحله پاسخ «${question.title}» لازم است${options.length ? `؛ گزینه‌های معتبر: ${options.join('، ')}` : ''}.`;
  if (attempts > 1 && options.length) return `برای «${question.title}» یکی از این گزینه‌ها را بفرستید: ${options.join('، ')}`;
  return `لطفاً پاسخ «${question.title}» را کمی روشن‌تر بفرستید${options.length ? `؛ گزینه‌ها: ${options.join('، ')}` : ''}.`;
}

export async function advanceQuotationTurn(input: { sessionId: string; questions: QuotationTurnQuestion[]; answers: Record<string, string>; previous?: QuotationTurnState | null; message: string; model?: QuotationTurnModel; productKnowledge?: string; guidanceSelector?: (context: { message: string; question: QuotationTurnQuestion; knowledge: string }) => Promise<unknown>; engine?: { active: boolean; title: string; priority: number; config: QuotationResponseEngineConfig } | null }) {
  const answers = { ...input.answers };
  const current = applicableQuotationQuestions(input.questions, answers).find(question => question.required && !answers[question.fieldName]) || null;
  const previous = input.previous?.sessionId === input.sessionId ? input.previous : null;
  const attempts = { ...(previous?.attempts || {}) };
  const correction = isQuotationCorrection(input.message);
  const config = input.engine?.config || DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG;
  let classification: QuotationClassification | null = null;
  if (input.engine?.active !== false && input.model) {
    try { classification = parseClassification(await input.model({ message: normalize(input.message), currentQuestion: current, questions: sortQuotationQuestions(input.questions), answers, correction, rule: config, validAnswerExamples: current?.id ? config.questionExamples[current.id] || [] : [], grounding: { questionId: current?.id || null, questionText: current ? quotationQuestionReply(current) : null, helpText: current?.helpText?.trim() || null, productKnowledge: (input.productKnowledge || '').slice(0, 12000) } }), correction); }
    catch { classification = null; }
  }
  if (!classification) classification = await safeFallbackClassification(current, normalize(input.message), correction);
  if (current && !correction && classification.status !== 'VALID_ANSWER') {
    const normalizedMessage = normalize(input.message);
    const deterministicValue = await canonicalAnswer(current, normalizedMessage);
    const money = resolveQuotationMoney(current, normalizedMessage);
    const exactOption = quotationQuestionOptions(current).some(option => normalize(option.value) === normalizedMessage);
    const safeShape = current.type === 'number' || money?.status === 'MATCHED' || exactOption || isPlainQuotationNumber(normalizedMessage);
    if (deterministicValue !== null && safeShape) classification = {
      status: 'VALID_ANSWER', confidence: 1, reason: 'Backend exact validator overrode a non-saving classification',
      assignments: [{ fieldName: current.fieldName, value: deterministicValue, evidence: normalizedMessage, confidence: 1 }],
    };
  }
  const updates: Record<string, string> = {};
  const decisions: TurnDecision[] = [];
  const saveCandidate = async (candidate: QuotationClassifierAssignment, correctionMode: boolean) => {
    const question = input.questions.find(item => item.fieldName === candidate.fieldName);
    const evidence = safeEvidence(input.message, candidate.evidence);
    if (!question || !evidence || candidate.confidence < .75) return false;
    const canSave = question.fieldName === current?.fieldName ||
      (correctionMode && Object.prototype.hasOwnProperty.call(answers, question.fieldName)) ||
      (!correctionMode && !Object.prototype.hasOwnProperty.call(answers, question.fieldName) && explicitlyMentionsQuestion(input.message, question));
    if (!canSave) return false;
    const value = await canonicalAnswer(question, evidence, candidate.selectedOptionValue || candidate.value, candidate.selectedOptionId, candidate.confidence);
    if (value === null) return false;
    updates[question.fieldName] = value; answers[question.fieldName] = value; attempts[question.fieldName] = 0;
    decisions.push({ status: correctionMode ? 'CORRECTION' : 'VALID_ANSWER', fieldName: question.fieldName, confidence: candidate.confidence, reason: classification?.reason || 'Validated classifier assignment', outcome: correctionMode ? 'CORRECTED' : 'SAVED' });
    return true;
  };
  if (classification.status === 'VALID_ANSWER' || classification.status === 'CORRECTION') {
    const duplicateFields = new Set(classification.assignments.filter((candidate, index, list) => list.findIndex(item => item.fieldName === candidate.fieldName) !== index).map(candidate => candidate.fieldName));
    for (const candidate of classification.assignments) if (!duplicateFields.has(candidate.fieldName)) await saveCandidate(candidate, classification.status === 'CORRECTION');
    if (!Object.keys(updates).length) {
      const money = current ? resolveQuotationMoney(current, input.message) : null;
      classification = { ...classification, status: 'AMBIGUOUS', reason: money?.status === 'OUT_OF_OPTIONS'
        ? `Normalized monetary amount ${money.amountToman} has no exact real option`
        : `${classification.reason}; backend rejected non-canonical assignment` };
    }
  }
  const next = applicableQuotationQuestions(input.questions, answers).find(question => question.required && !answers[question.fieldName]) || null;
  if (!Object.keys(updates).length && current && classification.status !== 'QUESTION_ABOUT_FIELD') attempts[current.fieldName] = Math.min(100, (attempts[current.fieldName] || 0) + 1);
  const attemptCount = current ? attempts[current.fieldName] || 0 : 0;
  let helpText = current ? quotationQuestionHelp(current) : '';
  let guidanceSource: QuotationGuidanceSource | null = null;
  if (current && classification.status === 'QUESTION_ABOUT_FIELD') {
    const guidance = await resolveQuotationGuidance({
      message: input.message,
      question: current,
      knowledge: input.productKnowledge || '',
      select: input.guidanceSelector || (async () => ({ passages: [] })),
    });
    helpText = guidance.text;
    guidanceSource = guidance.source;
  }
  const clarification = current ? genericClarification(current, classification.status, attemptCount, input.message) : '';
  const relatedQuestion = classification.relatedFieldName ? input.questions.find(question => question.fieldName === classification.relatedFieldName) : null;
  const relatedExplanation = current ? (relatedQuestion ? `این پاسخ به «${relatedQuestion.title}» مربوط است، نه «${current.title}».` : genericClarification(current, 'RELATED_BUT_WRONG_CATEGORY', attemptCount, input.message)) : '';
  const template = config.states[classification.status]?.template || '{{clarification}}';
  const responseText = fillTemplate(template, { currentQuestion: current ? quotationQuestionReply(current) : '', nextQuestion: next ? quotationQuestionReply(next) : '', helpText, clarification, relatedExplanation, fieldName: current?.fieldName || '', options: current ? quotationQuestionOptions(current).map(option => option.value).join('، ') : '' });
  if (!decisions.length) decisions.push({ status: classification.status, fieldName: current?.fieldName || null, confidence: classification.confidence, reason: classification.reason, outcome: ['QUESTION_ABOUT_FIELD', 'RELATED_BUT_WRONG_CATEGORY', 'UNRELATED'].includes(classification.status) ? 'INTERRUPTION' : 'CLARIFY' });
  const interruption = ['QUESTION_ABOUT_FIELD', 'RELATED_BUT_WRONG_CATEGORY', 'UNRELATED'].includes(classification.status);
  const ambiguity: QuotationTurnState['ambiguity'] = classification.status === 'QUESTION_ABOUT_FIELD' ? 'HELP' : ['AMBIGUOUS', 'RELATED_BUT_WRONG_CATEGORY', 'UNRELATED'].includes(classification.status) ? 'CLARIFY' : 'NONE';
  const state: QuotationTurnState = { version: 1, sessionId: input.sessionId, currentQuestion: next, answers, attempts, ambiguity, lastAnsweredField: Object.keys(updates).at(-1) || previous?.lastAnsweredField || null };
  return { state, currentQuestionBefore: current, updates, decisions, classification, responseText, guidance: guidanceSource ? { source: guidanceSource, helpTextUsed: helpText, questionId: current?.id || null, questionText: current ? quotationQuestionReply(current) : null, productKnowledgeProvided: Boolean(input.productKnowledge?.trim()) } : null, appliedRule: input.engine ? { title: input.engine.title, priority: input.engine.priority, active: input.engine.active } : null, interruption, clarification: Object.keys(updates).length ? null : responseText, nextQuestionText: next ? quotationQuestionReply(next) : null };
}
