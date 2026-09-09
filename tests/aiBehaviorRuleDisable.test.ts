import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHumanHandoffRuleConfigRecord, resolveQuotationCompletionConfigRecord } from '../server/services/aiBehaviorService';
import { FULL_NAME_HANDOFF_RULE_DIRECTIVE } from '../shared/humanHandoffRule';
import { QUOTATION_COMPLETION_RULE_DIRECTIVE } from '../shared/quotationCompletionRule';

test('inactive system rules do not reactivate their hard-coded default config', () => {
  assert.equal(resolveHumanHandoffRuleConfigRecord({ status: 'INACTIVE', directive: FULL_NAME_HANDOFF_RULE_DIRECTIVE }), null);
  assert.equal(resolveQuotationCompletionConfigRecord({ status: 'INACTIVE', directive: QUOTATION_COMPLETION_RULE_DIRECTIVE }), null);
  assert.ok(resolveHumanHandoffRuleConfigRecord({ status: 'ACTIVE', directive: FULL_NAME_HANDOFF_RULE_DIRECTIVE }));
  assert.ok(resolveQuotationCompletionConfigRecord({ status: 'ACTIVE', directive: QUOTATION_COMPLETION_RULE_DIRECTIVE }));
});
