import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProductIntentClassification,
  invalidateStaleProductState,
  type ProductIntentClassification,
  type ProductIntentRoutingState,
} from '../shared/productIntentRouting';
import {
  DEFAULT_QUOTATION_ROUTING_TEMPLATES,
  isDetectedProductCurrentPage,
  isDirectQuotationWorkflowRequest,
  renderQuotationRoutingTemplate,
} from '../shared/productPurchaseLink';

const manager = { id: 'building-manager', name: 'بیمه مسئولیت مدیر ساختمان' };
const construction = { id: 'building-construction', name: 'بیمه مسئولیت احداث ساختمان' };
const candidates = [manager, construction];

const previous = (product = manager): ProductIntentRoutingState => ({
  version: 1,
  originPageProductId: manager.id,
  originPageProductName: manager.name,
  activeProductId: product.id,
  activeProductName: product.name,
  confirmedProductId: product.id,
  confirmedProductName: product.name,
  status: 'CONFIRMED', confidence: 1, lastDecision: 'SELECT_PRODUCT', lastReason: 'confirmed',
  updatedAt: '2026-09-09T00:00:00.000Z',
});

const classification = (value: Partial<ProductIntentClassification>): ProductIntentClassification => ({
  decision: 'KEEP_ACTIVE', selectedProductId: null, confidence: .95, explicitCorrection: false,
  confirmation: 'NONE', intentSummary: '', reason: 'mock semantic decision', clarificationQuestion: null,
  ...value,
});

test('origin manager + manager intent keeps the confirmed manager product', () => {
  const result = applyProductIntentClassification({ classification: classification({ decision: 'KEEP_ACTIVE' }), candidates, previous: previous(), originPageProduct: manager });
  assert.equal(result.selectedProductId, manager.id);
  assert.equal(result.changed, false);
});

test('origin manager + construction workers intent reclassifies to the real construction product', () => {
  const result = applyProductIntentClassification({ classification: classification({ decision: 'SELECT_PRODUCT', selectedProductId: construction.id, confirmation: 'EXPLICIT', intentSummary: 'بیمه کارگران پروژه ساختمانی' }), candidates, previous: previous(), originPageProduct: manager });
  assert.equal(result.selectedProductId, construction.id);
  assert.equal(result.state.confirmedProductId, construction.id);
  assert.equal(result.changed, true);
});

test('under-construction plus future residential usage does not restore manager liability', () => {
  const result = applyProductIntentClassification({ classification: classification({ decision: 'SELECT_PRODUCT', selectedProductId: construction.id, confirmation: 'STRONG_INFERENCE', intentSummary: 'پروژه در حال ساخت با کاربری آینده مسکونی' }), candidates, previous: previous(), originPageProduct: manager });
  assert.equal(result.selectedProductId, construction.id);
  assert.notEqual(result.selectedProductId, manager.id);
});

test('explicit correction overrides stale manager state and invalidates its workflow data', () => {
  const result = applyProductIntentClassification({ classification: classification({ decision: 'SELECT_PRODUCT', selectedProductId: construction.id, explicitCorrection: true, confirmation: 'EXPLICIT', reason: 'کاربر صریحاً مدیر را رد کرد' }), candidates, previous: previous(), originPageProduct: manager });
  const cleaned = invalidateStaleProductState({ building_usage: 'مسکونی', quotationTurnState: { field: 'building_usage' }, customerCity: 'تهران' }, ['building_usage']);
  assert.equal(result.selectedProductId, construction.id);
  assert.deepEqual(cleaned, { customerCity: 'تهران' });
});

test('ambiguous building need clears stale product and asks exactly one concise discriminator', () => {
  const result = applyProductIntentClassification({ classification: classification({ decision: 'CLEAR_AND_CLARIFY', selectedProductId: null, confidence: .82, reason: 'مرحله ساختمان مشخص نیست', clarificationQuestion: 'ساختمان در حال ساخت است یا تکمیل‌شده و در حال استفاده' }), candidates, previous: previous(), originPageProduct: manager });
  assert.equal(result.selectedProductId, null);
  assert.equal(result.state.status, 'NEEDS_CLARIFICATION');
  assert.equal(result.clarificationQuestion, 'ساختمان در حال ساخت است یا تکمیل‌شده و در حال استفاده؟');
});

test('confirmed product change makes only the new product eligible for its quote link', () => {
  const result = applyProductIntentClassification({ classification: classification({ decision: 'SELECT_PRODUCT', selectedProductId: construction.id, confirmation: 'EXPLICIT' }), candidates, previous: previous(), originPageProduct: manager });
  const links = new Map([[manager.id, 'https://bimejam.com/liability-insurance/building-managers'], [construction.id, 'https://bimejam.com/building-construction-employer-insurance']]);
  assert.equal(links.get(result.state.confirmedProductId!), links.get(construction.id));
  assert.notEqual(links.get(result.state.confirmedProductId!), links.get(manager.id));
});

test('correct current page uses same-page text without redundantly rendering its URL', () => {
  assert.equal(isDetectedProductCurrentPage({ productId: construction.id, currentPageProductId: construction.id, purchaseUrl: 'https://bimejam.com/building-construction-employer-insurance', currentPageUrl: 'https://bimejam.com/building-construction-employer-insurance' }), true);
  const reply = renderQuotationRoutingTemplate(DEFAULT_QUOTATION_ROUTING_TEMPLATES.samePageResponse, { productName: construction.name, purchaseUrl: 'https://bimejam.com/building-construction-employer-insurance' });
  assert.doesNotMatch(reply, /https?:\/\//);
});

test('refusing the form enters assisted conversion capped at three to five questions', () => {
  assert.equal(isDirectQuotationWorkflowRequest('فرم نمی‌خوام، شما سؤال‌ها رو بپرسید'), true);
  assert.ok(DEFAULT_QUOTATION_ROUTING_TEMPLATES.assistedQuestionLimit >= 3);
  assert.ok(DEFAULT_QUOTATION_ROUTING_TEMPLATES.assistedQuestionLimit <= 5);
});

test('a previously stated fact survives when product remains unchanged', () => {
  const facts = { worker_count: '5', customerCity: 'تهران' };
  const result = applyProductIntentClassification({ classification: classification({ decision: 'KEEP_ACTIVE' }), candidates, previous: previous(construction), originPageProduct: manager });
  assert.equal(result.changed, false);
  assert.deepEqual(facts, { worker_count: '5', customerCity: 'تهران' });
});
