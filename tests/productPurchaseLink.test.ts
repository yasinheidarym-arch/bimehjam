import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDirectQuotationWorkflowRequest,
  isExplicitProductPurchaseLinkRequest,
  isProductPurchaseIntent,
  normalizeProductPurchaseUrl,
  offeredPurchaseLinkProductIds,
  productPurchaseLinkReply,
  purchaseLinkAwaitingState,
  purchaseLinkQuotationSelectedState,
  purchaseLinkDecisionLogSummary,
  PURCHASE_LINK_METADATA_KEY,
  PURCHASE_LINK_RULE_SORT_ORDER,
  PURCHASE_LINK_RULE_TITLE,
  shouldOfferProductPurchaseLink,
  shouldWaitForProductPurchaseDecision,
} from '../shared/productPurchaseLink.ts';
import {
  currentRequiredQuestion,
  isInsuranceQuotationRequest,
  shouldCaptureCurrentQuestionAnswer,
} from '../server/services/quotationConversationFlow.ts';

const productId = 'building-managers';
const purchaseUrl = 'https://bimehjam.example/buy/building-managers';

test('building managers price request offers its valid URL only once', () => {
  const input = { intent: 'Insurance Quotation', productId, purchaseUrl, message: 'قیمت بیمه مسئولیت مدیران ساختمان' };
  assert.equal(shouldOfferProductPurchaseLink(input), true);
  assert.equal(
    productPurchaseLinkReply(purchaseUrl),
    `می‌توانید با لینک زیر خودتان استعلام قیمت انجام دهید:\n${purchaseUrl}\nاگر می‌خواهید ما برایتان قیمت بگیریم و مشاوره بدهیم، اعلام کنید.`,
  );
  assert.doesNotMatch(productPurchaseLinkReply(purchaseUrl), /نوع کاربری ساختمان/);
  assert.equal(shouldOfferProductPurchaseLink({ ...input, offeredProductIds: [productId] }), false);
});

test('exact building managers purchase wording is treated as purchase intent and offers the link first', () => {
  const message = 'بیمه مسئولیت مدیران ساختمان می‌خوام';
  assert.equal(isProductPurchaseIntent(message), true);
  assert.equal(shouldOfferProductPurchaseLink({
    intent: 'Insurance Quotation', productId, purchaseUrl, message,
  }), true);
  assert.doesNotMatch(productPurchaseLinkReply(purchaseUrl), /کاربری ساختمان/);
  assert.deepEqual(purchaseLinkAwaitingState(productId), {
    status: 'AWAITING_CUSTOMER_CHOICE', productId,
  });
});

test('detailed quotation confirmation starts at the first question instead of being saved as its answer', () => {
  const firstQuestion = currentRequiredQuestion([{
    title: 'نوع کاربری ساختمان', fieldName: 'buildingUsage', required: true, order: 1,
  }], {});
  assert.equal(firstQuestion?.title, 'نوع کاربری ساختمان');
  assert.equal(shouldCaptureCurrentQuestionAnswer(true, firstQuestion, 'استعلام دقیق می‌خواهم'), false);
  assert.deepEqual(purchaseLinkQuotationSelectedState(productId), {
    status: 'DETAILED_QUOTATION_SELECTED', productId,
  });
});

test('a product without URL starts the existing quotation path', () => {
  assert.equal(shouldOfferProductPurchaseLink({
    intent: 'Insurance Quotation', productId, purchaseUrl: null, message: 'قیمت می‌خواهم',
  }), false);
});

test('rejecting the link or requesting a detailed quotation bypasses the link offer', () => {
  for (const message of ['لینک را نمی‌خواهم، سؤال‌ها را بپرس', 'استعلام دقیق می‌خواهم', 'خودتان استعلام را انجام دهید']) {
    assert.equal(isDirectQuotationWorkflowRequest(message), true);
    assert.equal(isInsuranceQuotationRequest(message), true);
    assert.equal(shouldOfferProductPurchaseLink({ intent: 'Insurance Quotation', productId, purchaseUrl, message }), false);
  }
});

test('an unknown product never receives a guessed URL', () => {
  assert.equal(shouldOfferProductPurchaseLink({
    intent: 'Insurance Quotation', productId: null, purchaseUrl, message: 'قیمت بیمه را می‌خواهم',
  }), false);
});

test('switching products allows the new product URL once', () => {
  const messages = [{ metadata: JSON.stringify({ [PURCHASE_LINK_METADATA_KEY]: productId }) }];
  const offered = offeredPurchaseLinkProductIds(messages);
  assert.deepEqual(offered, [productId]);
  assert.equal(shouldOfferProductPurchaseLink({
    intent: 'Insurance Quotation', productId: 'fire-product', purchaseUrl: 'https://bimehjam.example/buy/fire',
    offeredProductIds: offered, message: 'قیمت بیمه آتش سوزی',
  }), true);
});

test('an explicit repeat request displays the same product link again', () => {
  const message = 'لینک استعلام آنلاین را دوباره بفرست';
  assert.equal(isExplicitProductPurchaseLinkRequest(message), true);
  assert.equal(shouldOfferProductPurchaseLink({
    intent: 'Insurance Quotation', productId, purchaseUrl, offeredProductIds: [productId], message,
  }), true);
});

test('the same product waits for an explicit detailed quotation choice without repeating its link', () => {
  assert.equal(shouldWaitForProductPurchaseDecision({
    productId,
    purchaseUrl,
    offeredProductIds: [productId],
    quotationWorkflowActive: false,
    message: 'ممنون',
  }), true);
  assert.equal(shouldWaitForProductPurchaseDecision({
    productId,
    purchaseUrl,
    offeredProductIds: [productId],
    quotationWorkflowActive: false,
    message: 'استعلام دقیق می‌خواهم',
  }), false);
});

test('only http and https purchase URLs are accepted', () => {
  assert.equal(normalizeProductPurchaseUrl('javascript:alert(1)'), null);
  assert.equal(normalizeProductPurchaseUrl('https://bimehjam.com/product'), 'https://bimehjam.com/product');
});

test('purchase-link behavior rule is logged and has higher priority than Ask Quotation Questions', () => {
  assert.equal(PURCHASE_LINK_RULE_TITLE, 'پیشنهاد لینک خرید پیش از شروع استعلام');
  assert.ok(PURCHASE_LINK_RULE_SORT_ORDER < 6);
  assert.match(purchaseLinkDecisionLogSummary('بیمه مسئولیت مدیر ساختمان'), /پیشنهاد لینک خرید پیش از شروع استعلام/);
});
