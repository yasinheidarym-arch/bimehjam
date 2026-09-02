import test from 'node:test';
import assert from 'node:assert/strict';
import { composeScopedKnowledge } from '../server/services/categoryKnowledgeScope.ts';
import { decideGoftinoAiPolicy } from '../server/services/goftinoAiPolicyDecision.ts';
import { findCategoryForCatalogTopic, findGoftinoCatalogTopic, GOFTINO_TOPIC_CATALOG } from '../server/services/goftinoTopicCatalog.ts';

const responsibilityPolicy = {
  goftinoTopicId: 'insurance-responsibility',
  goftinoTopicTitle: 'بخش مشاوره و خرید بیمه های مسئولیت',
  insuranceCategoryId: 'category-responsibility',
};

test('enabled responsibility catalog topic is allowed for its mapped category', () => {
  const topic = findGoftinoCatalogTopic(null, 'بخش مشاوره و خرید بیمه های مسئولیت');
  assert.equal(topic?.id, 'insurance-responsibility');
  const category = findCategoryForCatalogTopic(topic!, [
    { id: 'category-responsibility', slug: 'responsibility', name: 'مسئولیت', status: 'ACTIVE' },
    { id: 'category-vehicle', slug: 'vehicle', name: 'خودرو', status: 'ACTIVE' },
  ]);
  assert.equal(category?.id, 'category-responsibility');
  const decision = decideGoftinoAiPolicy(responsibilityPolicy, true);
  assert.equal(decision.kind, 'ALLOW');
  if (decision.kind === 'ALLOW') assert.equal(decision.policy.insuranceCategoryId, 'category-responsibility');
});

test('responsibility category context is ordered before building-manager subcategory context', () => {
  const context = composeScopedKnowledge(['دانش دسته مسئولیت'], 'دانش مدیران ساختمان');
  assert.deepEqual(context.sections, ['دانش دسته مسئولیت', 'دانش مدیران ساختمان']);
  assert.equal(context.productOverridesCategory, true);
});

test('disabled mapped topic never authorizes a specialized answer', () => {
  const decision = decideGoftinoAiPolicy(responsibilityPolicy, false);
  assert.equal(decision.kind, 'HANDOFF');
  if (decision.kind === 'HANDOFF') assert.equal(decision.reason, 'DISABLED');
});

test('unknown topic always routes to handoff', () => {
  assert.equal(findGoftinoCatalogTopic('unknown-topic', 'رشته ناشناس'), null);
  const decision = decideGoftinoAiPolicy(null, true);
  assert.equal(decision.kind, 'HANDOFF');
  if (decision.kind === 'HANDOFF') assert.equal(decision.reason, 'UNKNOWN_TOPIC');
});

test('catalog contains exactly the ten uploaded Goftino topics and unmapped rows stay locked', () => {
  assert.equal(GOFTINO_TOPIC_CATALOG.length, 10);
  const claims = GOFTINO_TOPIC_CATALOG.find((item) => item.id === 'claims');
  assert.deepEqual(claims?.categorySlugCandidates, []);
});
