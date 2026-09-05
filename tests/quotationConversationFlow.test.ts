import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeQuotationMessage,
  captureCurrentQuestionAnswer,
  currentRequiredQuestion,
  isExplicitQuotationFormRequest,
  isInsuranceQuotationRequest,
  invalidQuotationAnswerReason,
  invalidQuotationAnswerReply,
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
    const answer = current.order === 1 ? 'ساختمان مسکونی' : `پاسخ ${current.order}`;
    collected = { ...collected, ...captureCurrentQuestionAnswer(current, answer) };
  }

  assert.equal(Object.keys(collected).length, 20);
  assert.equal(currentRequiredQuestion(questions, collected), null);
  assert.match(quotationCompletedReply(), /پاسخ سؤال‌های استعلام کامل شد/);
  assert.match(quotationCompletedReply(), /هنوز ثبت نشده|تأیید نهایی/);
});

test('an explicit customer request for the online form uses the alternate form path', () => {
  const message = 'لطفاً لینک فرم استعلام آنلاین را بفرست';
  assert.equal(isExplicitQuotationFormRequest(message), true);
  assert.match(quotationFormReply(), /فرم استعلام همین صفحه/);
});

test('an insurance question does not become the numeric elevator answer or advance the workflow', () => {
  const elevatorQuestion: QuotationTurnQuestion = {
    id: 'elevators',
    title: 'تعداد آسانسور',
    aiQuestion: 'چند دستگاه آسانسور توی ساختمان شما وجود دارد؟',
    fieldName: 'elevatorCount',
    type: 'number',
    required: true,
    order: 8,
    minVal: 0,
  };
  const message = 'میشه بیمه توضیح بدی چقدر بازه؟';
  const analysis = analyzeQuotationMessage(elevatorQuestion, message);
  assert.deepEqual(analysis, { validAnswer: false, answerValue: null, asksQuestion: true });
  assert.deepEqual(captureCurrentQuestionAnswer(elevatorQuestion, message), {});
  assert.equal(currentRequiredQuestion([elevatorQuestion], {}), elevatorQuestion);
});

test('a valid combined answer is captured before answering the interruption and advancing', () => {
  const elevatorQuestion: QuotationTurnQuestion = {
    id: 'elevators',
    title: 'تعداد آسانسور',
    aiQuestion: 'چند دستگاه آسانسور توی ساختمان شما وجود دارد؟',
    fieldName: 'elevatorCount',
    type: 'number',
    required: true,
    order: 8,
  };
  const nextQuestion: QuotationTurnQuestion = {
    id: 'term', title: 'مدت بیمه', aiQuestion: 'مدت بیمه درخواستی چند ماه است؟',
    fieldName: 'insuranceTerm', type: 'number', required: true, order: 9,
  };
  const message = '۳ تا، بیمه چه پوشش‌هایی دارد؟';
  const analysis = analyzeQuotationMessage(elevatorQuestion, message);
  assert.equal(analysis.validAnswer, true);
  assert.equal(analysis.asksQuestion, true);
  const collected = captureCurrentQuestionAnswer(elevatorQuestion, message);
  assert.deepEqual(collected, { elevatorCount: '3' });
  assert.equal(currentRequiredQuestion([elevatorQuestion, nextQuestion], collected), nextQuestion);
});

test('configured choices reject unrelated text and store the canonical option', () => {
  const usageQuestion: QuotationTurnQuestion = {
    id: 'usage', title: 'کاربری', fieldName: 'usage', type: 'select', required: true, order: 1,
    options: JSON.stringify(['مجتمع مسکونی', 'مجتمع تجاری']),
  };
  assert.deepEqual(captureCurrentQuestionAnswer(usageQuestion, 'درباره پوشش‌ها توضیح می‌دهید؟'), {});
  assert.deepEqual(captureCurrentQuestionAnswer(usageQuestion, 'مجتمع مسکونی'), { usage: 'مجتمع مسکونی' });
});

test('building age accepts English, Persian and suffixed numeric answers and advances', () => {
  const ageQuestion: QuotationTurnQuestion = {
    id: 'building-age',
    title: 'سن ساختمان',
    aiQuestion: 'ساختمان مورد بیمه چند سال ساخته؟',
    fieldName: 'buildingAge',
    type: 'number',
    required: true,
    order: 4,
    minVal: 0,
    maxVal: 100,
  };
  const nextQuestion: QuotationTurnQuestion = {
    id: 'floors', title: 'تعداد طبقات', aiQuestion: 'ساختمان چند طبقه دارد؟',
    fieldName: 'floorCount', type: 'number', required: true, order: 5,
  };
  for (const message of ['2', '۲', '۲ ساله', '  2 سال  ', '۲ طبقه']) {
    const answer = captureCurrentQuestionAnswer(ageQuestion, message);
    assert.deepEqual(answer, { buildingAge: '2' }, message);
    assert.equal(currentRequiredQuestion([ageQuestion, nextQuestion], answer), nextQuestion, message);
  }
});

test('invalid numeric replies explain once, pause after two attempts and expose a log reason', () => {
  const question: QuotationTurnQuestion = {
    id: 'building-age', title: 'سن ساختمان', fieldName: 'buildingAge',
    type: 'number', required: true, order: 1, minVal: 0, maxVal: 100,
  };
  assert.match(invalidQuotationAnswerReply(question, 1), /عدد معتبر/);
  assert.doesNotMatch(invalidQuotationAnswerReply(question, 1), /سن ساختمان/);
  assert.match(invalidQuotationAnswerReply(question, 2), /متوقف شد/);
  assert.match(invalidQuotationAnswerReason(question), /buildingAge.*عدد معتبر.*حداقل 0.*حداکثر 100/);
});
