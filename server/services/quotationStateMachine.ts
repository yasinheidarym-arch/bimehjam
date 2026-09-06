import { analyzeQuotationMessage, answerPortion, quotationQuestionReply, type QuotationTurnQuestion } from './quotationConversationFlow';
import { isQuotationHelpRequest } from './quotationQuestionHelp';
import { normalizeQuotationOptionText as normalize, numbersIn, isPlainQuotationNumber, quotationQuestionOptions, resolveQuotationOptionSelection } from './quotationOptionMatchingService';

export type QuotationTurnState = {
  version: 1;
  sessionId: string;
  currentQuestion: QuotationTurnQuestion | null;
  answers: Record<string, string>;
  attempts: Record<string, number>;
  ambiguity: 'NONE' | 'CLARIFY' | 'HELP';
  lastAnsweredField: string | null;
};
export type QuotationTurnModel = (context: {
  message: string; currentQuestion: QuotationTurnQuestion | null;
  questions: QuotationTurnQuestion[]; answers: Record<string, string>; correction: boolean;
}) => Promise<unknown>;
export type TurnDecision = {
  fieldName: string | null; confidence: number; reason: string;
  outcome: 'SAVED' | 'CORRECTED' | 'CLARIFY' | 'INTERRUPTION';
};

export function isQuotationCorrection(message: string): boolean {
  return /اصلاح|اشتباه\s*(?:گفتم|شد|کردم)|منظورم|جواب\s*قبلی/.test(normalize(message));
}

export function applicableQuotationQuestions<T extends QuotationTurnQuestion>(questions: T[], answers: Record<string, string>): T[] {
  const comparable = (value: unknown) => /^(بله|true)$/.test(String(value)) ? 'true' : /^(خیر|false)$/.test(String(value)) ? 'false' : String(value);
  return [...questions].sort((a, b) => a.order - b.order || String(a.id || '').localeCompare(String(b.id || ''))).filter(q => {
    if (!q.condition || q.condition === '{}') return true;
    try {
      const condition = JSON.parse(q.condition);
      return !condition.dependsOn || comparable(answers[condition.dependsOn]) === comparable(condition.value);
    } catch { return false; }
  });
}

export function isQuotationInterruption(text: string): boolean {
  return isQuotationHelpRequest(text) || /[؟?]|چرا|چطور|چگونه|چقدر|توضیح|راهنمایی|پوشش.*چی|چی.*پوشش/.test(text);
}
function answerLike(text: string): boolean {
  return !/سلام|هوا|فوتبال|قیمت|هزینه|تومان|نمی\s*دانم|نمی\s*دونم|شاید|یا\s/.test(text);
}

function mentionsField(message: string, q: QuotationTurnQuestion): boolean {
  if (message.includes(normalize(q.title)) || message.includes(normalize(q.fieldName))) return true;
  const generic = new Set(['ساختمان', 'بیمه', 'مورد', 'شما', 'تعداد', 'نوع', 'کل', 'جمع', 'مجموع', 'چند', 'است', 'دارد', 'چیست', 'چقدر', 'با', 'از', 'در', 'و', 'یا']);
  const tokens = normalize(q.title).split(/[\s؟?،,:]+/).filter(token => token.length >= 2 && !generic.has(token));
  return tokens.some(token => (` ${message.replace(/[،؛:؟?]/g, ' ')} `).includes(` ${token} `));
}

async function canonicalAnswer(q: QuotationTurnQuestion, evidence: string, proposed?: string): Promise<string | null> {
  const text = normalize(evidence).replace(/[.!،؛]+$/g, '').trim();
  const options = quotationQuestionOptions(q);
  if (/^(آره|اره|بله|نه|خیر|باشه)$/.test(text) && q.type !== 'boolean' &&
      !options.some(o => /^(بله|خیر|آره|نه|دارد|ندارد)$/.test(o.value))) return null;
  if (!text || isQuotationInterruption(text) || !answerLike(text)) return null;
  if (options.length) {
    if (numbersIn(text, true).length && !isPlainQuotationNumber(text) && !options.some(o => normalize(o.value) === text)) return null;
    if (q.type === 'checkbox') {
      const chosen = options.filter(o => text.includes(normalize(o.value)));
      if (chosen.length && !/نیست|ندار|نمی/.test(text)) return chosen.map(o => o.value).join('، ');
      const proposedOptions = proposed?.split('،').map(v => v.trim()).filter(Boolean) || [];
      return proposedOptions.length && proposedOptions.every(v => options.some(o => o.value === v)) ? [...new Set(proposedOptions)].join('، ') : null;
    }
    const selection = await resolveQuotationOptionSelection({ question: q, message: text });
    if (selection.status === 'MATCHED') return selection.selectedOptionValue;
    if (numbersIn(text, true).length) return null;
    // A model's semantic choice is still constrained to the current real options.
    return proposed && options.some(o => o.value === proposed) ? proposed : null;
  }
  if (q.type === 'number') {
    const numbers = numbersIn(text, true);
    if (numbers.length !== 1) return null;
    if (!isPlainQuotationNumber(text)) return null;
    const value = numbers[0];
    return (q.minVal == null || value >= q.minVal) && (q.maxVal == null || value <= q.maxVal) ? String(value) : null;
  }
  const analysis = analyzeQuotationMessage(q, text);
  // Unstructured text needs an evidence-backed semantic relevance decision.
  if ((!q.type || q.type === 'text' || q.type === 'textarea') && proposed === undefined) return null;
  return analysis.validAnswer ? analysis.answerValue : null;
}

export async function advanceQuotationTurn(input: {
  sessionId: string; questions: QuotationTurnQuestion[]; answers: Record<string, string>;
  previous?: QuotationTurnState | null; message: string; model?: QuotationTurnModel;
}) {
  const answers = { ...input.answers };
  const current = applicableQuotationQuestions(input.questions, answers).find(q => q.required && !answers[q.fieldName]) || null;
  const previous = input.previous?.sessionId === input.sessionId ? input.previous : null;
  const attempts = { ...(previous?.attempts || {}) };
  const message = normalize(input.message);
  const correction = isQuotationCorrection(message);
  let interruption = isQuotationInterruption(message);
  const decisions: TurnDecision[] = [];
  const updates: Record<string, string> = {};
  let source = answerPortion(message, interruption);
  const offContextYesNo = /^(آره|اره|بله|نه|خیر|باشه)$/.test(message) && current?.type !== 'boolean' &&
    !quotationQuestionOptions(current || { title: '', fieldName: '', required: true, order: 0 }).some(o => /^(بله|خیر|آره|نه|دارد|ندارد)$/.test(o.value));

  const save = (q: QuotationTurnQuestion, value: string, confidence: number) => {
    updates[q.fieldName] = value;
    decisions.push({ fieldName: q.fieldName, confidence, reason: answers[q.fieldName] ? 'Explicit correction with validated evidence' : 'Validated against real field type/options', outcome: answers[q.fieldName] ? 'CORRECTED' : 'SAVED' });
    answers[q.fieldName] = value;
    attempts[q.fieldName] = 0;
  };
  if (current && !correction && !offContextYesNo) {
    const value = await canonicalAnswer(current, source);
    // Multiple labelled values must be interpreted together, not assigned to the pending field by position.
    const otherLabel = input.questions.some(q => q.fieldName !== current.fieldName && mentionsField(source, q));
    if (value !== null && !/[؛;\n:]/.test(source) && !otherLabel) save(current, value, 1);
  }

  if (!Object.keys(updates).length && !offContextYesNo && !(isQuotationHelpRequest(message) && !source) && input.model) {
    let raw: unknown;
    try { raw = await input.model({ message, currentQuestion: current, questions: input.questions, answers, correction }); } catch { raw = null; }
    const result = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    interruption ||= result.asksQuestion === true;
    if (interruption) source = answerPortion(message, true);
    const candidates = Array.isArray(result.assignments) ? result.assignments : [];
    const seen = new Set<string>();
    for (const item of candidates.slice(0, input.questions.length)) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as Record<string, unknown>;
      if (candidates.filter(c => c && typeof c === 'object' && c.fieldName === candidate.fieldName).length > 1) continue;
      if (typeof candidate.fieldName !== 'string' || seen.has(candidate.fieldName)) continue;
      seen.add(candidate.fieldName);
      const q = input.questions.find(q => q.fieldName === candidate.fieldName);
      const evidence = typeof candidate.evidence === 'string' ? normalize(candidate.evidence) : '';
      const confidence = candidate.confidence;
      if (!q || !evidence || !message.includes(evidence) || typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0.85 || confidence > 1) {
        decisions.push({ fieldName: q?.fieldName || null, confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0, outcome: 'CLARIFY', reason: 'Unknown field, missing evidence or insufficient confidence' });
        continue;
      }
      if (answers[q.fieldName] && !correction) continue;
      if (q.fieldName !== current?.fieldName) {
        const labelled = mentionsField(message, q);
        const previousCorrection = correction && q.fieldName === previous?.lastAnsweredField && /قبلی|اشتباه گفتم/.test(message);
        if (!labelled && !previousCorrection) continue;
      }
      if (!applicableQuotationQuestions(input.questions, answers).some(active => active.fieldName === q.fieldName)) continue;
      if (interruption && !source.includes(evidence)) continue;
      const value = await canonicalAnswer(q, evidence, typeof candidate.value === 'string' ? candidate.value : undefined);
      if (value !== null) save(q, value, confidence);
      else decisions.push({ fieldName: q.fieldName, confidence, outcome: 'CLARIFY', reason: 'Evidence does not satisfy current field constraints' });
    }
  }
  const next = applicableQuotationQuestions(input.questions, answers).find(q => q.required && !answers[q.fieldName]) || null;
  let clarification: string | null = null;
  let ambiguity: QuotationTurnState['ambiguity'] = 'NONE';
  if (!Object.keys(updates).length && !interruption && current) {
    attempts[current.fieldName] = Math.min(100, (attempts[current.fieldName] || 0) + 1);
    const count = attempts[current.fieldName];
    ambiguity = count > 1 ? 'HELP' : 'CLARIFY';
    const options = quotationQuestionOptions(current).map(o => o.value);
    clarification = count === 1
      ? `برای «${current.title}» ${current.type === 'number' ? 'چه عددی را ثبت کنم؟' : 'منظورتان دقیقاً چیست؟'}`
      : `${options.length ? `گزینه‌های همین سؤال: ${options.join('، ')}. ` : ''}پاسخ‌های قبلی محفوظ است؛ می‌توانید برای همین مورد توضیح بیشتر یا راهنمایی کارشناس بخواهید، یا پاسخ را دوباره بفرستید.`;
    decisions.push({ fieldName: current.fieldName, confidence: 0, reason: offContextYesNo ? 'Yes/no outside a boolean question' : 'No unambiguous valid answer for current field', outcome: 'CLARIFY' });
  }
  if (correction && !Object.keys(updates).length && !interruption) {
    ambiguity = 'CLARIFY';
    clarification = 'کدام پاسخ قبلی را اصلاح کنم؟ لطفاً نام همان مورد و پاسخ درست را بفرستید؛ پاسخ‌های قبلی محفوظ است.';
    decisions.push({ fieldName: null, confidence: 0, outcome: 'CLARIFY', reason: 'Correction target/value not sufficiently clear; no previous answer overwritten' });
  }
  if (interruption) decisions.push({ fieldName: current?.fieldName || null, confidence: 1, outcome: 'INTERRUPTION', reason: 'Customer question must not advance the questionnaire without a validated answer' });
  const state: QuotationTurnState = { version: 1, sessionId: input.sessionId, currentQuestion: next, answers, attempts, ambiguity,
    lastAnsweredField: Object.keys(updates).at(-1) || previous?.lastAnsweredField || null };
  return { state, currentQuestionBefore: current, updates, decisions, interruption, clarification, nextQuestionText: next ? quotationQuestionReply(next) : null };
}
