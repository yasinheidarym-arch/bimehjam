import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaleQuotationTurn } from '../shared/quotationTurnBinding.ts';
import { hasProductGrounding } from '../shared/productGrounding.ts';
import { goftinoMessageType } from '../shared/goftinoMessageType.ts';
import { canonicalQuotationHistoryPrefill } from '../server/services/quotationStateMachine.ts';
import { startQuotationSubmission, advanceQuotationSubmission } from '../server/services/quotationSubmissionFlow.ts';
import { resolveAiBehaviorRulesFromRecords } from '../server/services/aiBehaviorRuntime.ts';

const binding = { sessionId: 's1', productId: 'p1', questionId: 'q1', fieldName: 'material' };

test('queued answer is stale when the real pending question has advanced', () => {
  assert.equal(isStaleQuotationTurn(binding, { ...binding, questionId: 'q2', fieldName: 'progress' }), true);
  assert.equal(isStaleQuotationTurn(binding, binding), false);
});

test('product existence alone is not product grounding', () => {
  assert.equal(hasProductGrounding({ aiKnowledgeArticle: '', description: '  ' }), false);
  assert.equal(hasProductGrounding({ aiKnowledgeArticle: 'دانش تاییدشده محصول' }), true);
});

test('Goftino image is represented as IMAGE and cannot masquerade as text', () => {
  assert.equal(goftinoMessageType('photo'), 'IMAGE');
  assert.equal(goftinoMessageType('text'), 'TEXT');
});

test('clear prior duration can prefill its matching field only', async () => {
  const result = await canonicalQuotationHistoryPrefill([{
    id: 'duration', fieldName: 'policy_duration', title: 'مدت بیمه‌نامه', aiQuestion: null,
    type: 'number', required: true, order: 1, options: null, condition: null,
    helpText: null, minVal: 1, maxVal: 365, minLength: null, maxLength: null,
  }], [{ senderType: 'CUSTOMER', content: 'مدت کار سه ماه و حدود 90 روز است' }]);
  assert.deepEqual(result, { policy_duration: '90' });
});

test('new quotation completion waits for summary confirmation after profile is complete', () => {
  const result = startQuotationSubmission({
    sessionId: 's', productId: 'p', productName: 'محصول', answers: [], choicePrompt: 'legacy',
    existingProfile: { fullName: 'محمد شجاع', mobile: '09120000000', city: 'تهران' },
  });
  assert.equal(result.action, 'ASK');
  assert.equal(result.state.step, 'CONFIRM');
  assert.equal(result.state.status, 'AWAITING_CONFIRMATION');
  assert.match(result.replyText, /محمد شجاع/);
});

test('profile collection shows summary after city and routes only on confirmation', () => {
  const initial = startQuotationSubmission({
    sessionId: 's', productId: 'p', productName: 'محصول', answers: [], choicePrompt: 'legacy',
    existingProfile: { fullName: 'محمد شجاع', mobile: '09120000000' },
  });
  assert.equal(initial.action, 'ASK');
  const summary = advanceQuotationSubmission(initial.state, 'تهران');
  assert.equal(summary.action, 'ASK');
  assert.equal(summary.state.step, 'CONFIRM');
  const result = advanceQuotationSubmission(summary.state, 'تایید می کنم');
  assert.equal(result.action, 'ROUTE');
  if (result.action === 'ROUTE') assert.equal(result.route, 'CALL');
});

test('product-specific manager rule is rejected outside its configured product scope', () => {
  const records = [{
    id: 'manager-rule', title: 'مدیر ساختمان', category: 'CUSTOM', enforcementLevel: 'STRICT', status: 'ACTIVE', sortOrder: 1,
    directive: JSON.stringify({ version: 1, instruction: 'راهنمای مدیر ساختمان', scope: { productIds: ['manager-product'] } }),
  }];
  const outside = resolveAiBehaviorRulesFromRecords(records, { channel: 'GOFTINO', productId: 'construction-product', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER' });
  const inside = resolveAiBehaviorRulesFromRecords(records, { channel: 'GOFTINO', productId: 'manager-product', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER' });
  assert.equal(outside.selected.length, 0);
  assert.equal(inside.selected.length, 1);
});
