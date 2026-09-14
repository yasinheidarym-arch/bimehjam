import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceConsecutiveGreetingMessages } from '../shared/conversationGreetingCoalescing';
import { advanceConversationOpeningState } from '../shared/conversationOpeningState';
import { inferredProductConfirmedByCustomer, type ProductIntentRoutingState } from '../shared/productIntentRouting';
import {
  DEFAULT_QUOTATION_ROUTING_TEMPLATES,
  isDetectedProductCurrentPage,
  purchaseLinkAwaitingState,
  purchaseLinkQuotationSelectedState,
  quotationEntryConversionMode,
  quotationQuestionLimitForConversionMode,
  renderQuotationRoutingTemplate,
  shouldOfferProductPurchaseLink,
} from '../shared/productPurchaseLink';
import { isSimpleGreeting } from '../server/services/aiBehaviorRuntime';

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

test('opening state suppresses consecutive semantic greetings beyond transport debounce', () => {
  const first = advanceConversationOpeningState(null, 'GREETING', at(0));
  assert.equal(first.duplicateGreeting, false);
  const second = advanceConversationOpeningState(first.state, 'GREETING', new Date(at(0).getTime() + 5_000));
  assert.equal(second.duplicateGreeting, true);
  const third = advanceConversationOpeningState(second.state, 'GREETING', new Date(at(0).getTime() + 15_000));
  assert.equal(third.duplicateGreeting, true);
  assert.equal(isSimpleGreeting('خسته نباشید'), true);
});

test('a substantive message closes the greeting opening phase', () => {
  const greeting = advanceConversationOpeningState(null, 'GREETING', at(0));
  const substantive = advanceConversationOpeningState(greeting.state, 'SALES_QUOTE', new Date(at(0).getTime() + 2_000));
  assert.equal(substantive.state.phase, 'ACTIVE');
  assert.equal(substantive.state.substantiveMessageSeen, true);
  const laterGreeting = advanceConversationOpeningState(substantive.state, 'GREETING', new Date(at(0).getTime() + 3_000));
  assert.equal(laterGreeting.duplicateGreeting, false);
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

test('same-page comparison ignores protocol, www, query, hash, slash and URL encoding', () => {
  const encoded = 'https://www.bimejam.com/%D8%A8%DB%8C%D9%85%D9%87-%D9%85%D8%B3%D8%A6%D9%88%D9%84%DB%8C%D8%AA/?utm_source=goftino#form';
  const canonical = 'http://bimejam.com/بیمه-مسئولیت';
  assert.equal(isDetectedProductCurrentPage({
    productId: 'liability', currentPageProductId: null, purchaseUrl: canonical, currentPageUrl: encoded,
  }), true);
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

test('a newly confirmed construction product offers its route and waits without entering assisted quote', () => {
  const productId = 'construction-workers';
  const purchaseUrl = 'https://bimejam.example/construction-workers';
  assert.equal(shouldOfferProductPurchaseLink({
    intent: 'Insurance Quotation', productId, purchaseUrl,
    message: 'بیمه کارگران ساختمان می‌خواهم',
  }), true);
  assert.deepEqual(purchaseLinkAwaitingState(productId), {
    status: 'AWAITING_CUSTOMER_CHOICE', productId,
  });
  assert.equal(quotationEntryConversionMode({
    activeSession: false,
    assistedQuoteRequested: false,
    assistedLeadRequested: false,
  }), null);
});

test('an explicit chat quotation choice enters assisted quote', () => {
  assert.equal(quotationEntryConversionMode({
    activeSession: false,
    assistedQuoteRequested: true,
    assistedLeadRequested: false,
  }), 'ASSISTED_QUOTE');
});

test('an explicit callback choice enters assisted lead', () => {
  assert.equal(quotationEntryConversionMode({
    activeSession: false,
    assistedQuoteRequested: false,
    assistedLeadRequested: true,
  }), 'ASSISTED_LEAD');
});

test('an active quotation session continues without asking for the route again', () => {
  assert.equal(quotationEntryConversionMode({
    activeSession: true,
    currentMode: 'ASSISTED_QUOTE',
    assistedQuoteRequested: false,
    assistedLeadRequested: false,
  }), 'ASSISTED_QUOTE');
});
