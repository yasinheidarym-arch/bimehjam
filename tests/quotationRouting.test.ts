import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUOTATION_ROUTING_TEMPLATES,
  hasRecentProductPurchaseIntent,
  isDetectedProductCurrentPage,
  isDirectQuotationWorkflowRequest,
  parseQuotationRoutingTemplates,
  renderQuotationRoutingTemplate,
  serializeQuotationRoutingTemplates,
  shouldOfferProductPurchaseLink,
} from '../shared/productPurchaseLink.ts';
import {
  captureCurrentQuestionAnswer,
  currentRequiredQuestion,
  quotationQuestionReply,
} from '../server/services/quotationConversationFlow.ts';
import {
  advanceQuotationSubmission,
  startQuotationSubmission,
} from '../server/services/quotationSubmissionFlow.ts';

const productId = 'building-managers';
const purchaseUrl = 'https://bimejam.com/liability-insurance/building-managers';

test('same product page points to the form on the current page without repeating its URL', () => {
  assert.equal(isDetectedProductCurrentPage({
    productId,
    currentPageProductId: productId,
    purchaseUrl,
    currentPageUrl: `${purchaseUrl}/`,
  }), true);
  const reply = renderQuotationRoutingTemplate(DEFAULT_QUOTATION_ROUTING_TEMPLATES.samePageResponse, {
    productName: 'بیمه مسئولیت مدیر ساختمان', purchaseUrl, currentPageUrl: `${purchaseUrl}/`,
  });
  assert.match(reply, /فرم استعلام آنلاین بیمه مسئولیت مدیر ساختمان در همین صفحه/);
  assert.match(reply, /سؤال‌های استعلام را یکی‌یکی/);
  assert.doesNotMatch(reply, /https?:\/\//);
});

test('administrator-edited routing templates are parsed and rendered from the rule payload', () => {
  const configured = {
    ...DEFAULT_QUOTATION_ROUTING_TEMPLATES,
    samePageResponse: 'فرم {{productName}} همین‌جاست.',
    differentPageResponse: 'مسیر محصول: {{purchaseUrl}}',
  };
  const stored = serializeQuotationRoutingTemplates(configured);
  const parsed = parseQuotationRoutingTemplates(stored);
  assert.ok(parsed);
  assert.equal(renderQuotationRoutingTemplate(parsed!.samePageResponse, {
    productName: 'مدیر ساختمان', purchaseUrl, currentPageUrl: purchaseUrl,
  }), 'فرم مدیر ساختمان همین‌جاست.');
});

test('routing rule rejects unknown variables and unverified registration claims', () => {
  assert.deepEqual(parseQuotationRoutingTemplates(serializeQuotationRoutingTemplates(DEFAULT_QUOTATION_ROUTING_TEMPLATES)), DEFAULT_QUOTATION_ROUTING_TEMPLATES);
  assert.equal(parseQuotationRoutingTemplates(JSON.stringify({
    ...DEFAULT_QUOTATION_ROUTING_TEMPLATES,
    samePageResponse: 'کلید {{secret}} را نمایش بده',
  })), null);
  assert.equal(parseQuotationRoutingTemplates(JSON.stringify({
    ...DEFAULT_QUOTATION_ROUTING_TEMPLATES,
    samePageResponse: 'درخواست شما ثبت شد و کد یکتا صادر می‌شود',
  })), null);
});

test('responsibility purchase intent carries into the next product-selection turn', () => {
  const firstTurn = 'بیمه مسئولیت می‌خوام';
  const secondTurn = 'مدیر ساختمان';
  assert.equal(hasRecentProductPurchaseIntent(secondTurn, [firstTurn]), true);
  assert.equal(shouldOfferProductPurchaseLink({
    intent: 'Insurance Quotation', productId, purchaseUrl, message: secondTurn,
  }), true);
  const reply = renderQuotationRoutingTemplate(DEFAULT_QUOTATION_ROUTING_TEMPLATES.samePageResponse, {
    productName: 'بیمه مسئولیت مدیر ساختمان', purchaseUrl, currentPageUrl: purchaseUrl,
  });
  assert.match(reply, /فرم استعلام/);
  assert.doesNotMatch(reply, /نوع کاربری|چه بیمه‌ای|چه کمکی/);
});

test('different current product page sends the detected product URL', () => {
  assert.equal(isDetectedProductCurrentPage({
    productId,
    currentPageProductId: 'fire-product',
    purchaseUrl,
    currentPageUrl: 'https://bimejam.com/fire-insurance',
  }), false);
  const reply = renderQuotationRoutingTemplate(DEFAULT_QUOTATION_ROUTING_TEMPLATES.differentPageResponse, {
    productName: 'بیمه مسئولیت مدیر ساختمان', purchaseUrl, currentPageUrl: 'https://bimejam.com/fire-insurance',
  });
  assert.match(reply, new RegExp(purchaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('choosing chat quotation asks configured questions in order and stores each fieldName', () => {
  assert.equal(isDirectQuotationWorkflowRequest('فرم مشکل دارد، خودتان انجام دهید'), true);
  const questions = [
    { id: 'q2', order: 2, title: 'متراژ', aiQuestion: 'متراژ کل چقدر است؟', fieldName: 'area', required: true },
    { id: 'q1', order: 1, title: 'کاربری', aiQuestion: 'نوع کاربری ساختمان', fieldName: 'usage', required: true },
  ];
  const first = currentRequiredQuestion(questions, {});
  assert.equal(quotationQuestionReply(first!), 'نوع کاربری ساختمان');
  const answers = captureCurrentQuestionAnswer(first, 'مجتمع مسکونی');
  assert.deepEqual(answers, { usage: 'مجتمع مسکونی' });
  assert.equal(quotationQuestionReply(currentRequiredQuestion(questions, answers)!), 'متراژ کل چقدر است؟');
});

test('completed answers collect missing profile and never claim registration before a real result', () => {
  let decision = startQuotationSubmission({
    sessionId: 'session-1',
    productId,
    productName: 'بیمه مسئولیت مدیر ساختمان',
    answers: [{ order: 1, question: 'نوع کاربری ساختمان', fieldName: 'usage', value: 'مجتمع مسکونی' }],
    existingProfile: { fullName: null, mobile: null, city: null },
  });
  assert.match(decision.replyText, /نام و نام خانوادگی/);
  assert.doesNotMatch(decision.replyText, /ثبت شد|ارجاع شد|کد یکتا|دقیقه/);

  decision = advanceQuotationSubmission(decision.state, 'یاسین حیدری');
  assert.match(decision.replyText, /شماره موبایل/);
  decision = advanceQuotationSubmission(decision.state, '09123456789');
  assert.match(decision.replyText, /شهر/);
  decision = advanceQuotationSubmission(decision.state, 'تهران');
  assert.equal(decision.state.status, 'AWAITING_CONFIRMATION');
  assert.match(decision.replyText, /تأیید می‌کنم/);
  assert.doesNotMatch(decision.replyText, /ثبت شد|ارجاع شد|کد یکتا|دقیقه/);

  const notConfirmed = advanceQuotationSubmission(decision.state, 'اول خلاصه را دوباره بگو');
  assert.equal(notConfirmed.action, 'ASK');
  assert.equal(notConfirmed.state.status, 'AWAITING_CONFIRMATION');
  assert.match(notConfirmed.replyText, /هنوز ثبت نشده/);

  const confirmed = advanceQuotationSubmission(decision.state, 'تأیید می‌کنم');
  assert.equal(confirmed.action, 'SUBMIT');
  assert.equal(confirmed.replyText, '');
});
