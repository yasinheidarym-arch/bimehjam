import test from 'node:test';
import assert from 'node:assert/strict';
import { composeScopedKnowledge } from '../server/services/categoryKnowledgeScope.ts';
import { decideGoftinoAiPolicy, GOFTINO_AI_ALLOWED, GOFTINO_HUMAN_ONLY } from '../server/services/goftinoAiPolicyDecision.ts';

const responsibilityPolicy = {
  goftinoTopicId: 'department-responsibility-42',
  goftinoTopicTitle: 'عنوان نمایشی قابل تغییر',
  insuranceCategoryId: 'category-responsibility',
  active: true,
  mode: GOFTINO_AI_ALLOWED,
};

test('active responsibility topic is authorized by stable Goftino ID, not its title', () => {
  const decision = decideGoftinoAiPolicy([responsibilityPolicy], 'department-responsibility-42');
  assert.equal(decision.kind, 'ALLOW');
  if (decision.kind === 'ALLOW') assert.equal(decision.policy.insuranceCategoryId, 'category-responsibility');
});

test('responsibility category context is ordered before building-manager subcategory context', () => {
  const context = composeScopedKnowledge(['دانش دسته مسئولیت'], 'دانش مدیران ساختمان');
  assert.deepEqual(context.sections, ['دانش دسته مسئولیت', 'دانش مدیران ساختمان']);
  assert.equal(context.productOverridesCategory, true);
});

test('inactive and human-only policies never authorize a specialized answer', () => {
  const inactive = decideGoftinoAiPolicy([{ ...responsibilityPolicy, active: false }], responsibilityPolicy.goftinoTopicId);
  const handoff = decideGoftinoAiPolicy([{ ...responsibilityPolicy, mode: GOFTINO_HUMAN_ONLY }], responsibilityPolicy.goftinoTopicId);
  assert.deepEqual([inactive.kind, handoff.kind], ['HANDOFF', 'HANDOFF']);
});

test('an unknown Goftino ID is denied even when its display title might look insurance-related', () => {
  const decision = decideGoftinoAiPolicy([responsibilityPolicy], 'department-unknown-99');
  assert.equal(decision.kind, 'HANDOFF');
  if (decision.kind === 'HANDOFF') assert.equal(decision.reason, 'UNKNOWN_TOPIC');
});
