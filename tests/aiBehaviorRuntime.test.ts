import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAiBehaviorSystemPrompt, resolveAiBehaviorRulesFromRecords, validateRequestedAction, type AiBehaviorRuleRecord } from '../server/services/aiBehaviorRuntime';
import { serializeAiBehaviorRuleEnvelope } from '../shared/aiBehaviorRuntime';

const now = '2026-09-08T00:00:00.000Z';
const rule = (id: string, directive: string, extra: Partial<AiBehaviorRuleRecord> = {}): AiBehaviorRuleRecord => ({
  id, title: id, directive, category: 'CUSTOM', enforcementLevel: 'STRICT', status: 'ACTIVE', sortOrder: 10,
  createdAt: now, updatedAt: now, ...extra,
});
const context = { channel: 'GOFTINO', productId: 'p1', categoryId: 'c1', intent: 'Insurance Quotation', conversationState: 'QUOTATION', quotationState: 'IN_PROGRESS', currentField: 'age', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER' };

test('editing a rule affects the next resolution without deploy or cache', () => {
  const before = resolveAiBehaviorRulesFromRecords([rule('tone', 'پاسخ رسمی')], context);
  const after = resolveAiBehaviorRulesFromRecords([rule('tone', 'پاسخ صمیمی', { updatedAt: '2026-09-08T00:01:00.000Z' })], context);
  assert.equal(before.selected[0].instruction, 'پاسخ رسمی');
  assert.equal(after.selected[0].instruction, 'پاسخ صمیمی');
  assert.notEqual(before.selected[0].version, after.selected[0].version);
});

test('enable and disable are observed on the immediately following resolution', () => {
  const enabled = resolveAiBehaviorRulesFromRecords([rule('r', 'فعال')], context);
  const disabled = resolveAiBehaviorRulesFromRecords([rule('r', 'فعال', { status: 'INACTIVE' })], context);
  assert.equal(enabled.selected.length, 1);
  assert.equal(disabled.selected.length, 0);
  assert.equal(disabled.rejected[0].reason, 'INACTIVE');
});

test('field, product, category and general scopes resolve in specificity order', () => {
  const scoped = [
    rule('general', 'general'),
    rule('category', serializeAiBehaviorRuleEnvelope({ version: 1, instruction: 'category', scope: { categoryIds: ['c1'] } })),
    rule('product', serializeAiBehaviorRuleEnvelope({ version: 1, instruction: 'product', scope: { productIds: ['p1'] } })),
    rule('field', serializeAiBehaviorRuleEnvelope({ version: 1, instruction: 'field', scope: { fieldNames: ['age'] } })),
  ];
  assert.deepEqual(resolveAiBehaviorRulesFromRecords(scoped, context).selected.map(item => item.id), ['field', 'product', 'category', 'general']);
});

test('conflicting rules have one deterministic winner and a traced loser', () => {
  const make = (id: string, priority: number) => rule(id, serializeAiBehaviorRuleEnvelope({ version: 1, instruction: id, conflictKey: 'tone' }), { sortOrder: priority });
  const result = resolveAiBehaviorRulesFromRecords([make('later', 20), make('winner', 1)], context);
  assert.deepEqual(result.selected.map(item => item.id), ['winner']);
  assert.deepEqual(result.rejected.map(item => [item.id, item.reason, item.conflictingRuleId]), [['later', 'LOWER_PRIORITY_CONFLICT', 'winner']]);
});

test('scope mismatch, malformed config and no relevant rule fall back safely', () => {
  const result = resolveAiBehaviorRulesFromRecords([
    rule('other-product', serializeAiBehaviorRuleEnvelope({ version: 1, instruction: 'x', scope: { productIds: ['p2'] } })),
    rule('broken', '{"version":1,"scope":'),
  ], context);
  assert.equal(result.selected.length, 0);
  assert.deepEqual(new Set(result.rejected.map(item => item.reason)), new Set(['SCOPE_MISMATCH', 'MALFORMED_CONFIG']));
  const prompt = buildAiBehaviorSystemPrompt(result, 'پاسخ بده');
  assert.match(prompt, /fallback پایه/);
});

test('model actions are restricted by the backend allowlist', () => {
  assert.equal(validateRequestedAction('DELETE_DATABASE', ['NONE', 'REQUEST_HUMAN']), 'NONE');
  assert.equal(validateRequestedAction('REQUEST_HUMAN', ['NONE', 'REQUEST_HUMAN']), 'REQUEST_HUMAN');
});

test('legacy business prompt cannot override runtime prompt', () => {
  const result = resolveAiBehaviorRulesFromRecords([rule('manager', 'فقط متن قانون مدیر اعمال شود')], context);
  const prompt = buildAiBehaviorSystemPrompt(result, 'قرارداد ساختاریافته');
  assert.match(prompt, /فقط متن قانون مدیر اعمال شود/);
  assert.doesNotMatch(prompt, /هر بار فقط مهم‌ترین سوال بعدی|کمتر از ۵ دقیقه|پرداخت اقساطی بدون سود/);
});
