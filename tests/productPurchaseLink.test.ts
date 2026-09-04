import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDirectQuotationWorkflowRequest,
  normalizeProductPurchaseUrl,
  offeredPurchaseLinkProductIds,
  productPurchaseLinkReply,
  PURCHASE_LINK_METADATA_KEY,
  shouldOfferProductPurchaseLink,
} from '../shared/productPurchaseLink.ts';
import { isInsuranceQuotationRequest } from '../server/services/quotationConversationFlow.ts';

const productId = 'building-managers';
const purchaseUrl = 'https://bimehjam.example/buy/building-managers';

test('building managers price request offers its valid URL only once', () => {
  const input = { intent: 'Insurance Quotation', productId, purchaseUrl, message: 'قیمت بیمه مسئولیت مدیران ساختمان' };
  assert.equal(shouldOfferProductPurchaseLink(input), true);
  assert.match(productPurchaseLinkReply(purchaseUrl), /https:\/\/bimehjam\.example\/buy\/building-managers/);
  assert.equal(shouldOfferProductPurchaseLink({ ...input, offeredProductIds: [productId] }), false);
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

test('only http and https purchase URLs are accepted', () => {
  assert.equal(normalizeProductPurchaseUrl('javascript:alert(1)'), null);
  assert.equal(normalizeProductPurchaseUrl('https://bimehjam.com/product'), 'https://bimehjam.com/product');
});
