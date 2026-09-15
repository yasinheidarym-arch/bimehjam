import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceQuotationTurn, canonicalQuotationAnswer } from '../server/services/quotationStateMachine.ts';
import type { QuotationTurnQuestion } from '../server/services/quotationConversationFlow.ts';
import { isStaleQuotationTurn } from '../shared/quotationTurnBinding.ts';
import { renderQuotationCompletionSuccess } from '../shared/quotationCompletionRule.ts';

const durationQuestion: QuotationTurnQuestion = {
  id: 'duration', title: 'مدت بیمه‌نامه', fieldName: 'duration', type: 'select', required: true, order: 1,
  options: ['کمتر از یک سال', 'یک‌ساله'],
};
const nextQuestion: QuotationTurnQuestion = {
  id: 'next', title: 'مرحله بعد', fieldName: 'next', type: 'number', required: true, order: 2,
};

test('duration values normalize and map to the real canonical option without an LLM call', async () => {
  for (const message of ['۳۰ روز', '۳ ماه', 'شش ماه']) {
    let calls = 0;
    const result = await advanceQuotationTurn({
      sessionId: `duration-${message}`, questions: [durationQuestion, nextQuestion], answers: {}, message,
      model: async () => { calls += 1; throw new Error('deterministic typed answer must not call the model'); },
    });
    assert.deepEqual(result.updates, { duration: 'کمتر از یک سال' }, message);
    assert.equal(result.state.currentQuestion?.id, 'next');
    assert.equal(result.decisionSource, 'TYPED_ANSWER_ENGINE');
    assert.equal(result.performance.modelCallCount, 0);
    assert.equal(calls, 0);
  }
  assert.equal(await canonicalQuotationAnswer({ ...durationQuestion, type: 'duration', options: [] }, '۳۰ روز'), 'P30D');
});

test('number words and exact enum values use the same typed validation contract', async () => {
  const area: QuotationTurnQuestion = { id: 'area', title: 'متراژ', fieldName: 'area', type: 'number', required: true, order: 1 };
  assert.equal(await canonicalQuotationAnswer(area, 'هزار متر'), '1000');
  assert.equal(await canonicalQuotationAnswer(area, '1000 متر'), '1000');

  const structure: QuotationTurnQuestion = {
    id: 'structure', title: 'نوع سازه', fieldName: 'structure', type: 'select', required: true, order: 1,
    options: ['بتنی', 'فلزی'],
  };
  const result = await advanceQuotationTurn({ sessionId: 'enum', questions: [structure, nextQuestion], answers: {}, message: 'بتنی' });
  assert.deepEqual(result.updates, { structure: 'بتنی' });
  assert.equal(result.state.currentQuestion?.id, 'next');
});

test('question and session revisions reject late answers even when field identity is unchanged', () => {
  const visible = {
    sessionId: 'session', productId: 'product', questionId: 'question', fieldName: 'area',
    questionRevision: '2026-09-15T10:00:00.000Z', stateVersion: '2026-09-15T10:00:00.000Z',
  };
  assert.equal(isStaleQuotationTurn(visible, { ...visible }), false);
  assert.equal(isStaleQuotationTurn(visible, { ...visible, questionRevision: '2026-09-15T10:01:00.000Z' }), true);
  assert.equal(isStaleQuotationTurn(visible, { ...visible, stateVersion: '2026-09-15T10:01:00.000Z' }), true);
});

test('salutation is explicit-only and unresolved template tokens never reach the customer', () => {
  const template = 'ممنونم {{customerTitle}} {{customerLastName}}. {{unknown}} [آقای/خانم] درخواست ثبت شد.';
  const titled = renderQuotationCompletionSuccess(template, null, { title: 'خانم', firstName: 'سارا', lastName: 'احمدی' });
  assert.match(titled, /خانم احمدی/);

  const neutral = renderQuotationCompletionSuccess(template, null, { fullName: 'محمد مصطفوی' });
  assert.match(neutral, /محمد مصطفوی/);
  assert.doesNotMatch(neutral, /آقای\/خانم|\{\{|\[[^\]]+\]/);
});
