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
  isQuotationSummaryConfirmed,
  startQuotationSubmission,
} from '../server/services/quotationSubmissionFlow.ts';
import { DEFAULT_QUOTATION_COMPLETION_CONFIG, renderQuotationCompletionSuccess } from '../shared/quotationCompletionRule.ts';
import { validateQuotationSummaryClassifierOutput } from '../server/services/quotationClassifierService.ts';

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
  assert.match(reply, /فرم آنلاین همین صفحه/);
  assert.match(reply, /همین‌جا مرحله‌به‌مرحله/);
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
  assert.match(reply, /فرم آنلاین/);
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

test('completed answers collect profile, show the configured summary, and await confirmation', () => {
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
  assert.equal(decision.state.status, 'AWAITING_CONFIRMATION');
  assert.equal(decision.action, 'ASK');
  assert.match(decision.replyText, /نوع کاربری ساختمان: مجتمع مسکونی/);
  assert.match(decision.replyText, /یاسین حیدری/);
  assert.doesNotMatch(decision.replyText, /ثبت شد|ارجاع شد|کد یکتا/);
  decision = advanceQuotationSubmission(decision.state, 'تأیید می‌کنم');
  assert.equal(decision.state.status, 'PROCESSING');
  assert.equal(decision.action, 'ROUTE');
  if (decision.action === 'ROUTE') assert.equal(decision.route, 'CALL');
});

test('historical delivery-choice states keep their existing chat and callback routes', () => {
  const base = startQuotationSubmission({
    sessionId: 'delivery', productId, productName: 'بیمه مسئولیت مدیر ساختمان', answers: [],
    existingProfile: { fullName: 'کاربر آزمایشی', mobile: '09120000000', city: 'تهران' },
    choicePrompt: 'تماس یا اعلام قیمت در چت؟',
  });
  const legacyState = { ...base.state, step: 'DELIVERY_CHOICE' as const, status: 'AWAITING_DELIVERY_CHOICE' as const, deliveryChoice: undefined };
  const chat = advanceQuotationSubmission(legacyState, 'در همین چت اعلام شه');
  assert.equal(chat.action, 'ROUTE');
  if (chat.action === 'ROUTE') assert.equal(chat.route, 'CHAT');
  const call = advanceQuotationSubmission(legacyState, 'کارشناس با من تماس بگیره');
  assert.equal(call.action, 'ROUTE');
  if (call.action === 'ROUTE') assert.equal(call.route, 'CALL');
});

test('administrator SLA changes final wording without changing code', () => {
  const template = 'قیمت بررسی می‌شود{{slaText}} و در چت اعلام خواهد شد.';
  assert.match(renderQuotationCompletionSuccess(template, 12), /۱۲ دقیقه/);
  assert.doesNotMatch(renderQuotationCompletionSuccess(template, null), /دقیقه/);
});

function summaryState() {
  return startQuotationSubmission({
    sessionId: 'summary-session', productId, productName: 'بیمه مسئولیت مدیر ساختمان',
    answers: [{ order: 1, fieldLabel: 'متراژ کل ساختمان', fieldName: 'area', value: '1500' }],
    existingProfile: { fullName: 'کاربر آزمایشی', mobile: '09121111111', city: 'تهران' },
    choicePrompt: 'unused',
  }).state;
}

test('summary city correction updates real state and renders a fresh confirmation summary', async () => {
  const state = summaryState();
  const correction = await validateQuotationSummaryClassifierOutput({
    message: 'ما کرج هستیم', state, questions: [],
    output: { action: 'FIELD_CORRECTION', fieldKey: 'profile.city', proposedValue: 'کرج', evidence: 'کرج', selectedOptionId: null, selectedOptionValue: null, confidence: .96, reason: 'Customer supplied a replacement city' },
  });
  const decision = advanceQuotationSubmission(state, 'ما کرج هستیم', null, undefined, DEFAULT_QUOTATION_COMPLETION_CONFIG, correction);
  assert.equal(decision.action, 'ASK');
  assert.equal(decision.state.profile.city, 'کرج');
  assert.equal(decision.state.status, 'AWAITING_CONFIRMATION');
  assert.match(decision.replyText, /شهر یا محل مورد بیمه: کرج/);
  assert.match(decision.replyText, /تأیید/);
});

test('semantic summary confirmations advance to submission', () => {
  for (const message of ['تایید است', 'درسته', 'همه چی درسته', 'اوکیه']) {
    assert.equal(isQuotationSummaryConfirmed(message), true, message);
    const decision = advanceQuotationSubmission(summaryState(), message);
    assert.equal(decision.action, 'ROUTE', message);
  }
});

test('summary mobile correction is normalized and displayed without changing other fields', async () => {
  const state = summaryState();
  const correction = await validateQuotationSummaryClassifierOutput({
    message: 'شماره درست ۰۹۱۲۳۴۵۶۷۸۹ است', state, questions: [],
    output: { action: 'FIELD_CORRECTION', fieldKey: 'profile.mobile', proposedValue: '۰۹۱۲۳۴۵۶۷۸۹', evidence: '۰۹۱۲۳۴۵۶۷۸۹', selectedOptionId: null, selectedOptionValue: null, confidence: .98, reason: 'Replacement mobile supplied' },
  });
  const decision = advanceQuotationSubmission(state, 'شماره درست ۰۹۱۲۳۴۵۶۷۸۹ است', null, undefined, DEFAULT_QUOTATION_COMPLETION_CONFIG, correction);
  assert.equal(decision.state.profile.mobile, '09123456789');
  assert.equal(decision.state.profile.city, 'تهران');
  assert.match(decision.replyText, /09123456789/);
});

test('summary quotation-field correction uses the real field schema before replacing its value', async () => {
  const state = summaryState();
  const question = {
    id: 'area-question', title: 'متراژ کل ساختمان', aiQuestion: 'متراژ کل ساختمان چقدر است؟',
    fieldName: 'area', type: 'number', required: true, order: 1, minVal: 1, maxVal: 100000,
  };
  const correction = await validateQuotationSummaryClassifierOutput({
    message: 'متراژ 1200 هست نه 1500', state, questions: [question],
    output: { action: 'FIELD_CORRECTION', fieldKey: 'answer.area', proposedValue: '1200', evidence: '1200', selectedOptionId: null, selectedOptionValue: null, confidence: .97, reason: 'Replacement area supplied' },
  });
  assert.equal(correction.action, 'FIELD_CORRECTION');
  const decision = advanceQuotationSubmission(state, 'متراژ 1200 هست نه 1500', null, undefined, DEFAULT_QUOTATION_COMPLETION_CONFIG, correction);
  assert.equal(decision.state.answers[0]?.value, '1200');
  assert.match(decision.replyText, /متراژ کل ساختمان: 1200/);
  assert.equal(decision.state.status, 'AWAITING_CONFIRMATION');
});

test('unspecified or invalid summary corrections use the rule prompt and preserve old values', async () => {
  const config = { ...DEFAULT_QUOTATION_COMPLETION_CONFIG, summaryCorrectionPrompt: 'RULE_CORRECTION_PROMPT' };
  const state = summaryState();
  const unspecified = advanceQuotationSubmission(state, 'یه مورد اشتباهه', null, undefined, config, {
    action: 'UNSPECIFIED_CORRECTION', confidence: .95, reason: 'No field or value supplied',
  });
  assert.equal(unspecified.replyText, 'RULE_CORRECTION_PROMPT');
  assert.deepEqual(unspecified.state.profile, state.profile);

  const invalid = await validateQuotationSummaryClassifierOutput({
    message: 'شماره درست ۱۲۳ است', state, questions: [],
    output: { action: 'FIELD_CORRECTION', fieldKey: 'profile.mobile', proposedValue: '۱۲۳', evidence: '۱۲۳', selectedOptionId: null, selectedOptionValue: null, confidence: .98, reason: 'Replacement mobile supplied' },
  });
  assert.equal(invalid.action, 'INVALID_CORRECTION');
  const rejected = advanceQuotationSubmission(state, 'شماره درست ۱۲۳ است', null, undefined, config, invalid);
  assert.equal(rejected.replyText, 'RULE_CORRECTION_PROMPT');
  assert.equal(rejected.state.profile.mobile, '09121111111');
});
