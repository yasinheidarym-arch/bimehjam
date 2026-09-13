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
import { renderQuotationCompletionSuccess } from '../shared/quotationCompletionRule.ts';

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
  assert.match(reply, /فرم استعلام آنلاین همین صفحه/);
  assert.match(reply, /همینجا چند سؤال/);
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

test('completed answers collect profile and ask for delivery route without a confirmation phrase', () => {
  const choicePrompt = 'تماس یا اعلام قیمت در چت؟';
  let decision = startQuotationSubmission({
    sessionId: 'session-1',
    productId,
    productName: 'بیمه مسئولیت مدیر ساختمان',
    answers: [{ order: 1, fieldLabel: 'نوع کاربری ساختمان', fieldName: 'usage', value: 'مجتمع مسکونی' }],
    existingProfile: { fullName: null, mobile: null, city: null },
    choicePrompt,
  });
  assert.match(decision.replyText, /نام و نام خانوادگی/);
  assert.doesNotMatch(decision.replyText, /ثبت شد|ارجاع شد|کد یکتا|دقیقه|خلاصه/);

  decision = advanceQuotationSubmission(decision.state, 'یاسین حیدری');
  assert.match(decision.replyText, /شماره موبایل/);
  decision = advanceQuotationSubmission(decision.state, '09123456789');
  assert.match(decision.replyText, /شهر/);
  decision = advanceQuotationSubmission(decision.state, 'تهران');
  assert.equal(decision.state.status, 'AWAITING_DELIVERY_CHOICE');
  assert.equal(decision.replyText, choicePrompt);

  const call = advanceQuotationSubmission(decision.state, 'کارشناس با من تماس بگیرد');
  assert.equal(call.action, 'ROUTE');
  if (call.action === 'ROUTE') assert.equal(call.route, 'CALL');
  const chat = advanceQuotationSubmission(decision.state, 'قیمت را همین‌جا در چت اعلام کنید');
  assert.equal(chat.action, 'ROUTE');
  if (chat.action === 'ROUTE') assert.equal(chat.route, 'CHAT');
});

test('exact chat and callback choices deterministically select their existing routes', () => {
  const base = startQuotationSubmission({
    sessionId: 'delivery', productId, productName: 'بیمه مسئولیت مدیر ساختمان', answers: [],
    existingProfile: { fullName: 'کاربر آزمایشی', mobile: '09120000000', city: 'تهران' },
    choicePrompt: 'تماس یا اعلام قیمت در چت؟',
  });
  const chat = advanceQuotationSubmission(base.state, 'در همین چت اعلام شه');
  assert.equal(chat.action, 'ROUTE');
  if (chat.action === 'ROUTE') assert.equal(chat.route, 'CHAT');
  const call = advanceQuotationSubmission(base.state, 'کارشناس با من تماس بگیره');
  assert.equal(call.action, 'ROUTE');
  if (call.action === 'ROUTE') assert.equal(call.route, 'CALL');
});

test('administrator SLA changes final wording without changing code', () => {
  const template = 'قیمت بررسی می‌شود{{slaText}} و در چت اعلام خواهد شد.';
  assert.match(renderQuotationCompletionSuccess(template, 12), /۱۲ دقیقه/);
  assert.doesNotMatch(renderQuotationCompletionSuccess(template, null), /دقیقه/);
});
