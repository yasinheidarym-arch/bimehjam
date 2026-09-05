import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentPageQuotationReply,
  isDetectedProductCurrentPage,
  isDirectQuotationWorkflowRequest,
  productPurchaseLinkReply,
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
  const reply = currentPageQuotationReply();
  assert.match(reply, /فرم استعلام آنلاین همین محصول در همین صفحه/);
  assert.match(reply, /سؤال‌های استعلام را یکی‌یکی/);
  assert.doesNotMatch(reply, /https?:\/\//);
});

test('different current product page sends the detected product URL', () => {
  assert.equal(isDetectedProductCurrentPage({
    productId,
    currentPageProductId: 'fire-product',
    purchaseUrl,
    currentPageUrl: 'https://bimejam.com/fire-insurance',
  }), false);
  assert.match(productPurchaseLinkReply(purchaseUrl), new RegExp(purchaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
