import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceQuotationTurn } from '../server/services/quotationStateMachine';
import { resolveQuotationGuidance } from '../server/services/quotationInterruption';
import { handleTerminalQuotationSubmission, startQuotationSubmission, type QuotationSubmissionState } from '../server/services/quotationSubmissionFlow';
import { quotationQuestionReply, type QuotationTurnQuestion } from '../server/services/quotationConversationFlow';
import { buildQuotationAudit } from '../server/services/quotationAudit';

const amountQuestion: QuotationTurnQuestion = {
  id: 'article-66', title: 'پوشش تبصره یک ماده ۶۶',
  aiQuestion: 'پوشش تبصره یک ماده ۶۶ تأمین اجتماعی چقدر باشد؟',
  fieldName: 'article66', type: 'select', required: true, order: 1,
  options: ['بدون پوشش', 'یک میلیارد تومان'],
  helpText: 'یکی از مبلغ‌های ثبت‌شده را براساس نیازتان در نظر بگیرید.',
};
const nextQuestion: QuotationTurnQuestion = {
  id: 'next', title: 'تعداد کارکنان', aiQuestion: 'تعداد کارکنان چند نفر است؟',
  fieldName: 'employees', type: 'number', required: true, order: 2, minVal: 1, maxVal: 1000,
};

function terminal(status: 'FAILED' | 'SUBMITTED'): QuotationSubmissionState {
  return {
    pending: false, status, step: 'DELIVERY_CHOICE', sessionId: 'session-1',
    productId: 'product-1', productName: 'محصول آزمایشی', answers: [], profile: {},
    choicePrompt: 'تماس یا چت؟', deliveryChoice: 'CHAT', idempotencyKey: 'submission-1',
    currentPageUrl: 'https://example.test/product', categoryId: 'category-1', categoryName: 'مسئولیت',
  };
}

test('guidance level 1 uses semantically adequate Help Text', async () => {
  const result = await resolveQuotationGuidance({
    message: 'کدام مبلغ را باید انتخاب کنم؟', question: amountQuestion, knowledge: 'دانش محصول',
    select: async () => ({ source: 'HELP_TEXT', helpResponse: 'مبلغ ثبت‌شده را با توجه به نیازتان در نظر بگیرید.', passages: [] }),
  });
  assert.equal(result.source, 'HELP_TEXT');
});

test('guidance level 2 bypasses insufficient Help Text for product knowledge', async () => {
  const result = await resolveQuotationGuidance({
    message: 'ماده ۶۶ چیست؟', question: amountQuestion,
    knowledge: 'ماده ۶۶ درباره مسئولیت کارفرما در قبال هزینه‌های ناشی از حادثه کار است.',
    select: async () => ({ source: 'PRODUCT_KNOWLEDGE', helpResponse: 'ماده ۶۶ به مسئولیت کارفرما در قبال هزینه‌های حادثه کار مربوط است.', passages: [] }),
  });
  assert.equal(result.source, 'PRODUCT_KNOWLEDGE');
  assert.match(result.text, /مسئولیت کارفرما/);
});

test('guidance level 3 allows bounded general knowledge without product inventions', async () => {
  const result = await resolveQuotationGuidance({
    message: 'ماده ۶۶ چیست؟', question: amountQuestion, knowledge: '',
    select: async () => ({ source: 'GENERAL_MODEL_KNOWLEDGE', helpResponse: 'ماده 66 به مسئولیت کارفرما در رخدادهای کاری مرتبط است و جزئیات پوشش به بیمه‌نامه بستگی دارد.', passages: [] }),
  });
  assert.equal(result.source, 'GENERAL_MODEL_KNOWLEDGE');
  assert.doesNotMatch(result.text, /تومان|قیمت قطعی/);
});

test('guidance level 4 reports an honest limitation', async () => {
  const result = await resolveQuotationGuidance({
    message: 'شرط اختصاصی بیمه‌گر چیست؟', question: { ...amountQuestion, helpText: '' }, knowledge: '',
    select: async () => ({ source: 'HONEST_LIMITATION', helpResponse: 'شرط اختصاصی این پوشش نیاز به بررسی کارشناس دارد.', passages: [] }),
  });
  assert.equal(result.source, 'HONEST_LIMITATION');
});

test('ANSWER_AND_QUESTION saves the canonical answer, answers guidance, then advances', async () => {
  const result = await advanceQuotationTurn({
    sessionId: 'answer-question', questions: [amountQuestion, nextQuestion], answers: {},
    message: 'بدون پوشش؛ ماده ۶۶ چیست؟', productKnowledge: 'ماده ۶۶ به مسئولیت کارفرما مربوط است.',
    model: async () => ({ status: 'ANSWER_AND_QUESTION', confidence: .98, reason: 'answer plus question', relatedFieldName: null, relatedExplanation: null, clarification: null,
      assignments: [{ fieldName: 'article66', value: 'بدون پوشش', selectedOptionId: 'option-1', selectedOptionValue: 'بدون پوشش', evidence: 'بدون پوشش', confidence: .98 }] }),
    guidanceSelector: async () => ({ source: 'PRODUCT_KNOWLEDGE', helpResponse: 'ماده ۶۶ به مسئولیت کارفرما مربوط است.', passages: [] }),
  });
  assert.equal(result.updates.article66, 'بدون پوشش');
  assert.match(result.responseText, /تعداد کارکنان/);
});

test('QUESTION_ABOUT_CURRENT_FIELD never stores or advances', async () => {
  const result = await advanceQuotationTurn({ sessionId: 'help', questions: [amountQuestion, nextQuestion], answers: {}, message: 'منظور این سؤال چیست؟',
    model: async () => ({ status: 'QUESTION_ABOUT_CURRENT_FIELD', confidence: .99, reason: 'help', relatedFieldName: null, relatedExplanation: null, clarification: null, assignments: [] }),
    guidanceSelector: async () => ({ source: 'HELP_TEXT', helpResponse: 'مبلغ ثبت‌شده را براساس نیازتان در نظر بگیرید.', passages: [] }),
  });
  assert.deepEqual(result.updates, {});
  assert.equal(result.state.currentQuestion?.fieldName, 'article66');
});

test('semantic MULTI_FIELD_ANSWER may save only backend-valid real fields', async () => {
  const result = await advanceQuotationTurn({ sessionId: 'multi', questions: [nextQuestion, { ...nextQuestion, id: 'floors', fieldName: 'floors', title: 'طبقات', aiQuestion: 'چند طبقه است؟', order: 3 }], answers: {}, message: 'کارکنان 10 نفر و ساختمان 4 طبقه است',
    model: async () => ({ status: 'MULTI_FIELD_ANSWER', confidence: .97, reason: 'two explicit values', relatedFieldName: null, relatedExplanation: null, clarification: null, assignments: [
      { fieldName: 'employees', value: '10', evidence: '10 نفر', confidence: .97 },
      { fieldName: 'floors', value: '4', evidence: '4 طبقه', confidence: .97 },
    ] }),
  });
  assert.deepEqual(result.updates, { employees: '10', floors: '4' });
});

for (const status of ['AMBIGUOUS', 'UNRELATED', 'REQUEST_HUMAN', 'CANCEL_OR_PAUSE', 'START_NEW_QUOTATION'] as const) {
  test(`${status} preserves the current question and stores nothing`, async () => {
    const result = await advanceQuotationTurn({ sessionId: status, questions: [nextQuestion], answers: {}, message: 'پیام آزمایشی',
      model: async () => ({ status, confidence: .95, reason: status, relatedFieldName: null, relatedExplanation: null, clarification: 'پیام روشن و مرتبط با همان وضعیت', assignments: [] }),
    });
    assert.deepEqual(result.updates, {});
    assert.equal(result.state.currentQuestion?.fieldName, 'employees');
  });
}

test('CORRECTION updates an answered field and does not manufacture a question', async () => {
  const result = await advanceQuotationTurn({ sessionId: 'correction', questions: [nextQuestion], answers: { employees: '2' }, message: 'تعداد کارکنان 3 نفر است، پاسخ قبلی اصلاح شود',
    model: async () => ({ status: 'CORRECTION', confidence: .99, reason: 'explicit correction', relatedFieldName: null, relatedExplanation: null, clarification: null,
      assignments: [{ fieldName: 'employees', value: '3', evidence: '3 نفر', confidence: .99 }] }),
  });
  assert.equal(result.updates.employees, '3');
  assert.equal(result.state.currentQuestion, null);
});

test('FAILED explanation remains terminal and preserves submission identity', () => {
  const state = terminal('FAILED');
  const result = handleTerminalQuotationSubmission(state, 'ASK_FAILURE_REASON');
  assert.equal(result.action, 'REPLY');
  assert.equal(result.state.sessionId, state.sessionId);
  assert.equal(result.state.idempotencyKey, state.idempotencyKey);
});

test('FAILED retry routes the same session and idempotency key', () => {
  const state = terminal('FAILED');
  const result = handleTerminalQuotationSubmission(state, 'RETRY_SUBMISSION');
  assert.equal(result.action, 'RETRY');
  assert.equal(result.state.sessionId, 'session-1');
  assert.equal(result.state.idempotencyKey, 'submission-1');
});

test('only explicit START_NEW_QUOTATION releases a terminal session', () => {
  assert.equal(handleTerminalQuotationSubmission(terminal('FAILED'), 'START_NEW_QUOTATION').action, 'RELEASE');
  assert.equal(handleTerminalQuotationSubmission(terminal('FAILED'), 'OTHER').action, 'REPLY');
  assert.equal(handleTerminalQuotationSubmission(terminal('SUBMITTED'), 'OTHER').action, 'REPLY');
});

test('profile and delivery state preserve page, product, category and session context', () => {
  const result = startQuotationSubmission({ sessionId: 'session-x', productId: 'product-x', productName: 'محصول', answers: [], existingProfile: {}, choicePrompt: 'انتخاب کنید', currentPageUrl: 'https://example.test/x', categoryId: 'category-x', categoryName: 'مسئولیت' });
  assert.deepEqual({ session: result.state.sessionId, product: result.state.productId, page: result.state.currentPageUrl, category: result.state.categoryId }, { session: 'session-x', product: 'product-x', page: 'https://example.test/x', category: 'category-x' });
});

test('answer validation and response validation remain separate audit concepts', () => {
  const result = buildQuotationAudit({
    messageId: 'message-1', conversationId: 'conversation-1', quotationSessionId: 'session-1',
    submissionId: 'submission-1', currentFieldName: 'employees', decisionSource: 'AI_CLASSIFIER_WITH_BACKEND_VALIDATOR',
    answerValidation: { status: 'SAVED', reason: 'canonical option', canonicalValue: '2', confidence: .98, fieldName: 'employees' },
    responseValidation: { status: 'PASSED', reason: 'safe response' },
  });
  assert.equal(result.answerValidation?.status, 'SAVED');
  assert.equal(result.responseValidation.status, 'PASSED');
  assert.equal(result.audit.messageId, 'message-1');
  assert.equal(result.audit.decisionSource, 'AI_CLASSIFIER_WITH_BACKEND_VALIDATOR');
});

test('customer-facing question is the canonical administrator-authored text without model rewriting', () => {
  const question = {
    ...nextQuestion,
    title: 'تمدیدی بودن بیمه‌نامه',
    aiQuestion: 'آیا بیمه‌نامه تمدیدی است؟ یعنی قبلاً نزد بیمه جم بیمه داشته‌اید؟',
  };
  assert.equal(quotationQuestionReply(question), question.aiQuestion);
  assert.doesNotMatch(quotationQuestionReply(question), /Finest|بیم\s+Finest/);
});
