import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceConsecutiveGreetingMessages } from '../shared/conversationGreetingCoalescing';
import { inferredProductConfirmedByCustomer, type ProductIntentRoutingState } from '../shared/productIntentRouting';
import {
  DEFAULT_QUOTATION_ROUTING_TEMPLATES,
  isDetectedProductCurrentPage,
  purchaseLinkQuotationSelectedState,
  quotationQuestionLimitForConversionMode,
  renderQuotationRoutingTemplate,
} from '../shared/productPurchaseLink';

const at = (milliseconds: number) => new Date(Date.UTC(2026, 8, 10, 8, 0, 0, milliseconds));

test('consecutive greeting-only messages are coalesced into one conversational opening', () => {
  const result = coalesceConsecutiveGreetingMessages('m1', [
    { id: 'm1', content: 'سلام', createdAt: at(0), greetingOnly: true },
    { id: 'm2', content: 'وقت بخیر', createdAt: at(250), greetingOnly: true },
  ]);
  assert.deepEqual(result, {
    messageId: 'm2', userMessageContent: 'وقت بخیر', sourceMessageIds: ['m1', 'm2'],
  });
});

test('greeting coalescing stops at a substantive customer message', () => {
  const result = coalesceConsecutiveGreetingMessages('m1', [
    { id: 'm1', content: 'سلام', createdAt: at(0), greetingOnly: true },
    { id: 'm2', content: 'قیمت بیمه را می‌خواهم', createdAt: at(200), greetingOnly: false },
    { id: 'm3', content: 'وقت بخیر', createdAt: at(300), greetingOnly: true },
  ]);
  assert.deepEqual(result?.sourceMessageIds, ['m1']);
});

test('positive reply confirms the persisted inferred product instead of asking again', () => {
  const state: ProductIntentRoutingState = {
    version: 1, originPageProductId: 'construction', originPageProductName: 'بیمه مسئولیت احداث ساختمان',
    activeProductId: 'construction', activeProductName: 'بیمه مسئولیت احداث ساختمان',
    confirmedProductId: null, confirmedProductName: null, status: 'INFERRED', confidence: .9,
    lastDecision: 'SELECT_PRODUCT', lastReason: 'page hint', updatedAt: '2026-09-10T08:00:00.000Z',
  };
  assert.deepEqual(inferredProductConfirmedByCustomer(state, true), {
    productId: 'construction', productName: 'بیمه مسئولیت احداث ساختمان',
  });
});

test('confirmed product on its own page offers the current form without repeating the URL', () => {
  const currentPageUrl = 'https://bimejam.com/building-construction-employer-insurance';
  assert.equal(isDetectedProductCurrentPage({ productId: 'construction', currentPageProductId: 'construction', purchaseUrl: currentPageUrl, currentPageUrl }), true);
  const response = renderQuotationRoutingTemplate(DEFAULT_QUOTATION_ROUTING_TEMPLATES.samePageResponse, {
    productName: 'بیمه مسئولیت احداث ساختمان', purchaseUrl: currentPageUrl, currentPageUrl,
  });
  assert.doesNotMatch(response, /https?:\/\//);
  assert.match(response, /همین صفحه/);
});

test('confirmed product on another page gets its real URL and assisted quote remains full length', () => {
  const purchaseUrl = 'https://bimejam.com/building-construction-employer-insurance';
  const response = renderQuotationRoutingTemplate(DEFAULT_QUOTATION_ROUTING_TEMPLATES.differentPageResponse, {
    productName: 'بیمه مسئولیت احداث ساختمان', purchaseUrl, currentPageUrl: 'https://bimejam.com/',
  });
  assert.match(response, new RegExp(purchaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const quote = purchaseLinkQuotationSelectedState('construction');
  assert.equal(quotationQuestionLimitForConversionMode(quote.mode, 5), undefined);
});
