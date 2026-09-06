import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceQuotationTurn, type QuotationTurnModel, type QuotationTurnState } from '../server/services/quotationStateMachine';
import { DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG } from '../shared/quotationResponseEngine';
import type { QuotationTurnQuestion } from '../server/services/quotationConversationFlow';

const form: QuotationTurnQuestion[] = [
  { id: 'count', title: 'تعداد طبقات', aiQuestion: 'ساختمان چند طبقه است؟', fieldName: 'floors', type: 'number', required: true, order: 1, minVal: 1, maxVal: 100 },
  { id: 'usage', title: 'نوع کاربری', aiQuestion: 'نوع کاربری ساختمان چیست؟', fieldName: 'usage', type: 'select', options: ['مجتمع مسکونی', 'اداری'], required: true, order: 2 },
  { id: 'safety', title: 'تجهیزات ایمنی', aiQuestion: 'تجهیزات ایمنی دارید؟', fieldName: 'safety', type: 'select', options: ['کپسول آتش‌نشانی', 'سیستم اعلام حریق'], required: true, order: 3, helpText: 'تجهیزات نصب‌شده و فعال را نام ببرید.' },
  { id: 'guard', title: 'نگهبان', aiQuestion: 'آیا نگهبان دارید؟', fieldName: 'guard', type: 'boolean', required: true, order: 4 },
  { id: 'amenities', title: 'امکانات رفاهی', aiQuestion: 'چه امکانات رفاهی دارید؟', fieldName: 'amenities', type: 'text', required: false, order: 5 },
];

const engine = { active: true, title: 'موتور تفسیر پاسخ استعلام', priority: 20, config: DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG };
const classify = (result: Record<string, unknown>): QuotationTurnModel => async () => ({ confidence: .95, reason: 'matrix-test', relatedFieldName: null, relatedExplanation: null, clarification: null, assignments: [], ...result });
const assignment = (fieldName: string, evidence: string, value: string, selectedOptionId: string | null = null) => ({ fieldName, evidence, value, selectedOptionId, selectedOptionValue: selectedOptionId ? value : null, confidence: .95 });

test('matrix: numeric and colloquial option answers are canonical and deterministic', async () => {
  const numeric = await advanceQuotationTurn({ sessionId: 'm', questions: form, answers: {}, message: '۳ طبقه', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('floors', '۳ طبقه', '3')] }) });
  assert.deepEqual(numeric.updates, { floors: '3' });
  assert.equal(numeric.state.currentQuestion?.fieldName, 'usage');
  const option = await advanceQuotationTurn({ sessionId: 'm', questions: form, answers: numeric.state.answers, previous: numeric.state, message: 'خونه‌ست', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('usage', 'خونه‌ست', 'مجتمع مسکونی', 'option-1')] }) });
  assert.deepEqual(option.updates, { usage: 'مجتمع مسکونی' });
});

test('matrix: all non-saving states preserve current field and use the selected rule template', async () => {
  for (const status of ['QUESTION_ABOUT_FIELD', 'RELATED_BUT_WRONG_CATEGORY', 'AMBIGUOUS', 'UNRELATED'] as const) {
    const result = await advanceQuotationTurn({ sessionId: status, questions: form, answers: { floors: '3', usage: 'مجتمع مسکونی' }, message: status === 'QUESTION_ABOUT_FIELD' ? 'چی باید بگم؟' : 'استخر و باشگاه', engine,
      model: classify({ status, relatedFieldName: status === 'RELATED_BUT_WRONG_CATEGORY' ? 'amenities' : null, relatedExplanation: status === 'RELATED_BUT_WRONG_CATEGORY' ? 'استخر و باشگاه امکانات رفاهی هستند، نه تجهیزات ایمنی.' : null, clarification: status === 'AMBIGUOUS' ? 'لطفاً نوع تجهیز ایمنی را مشخص کنید.' : null }) });
    assert.deepEqual(result.updates, {});
    assert.equal(result.state.currentQuestion?.fieldName, 'safety');
    if (status === 'QUESTION_ABOUT_FIELD') assert.match(result.responseText, /تجهیزات نصب‌شده و فعال/);
    if (status === 'RELATED_BUT_WRONG_CATEGORY') assert.match(result.responseText, /امکانات رفاهی/);
  }
});

test('manager-edited response template and priority are the runtime source of truth', async () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_QUOTATION_RESPONSE_ENGINE_CONFIG));
  config.states.AMBIGUOUS.template = 'نیاز به روشن‌سازی برای {{fieldName}}: {{options}}';
  const result = await advanceQuotationTurn({ sessionId: 'configured', questions: form, answers: { floors: '3' }, message: 'شاید یکی',
    engine: { active: true, title: 'قانون قابل مدیریت', priority: 77, config }, model: classify({ status: 'AMBIGUOUS' }) });
  assert.match(result.responseText, /^نیاز به روشن‌سازی برای usage:/);
  assert.deepEqual(result.appliedRule, { title: 'قانون قابل مدیریت', priority: 77, active: true });
  assert.deepEqual(result.updates, {});
});

test('matrix: yes/no is accepted only for boolean current question', async () => {
  const answers = { floors: '3', usage: 'مجتمع مسکونی' };
  const wrong = await advanceQuotationTurn({ sessionId: 'yn', questions: form, answers, message: 'آره', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('safety', 'آره', 'کپسول آتش‌نشانی', 'option-1')] }) });
  assert.deepEqual(wrong.updates, {});
  const yes = await advanceQuotationTurn({ sessionId: 'yn', questions: form, answers: { ...answers, safety: 'کپسول آتش‌نشانی' }, message: 'آره', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('guard', 'آره', 'بله')] }) });
  assert.deepEqual(yes.updates, { guard: 'بله' });
});

test('matrix: correction updates only a real answered field', async () => {
  const answers = { floors: '3', usage: 'مجتمع مسکونی' };
  const result = await advanceQuotationTurn({ sessionId: 'fix', questions: form, answers, message: 'تعداد طبقات را اصلاح کن: ۴', engine, model: classify({ status: 'CORRECTION', assignments: [assignment('floors', '۴', '4')] }) });
  assert.deepEqual(result.updates, { floors: '4' });
  assert.equal(result.state.currentQuestion?.fieldName, 'safety');
});

test('matrix: explicitly labelled multi-field answer saves canonical fields and continues at first unanswered', async () => {
  const result = await advanceQuotationTurn({ sessionId: 'multi', questions: form, answers: {}, message: 'تعداد طبقات: ۳؛ نوع کاربری: مسکونی', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('floors', '۳', '3'), assignment('usage', 'مسکونی', 'مجتمع مسکونی', 'option-1')] }) });
  assert.deepEqual(result.updates, { floors: '3', usage: 'مجتمع مسکونی' });
  assert.equal(result.state.currentQuestion?.fieldName, 'safety');
});

test('matrix: database order and answers rebuild the same queue after refresh', async () => {
  const first = await advanceQuotationTurn({ sessionId: 'refresh', questions: [...form].reverse(), answers: {}, message: '3', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('floors', '3', '3')] }) });
  const persisted: QuotationTurnState = JSON.parse(JSON.stringify(first.state));
  persisted.currentQuestion = form[3];
  const next = await advanceQuotationTurn({ sessionId: 'refresh', questions: [...form].reverse(), answers: first.state.answers, previous: persisted, message: 'مسکونی', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('usage', 'مسکونی', 'مجتمع مسکونی', 'option-1')] }) });
  assert.equal(next.currentQuestionBefore?.fieldName, 'usage');
  assert.equal(next.state.currentQuestion?.fieldName, 'safety');
});

test('matrix: money, checkbox, free text and date remain constrained by their real field schema', async () => {
  const money: QuotationTurnQuestion = { id: 'money', title: 'سرمایه', fieldName: 'capital', type: 'select', options: ['۵۰۰ میلیون تومان', '۱ میلیارد و ۵۰۰ میلیون تومان'], required: true, order: 1 };
  const amount = await advanceQuotationTurn({ sessionId: 'types', questions: [money], answers: {}, message: 'یک و نیم میلیارد', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('capital', 'یک و نیم میلیارد', '۱ میلیارد و ۵۰۰ میلیون تومان', 'option-2')] }) });
  assert.deepEqual(amount.updates, { capital: '۱ میلیارد و ۵۰۰ میلیون تومان' });

  const checkbox: QuotationTurnQuestion = { id: 'features', title: 'پوشش‌ها', fieldName: 'features', type: 'checkbox', options: ['آتش‌سوزی', 'سرقت'], required: true, order: 1 };
  const checked = await advanceQuotationTurn({ sessionId: 'types', questions: [checkbox], answers: {}, message: 'هم آتش‌سوزی هم سرقت', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('features', 'هم آتش‌سوزی هم سرقت', 'آتش‌سوزی، سرقت')] }) });
  assert.deepEqual(checked.updates, { features: 'آتش‌سوزی، سرقت' });

  const text: QuotationTurnQuestion = { id: 'address', title: 'نشانی', fieldName: 'address', type: 'text', required: true, order: 1, minLength: 3 };
  const textResult = await advanceQuotationTurn({ sessionId: 'types', questions: [text], answers: {}, message: 'تهران، ونک', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('address', 'تهران، ونک', 'تهران، ونک')] }) });
  assert.deepEqual(textResult.updates, { address: 'تهران، ونک' });

  const date: QuotationTurnQuestion = { id: 'date', title: 'تاریخ', fieldName: 'date', type: 'date', required: true, order: 1 };
  const dateResult = await advanceQuotationTurn({ sessionId: 'types', questions: [date], answers: {}, message: '۱۴۰۵/۰۶/۱۵', engine, model: classify({ status: 'VALID_ANSWER', assignments: [assignment('date', '۱۴۰۵/۰۶/۱۵', '1405/06/15')] }) });
  assert.deepEqual(dateResult.updates, { date: '1405/06/15' });
});
