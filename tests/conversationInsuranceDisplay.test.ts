import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveConversationInsuranceDisplay } from '../server/services/conversationInsuranceDisplay.ts';

const products = new Map([
  ['construction-liability', { id: 'construction-liability', name: 'بیمه مسئولیت احداث ساختمان', categoryName: 'مسئولیت' }],
  ['building-manager-liability', { id: 'building-manager-liability', name: 'بیمه مسئولیت مدیران ساختمان', categoryName: 'مسئولیت' }],
]);

function input(overrides: Partial<Parameters<typeof deriveConversationInsuranceDisplay>[0]> = {}) {
  return { id: 'conversation-1', currentProductId: null, collectedData: {}, customerMetadata: {}, ...overrides };
}

test('falls back to general insurance only without a confirmed product or mapped topic category', () => {
  assert.deepEqual(deriveConversationInsuranceDisplay(input(), products, null), {
    name: 'بیمه عمومی', source: 'GENERAL',
  });
});

test('uses the mapped topic category before product confirmation', () => {
  assert.deepEqual(deriveConversationInsuranceDisplay(input(), products, 'مسئولیت'), {
    name: 'مسئولیت', source: 'MAPPED_TOPIC_CATEGORY',
  });
});

test('uses a valid legacy category stored in customer metadata when a stable topic is absent', () => {
  assert.deepEqual(deriveConversationInsuranceDisplay(input(), products, null, 'مسئولیت'), {
    name: 'مسئولیت', source: 'MAPPED_TOPIC_CATEGORY',
  });
});

test('uses the category of the current site product when no Goftino topic is mapped', () => {
  const result = deriveConversationInsuranceDisplay(input({
    collectedData: { productIntentRouting: {
      version: 1, status: 'INFERRED', lastDecision: 'SELECT_PRODUCT',
      originPageProductId: 'construction-liability', originPageProductName: 'نام صفحه',
      activeProductId: null, activeProductName: null,
      confirmedProductId: null, confirmedProductName: null,
      confidence: 0.5, lastReason: 'page', updatedAt: new Date().toISOString(),
    } },
  }), products, null);
  assert.deepEqual(result, { name: 'مسئولیت', source: 'MAPPED_TOPIC_CATEGORY' });
});

test('uses the canonical confirmed product name rather than a cached conversation name', () => {
  const result = deriveConversationInsuranceDisplay(input({
    collectedData: { productIntentRouting: {
      version: 1, status: 'CONFIRMED', lastDecision: 'SELECT_PRODUCT',
      originPageProductId: null, originPageProductName: null,
      activeProductId: 'construction-liability', activeProductName: 'نام قدیمی',
      confirmedProductId: 'construction-liability', confirmedProductName: 'نام قدیمی',
      confidence: 0.9, lastReason: 'test', updatedAt: new Date().toISOString(),
    } },
  }), products, 'مسئولیت');
  assert.deepEqual(result, { name: 'بیمه مسئولیت احداث ساختمان', source: 'CONFIRMED_PRODUCT' });
});

test('reclassification immediately changes the derived display to the newly confirmed product', () => {
  const result = deriveConversationInsuranceDisplay(input({
    collectedData: { productIntentRouting: {
      version: 1, status: 'CONFIRMED', lastDecision: 'SELECT_PRODUCT',
      originPageProductId: null, originPageProductName: null,
      activeProductId: 'building-manager-liability', activeProductName: 'نام قدیمی',
      confirmedProductId: 'building-manager-liability', confirmedProductName: 'نام قدیمی',
      confidence: 0.93, lastReason: 'reclassified', updatedAt: new Date().toISOString(),
    } },
  }), products, 'مسئولیت');
  assert.equal(result.name, 'بیمه مسئولیت مدیران ساختمان');
  assert.equal(result.source, 'CONFIRMED_PRODUCT');
});

test('legacy quotation conversations retain their canonical current product when routing state is absent', () => {
  assert.deepEqual(deriveConversationInsuranceDisplay(input({ currentProductId: 'construction-liability' }), products, 'مسئولیت'), {
    name: 'بیمه مسئولیت احداث ساختمان', source: 'CONFIRMED_PRODUCT',
  });
});
