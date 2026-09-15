import test from 'node:test';
import assert from 'node:assert/strict';
import { composeScopedKnowledge } from '../server/services/categoryKnowledgeScope.ts';
import { decideGoftinoAiPolicy, goftinoAiResponseMode } from '../server/services/goftinoAiPolicyDecision.ts';
import { findCategoryForCatalogTopic, findGoftinoCatalogTopic, GOFTINO_TOPIC_CATALOG } from '../server/services/goftinoTopicCatalog.ts';
import {
  goftinoCategorySettingKey,
  goftinoPolicyConfigurationError,
  resolveStoredGoftinoCategoryMapping,
} from '../shared/goftinoCategoryMapping.ts';

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
  assert.equal(goftinoAiResponseMode(disabled), 'SILENT');
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
  assert.equal(goftinoAiResponseMode(disabled), 'SILENT');
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

test('a disabled topic stays silent even when it has no specialized category', () => {
  const decision = decideGoftinoAiPolicy(claimsPolicy, false);
  assert.equal(decision.kind, 'HANDOFF');
  if (decision.kind === 'HANDOFF') assert.equal(decision.reason, 'DISABLED');
  assert.equal(goftinoAiResponseMode(decision), 'SILENT');
});

test('unknown topic is limited to general AI without an operator handoff', () => {
  assert.equal(findGoftinoCatalogTopic('unknown-topic', 'رشته ناشناس'), null);
  const decision = decideGoftinoAiPolicy(null, true);
  assert.equal(decision.kind, 'GENERAL');
  if (decision.kind === 'GENERAL') assert.equal(decision.reason, 'UNKNOWN_TOPIC');
  assert.equal(goftinoAiResponseMode(decision), 'AI');
});

test('catalog contains exactly the ten uploaded Goftino topics', () => {
  assert.equal(GOFTINO_TOPIC_CATALOG.length, 10);
  const claims = GOFTINO_TOPIC_CATALOG.find((item) => item.id === 'claims');
  assert.deepEqual(claims?.categoryIdentityCandidates, []);
  assert.equal(claims?.requiresInsuranceCategory, true);
});

test('stored topic mapping resolves claims to its configured category by stable ids', () => {
  const topic = GOFTINO_TOPIC_CATALOG.find((item) => item.id === 'claims')!;
  const category = { id: 'category-claims', slug: 'khesarat', name: 'خسارت', status: 'ACTIVE' };
  const mapping = resolveStoredGoftinoCategoryMapping({
    categories: [category], configuredCategoryId: category.id,
    hasConfiguredSetting: true, legacyFallbackCategoryId: null,
  });
  assert.equal(mapping.source, 'SETTING');
  assert.equal(mapping.category?.id, 'category-claims');
  const decision = decideGoftinoAiPolicy({
    goftinoTopicId: topic.id,
    goftinoTopicTitle: topic.title,
    insuranceCategoryId: mapping.category?.id || null,
  }, true);
  assert.equal(decision.kind, 'ALLOW');
  if (decision.kind === 'ALLOW') assert.equal(decision.policy.insuranceCategoryId, 'category-claims');
});

test('stored mapping has priority over the legacy responsibility name fallback', () => {
  const legacy = { id: 'legacy-category', slug: 'responsibility', name: 'مسئولیت', status: 'ACTIVE' };
  const configured = { id: 'configured-category', slug: 'custom', name: 'دستهٔ انتخاب‌شده', status: 'ACTIVE' };
  const mapping = resolveStoredGoftinoCategoryMapping({
    categories: [legacy, configured], configuredCategoryId: configured.id,
    hasConfiguredSetting: true, legacyFallbackCategoryId: legacy.id,
  });
  assert.equal(mapping.source, 'SETTING');
  assert.equal(mapping.category?.id, configured.id);
});

test('missing mapping preserves legacy fallback but is not reported as a stored mapping', () => {
  const category = { id: 'category-responsibility', slug: 'responsibility', name: 'مسئولیت', status: 'ACTIVE' };
  const mapping = resolveStoredGoftinoCategoryMapping({
    categories: [category], configuredCategoryId: null,
    hasConfiguredSetting: false, legacyFallbackCategoryId: category.id,
  });
  assert.equal(mapping.source, 'LEGACY_FALLBACK');
  assert.equal(mapping.category?.id, category.id);
});

test('invalid stored category never silently falls back to a name match', () => {
  const fallback = { id: 'fallback', slug: 'responsibility', name: 'مسئولیت', status: 'ACTIVE' };
  const mapping = resolveStoredGoftinoCategoryMapping({
    categories: [fallback], configuredCategoryId: 'deleted-category',
    hasConfiguredSetting: true, legacyFallbackCategoryId: fallback.id,
  });
  assert.equal(mapping.source, 'INVALID_SETTING');
  assert.equal(mapping.category, null);
});

test('enabled insurance-consultation topics require a valid active category', () => {
  const topic = GOFTINO_TOPIC_CATALOG.find((item) => item.id === 'claims')!;
  assert.match(goftinoPolicyConfigurationError(topic.requiresInsuranceCategory, true, null) || '', /دستهٔ بیمه‌ای فعال/);
  assert.equal(goftinoPolicyConfigurationError(topic.requiresInsuranceCategory, true, { id: 'c1', slug: 'x', name: 'دسته', status: 'ACTIVE' }), null);
  assert.equal(goftinoPolicyConfigurationError(topic.requiresInsuranceCategory, false, null), null);
});

test('category mapping setting keys use only the stable Goftino topic id', () => {
  assert.equal(goftinoCategorySettingKey('claims'), 'goftino_ai_category:claims');
});
