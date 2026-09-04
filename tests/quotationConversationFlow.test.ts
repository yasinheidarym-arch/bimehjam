import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureCurrentQuestionAnswer,
  currentRequiredQuestion,
  isExplicitQuotationFormRequest,
  isInsuranceQuotationRequest,
  quotationCompletedReply,
  quotationFormReply,
  quotationQuestionReply,
  QuotationTurnQuestion,
} from '../server/services/quotationConversationFlow.ts';

const questions: QuotationTurnQuestion[] = Array.from({ length: 20 }, (_, index) => ({
  id: `question-${index + 1}`,
  title: index === 0
    ? 'نوع کاربری ساختمان'
    : index === 1
      ? 'جمع کل متراژ مجموع طبقات ساختمان با احتساب طبقه همکف و منفی چقدر است؟'
      : `سؤال ${index + 1}`,
  aiQuestion: index === 0
    ? 'نوع کاربری ساختمان'
    : index === 1
      ? 'جمع کل متراژ مجموع طبقات ساختمان با احتساب طبقه همکف و منفی چقدر است؟'
      : `پاسخ سؤال ${index + 1} چیه؟`,
  fieldName: index === 0 ? 'type' : index === 1 ? 'majmuemetraj' : `field_${index + 1}`,
  required: true,
  order: index + 1,
  options: index === 0 ? JSON.stringify(['ساختمان مسکونی', 'مجتمع تجاری']) : '[]',
}));

test('building managers price request starts with the first quotation question, not a form suggestion', () => {
  const message = 'برای بیمه مسئولیت مدیران ساختمان قیمت می‌خواهم';
  assert.equal(isInsuranceQuotationRequest(message), true);
  assert.equal(isExplicitQuotationFormRequest(message), false);

  const first = currentRequiredQuestion(questions, {});
  assert.equal(first?.fieldName, 'type');
  assert.equal(quotationQuestionReply(first!), 'نوع کاربری ساختمان');
  assert.doesNotMatch(quotationQuestionReply(first!), /فرم/);
});

test('the first customer answer is stored under its fieldName and advances to question two', () => {
  const first = currentRequiredQuestion(questions, {});
  const collected = captureCurrentQuestionAnswer(first, 'ساختمان مسکونی');

  assert.deepEqual(collected, { type: 'ساختمان مسکونی' });
  const second = currentRequiredQuestion(questions, collected);
  assert.equal(second?.fieldName, 'majmuemetraj');
  assert.equal(
    quotationQuestionReply(second!),
    'جمع کل متراژ مجموع طبقات ساختمان با احتساب طبقه همکف و منفی چقدر است؟',
  );
});

test('answering every required question completes the quotation workflow', () => {
  let collected: Record<string, string> = {};
  while (true) {
    const current = currentRequiredQuestion(questions, collected);
    if (!current) break;
    collected = { ...collected, ...captureCurrentQuestionAnswer(current, `پاسخ ${current.order}`) };
  }

  assert.equal(Object.keys(collected).length, 20);
  assert.equal(currentRequiredQuestion(questions, collected), null);
  assert.match(quotationCompletedReply(), /اطلاعات استعلام شما کامل شد/);
});

test('an explicit customer request for the online form uses the alternate form path', () => {
  const message = 'لطفاً لینک فرم استعلام آنلاین را بفرست';
  assert.equal(isExplicitQuotationFormRequest(message), true);
  assert.match(quotationFormReply(), /فرم استعلام همین صفحه/);
});
