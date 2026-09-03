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

const firePolicy = {
  goftinoTopicId: 'insurance-fire',
  goftinoTopicTitle: 'بخش مشاوره و خرید بیمه های آتش سوزی',
  insuranceCategoryId: 'category-fire',
};

const claimsPolicy = {
  goftinoTopicId: 'claims',
  goftinoTopicTitle: 'بخش مشاوره خسارت',
  insuranceCategoryId: null,
};

test('responsibility maps from the Persian category identity and can be enabled or disabled', () => {
  const topic = findGoftinoCatalogTopic(null, 'بخش مشاوره و خرید بیمه های مسئولیت');
  assert.equal(topic?.id, 'insurance-responsibility');
  const category = findCategoryForCatalogTopic(topic!, [
    { id: 'category-responsibility', slug: 'بیمه-های-مسئولیت', name: 'بیمه‌های مسئولیت', status: 'ACTIVE' },
    { id: 'category-vehicle', slug: 'vehicle', name: 'خودرو', status: 'ACTIVE' },
  ]);
  assert.equal(category?.id, 'category-responsibility');
  const enabled = decideGoftinoAiPolicy(responsibilityPolicy, true);
  assert.equal(enabled.kind, 'ALLOW');
  if (enabled.kind === 'ALLOW') {
    assert.equal(enabled.scope, 'CATEGORY');
    assert.equal(enabled.policy.insuranceCategoryId, 'category-responsibility');
  }
  const disabled = decideGoftinoAiPolicy(responsibilityPolicy, false);
  assert.equal(disabled.kind, 'HANDOFF');
  if (disabled.kind === 'HANDOFF') assert.equal(disabled.reason, 'DISABLED');
});

test('fire maps to its category and can be enabled or disabled', () => {
  const topic = findGoftinoCatalogTopic('insurance-fire', null);
  const category = findCategoryForCatalogTopic(topic!, [
    { id: 'category-fire', slug: 'آتش-سوزی', name: 'آتش‌سوزی', status: 'ACTIVE' },
  ]);
  assert.equal(category?.id, 'category-fire');

  const enabled = decideGoftinoAiPolicy(firePolicy, true);
  assert.equal(enabled.kind, 'ALLOW');
  if (enabled.kind === 'ALLOW') assert.equal(enabled.scope, 'CATEGORY');

  const disabled = decideGoftinoAiPolicy(firePolicy, false);
  assert.equal(disabled.kind, 'HANDOFF');
  if (disabled.kind === 'HANDOFF') assert.equal(disabled.reason, 'DISABLED');
});

test('responsibility category context is ordered before building-manager subcategory context', () => {
  const context = composeScopedKnowledge(['دانش دسته مسئولیت'], 'دانش مدیران ساختمان');
  assert.deepEqual(context.sections, ['دانش دسته مسئولیت', 'دانش مدیران ساختمان']);
  assert.equal(context.productOverridesCategory, true);
});

test('enabled topic without a specialized category is limited to the safe general scope', () => {
  const decision = decideGoftinoAiPolicy(claimsPolicy, true);
  assert.equal(decision.kind, 'ALLOW');
  if (decision.kind === 'ALLOW') {
    assert.equal(decision.scope, 'GENERAL');
    assert.equal(decision.policy.insuranceCategoryId, null);
  }
});

test('a disabled topic routes to handoff even when it has no specialized category', () => {
  const decision = decideGoftinoAiPolicy(claimsPolicy, false);
  assert.equal(decision.kind, 'HANDOFF');
  if (decision.kind === 'HANDOFF') assert.equal(decision.reason, 'DISABLED');
});

test('unknown topic always routes to handoff', () => {
  assert.equal(findGoftinoCatalogTopic('unknown-topic', 'رشته ناشناس'), null);
  const decision = decideGoftinoAiPolicy(null, true);
  assert.equal(decision.kind, 'HANDOFF');
  if (decision.kind === 'HANDOFF') assert.equal(decision.reason, 'UNKNOWN_TOPIC');
});

test('catalog contains exactly the ten uploaded Goftino topics', () => {
  assert.equal(GOFTINO_TOPIC_CATALOG.length, 10);
  const claims = GOFTINO_TOPIC_CATALOG.find((item) => item.id === 'claims');
  assert.deepEqual(claims?.categoryIdentityCandidates, []);
});
