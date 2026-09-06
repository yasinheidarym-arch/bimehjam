import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceQuotationTurn, applicableQuotationQuestions, type QuotationTurnState, type QuotationTurnModel } from '../server/services/quotationStateMachine';
import { explainQuotationInterruption } from '../server/services/quotationInterruption';
import { quotationQuestionHelp } from '../server/services/quotationQuestionHelp';
import { withConversationTurn } from '../server/services/conversationTurnQueue';
import type { QuotationTurnQuestion } from '../server/services/quotationConversationFlow';
import { startQuotationSubmission, advanceQuotationSubmission } from '../server/services/quotationSubmissionFlow';

const questions: QuotationTurnQuestion[] = [
  { id: 'usage', title: 'کاربری', aiQuestion: 'نوع کاربری ساختمان چیست؟', fieldName: 'usage', required: true, order: 1, type: 'select', options: ['مجتمع مسکونی', 'مجتمع تجاری'] },
  { id: 'area', title: 'متراژ', aiQuestion: 'جمع کل متراژ مجموع طبقات ساختمان با احتساب طبقه همکف و منفی چقدر است؟', fieldName: 'area', required: true, order: 2, type: 'number', minVal: 1, maxVal: 100000 },
  { id: 'age', title: 'سن ساختمان', aiQuestion: 'ساختمان مورد بیمه چند سال ساخته؟', fieldName: 'age', required: true, order: 3, type: 'select', options: ['تا ۵ سال ساخت', '۶ تا ۱۵ سال ساخت', 'بیش از ۱۵ سال ساخت'] },
  { id: 'elevators', title: 'تعداد آسانسور', aiQuestion: 'چند دستگاه آسانسور وجود دارد؟', fieldName: 'elevators', required: true, order: 4, type: 'number', minVal: 0, maxVal: 20 },
  { id: 'guard', title: 'نگهبان', aiQuestion: 'آیا نگهبان دارید؟', fieldName: 'guard', required: true, order: 5, type: 'boolean' },
];
function conversation(initial: Record<string, string> = {}, model?: QuotationTurnModel) {
  let state: QuotationTurnState | undefined;
  let answers = { ...initial };
  return async (message: string) => {
    const result = await advanceQuotationTurn({ sessionId: 'session', questions, answers, previous: state, message, model });
    // Mock the same persistence contract used by QuotationSession.
    answers = { ...answers, ...result.updates };
    state = JSON.parse(JSON.stringify(result.state));
    return result;
  };
}
const base = { usage: 'مجتمع مسکونی', area: '500' };
const assignment = (fieldName: string, evidence: string, value = evidence, confidence = .95) => ({ fieldName, evidence, value, confidence });

test('full persisted conversation uses canonical questions in order and completes', async () => {
  const turn = conversation();
  const first = await turn('خونه و محل سکونته');
  assert.equal(first.state.answers.usage, 'مجتمع مسکونی');
  assert.equal(first.nextQuestionText, questions[1].aiQuestion);
  assert.equal((await turn('۵۰۰ متر')).state.currentQuestion?.fieldName, 'age');
  assert.equal((await turn('دو ساله')).state.answers.age, 'تا ۵ سال ساخت');
  assert.equal((await turn('۲ دستگاه')).state.answers.elevators, '2');
  const done = await turn('آره');
  assert.equal(done.state.answers.guard, 'بله');
  assert.equal(done.state.currentQuestion, null);
  assert.equal(Object.keys(done.state.answers).length, 5);
});
test('Persian/English digits, suffixes and ranges map within the actual age options', async () => {
  for (const message of ['2', '۲', ' ۲ ساله ', 'دو ساله', '۲ تا ۴ سال']) {
    const result = await conversation(base)(message);
    assert.equal(result.updates.age, 'تا ۵ سال ساخت', message);
    assert.equal(result.state.currentQuestion?.fieldName, 'elevators');
  }
});
test('off-context yes/no never becomes 9, advances, or calls the model', async () => {
  for (const initial of [base, { ...base, age: 'تا ۵ سال ساخت' }]) {
    const turn = conversation(initial, async () => { throw new Error('must not call'); });
    for (const message of ['آره', 'نه', 'بله', 'خیر']) {
      const result = await turn(message);
      assert.deepEqual(result.updates, {});
      assert.doesNotMatch(result.clarification!, /متوقف|بن بست/);
    }
    assert.equal((await turn('2')).state.ambiguity, 'NONE');
  }
});
test('interruption containing a number is never captured, even if model tries', async () => {
  const turn = conversation({ ...base, age: 'تا ۵ سال ساخت' }, async () => ({ asksQuestion: true, assignments: [assignment('elevators', '2')] }));
  const result = await turn('بیمه با 2 آسانسور چقدر هزینه دارد؟');
  assert.deepEqual(result.updates, {});
  assert.equal(result.interruption, true);
  assert.equal(result.nextQuestionText, questions[3].aiQuestion);
});
test('a model-detected question without punctuation cannot contribute a numeric answer', async () => {
  const result = await conversation({ ...base, age: 'تا ۵ سال ساخت' }, async () => ({ asksQuestion: true, assignments: [assignment('elevators', 'دو')] }))('پوشش آسانسور شامل دو دستگاه هست');
  assert.deepEqual(result.updates, {});
  assert.equal(result.interruption, true);
});
test('valid answer followed by a question is saved, explanation precedes exact next question', async () => {
  const result = await conversation({ ...base, age: 'تا ۵ سال ساخت' })('۳ تا، بیمه چه پوشش‌هایی دارد؟');
  assert.equal(result.updates.elevators, '3');
  assert.equal(result.interruption, true);
  assert.equal(result.nextQuestionText, questions[4].aiQuestion);
});
test('ambiguous and irrelevant replies clarify then offer help while preserving state', async () => {
  const turn = conversation(base, async () => ({ assignments: [] }));
  const first = await turn('فکر کنم قدیمیه');
  assert.equal(first.state.ambiguity, 'CLARIFY');
  assert.doesNotMatch(first.clarification!, /تا ۵ سال ساخت/);
  const second = await turn('امروز هوا خوبه');
  assert.equal(second.state.ambiguity, 'HELP');
  assert.match(second.clarification!, /تا ۵ سال ساخت.*کارشناس/);
  assert.equal(second.state.currentQuestion?.fieldName, 'age');
  assert.deepEqual(second.state.answers, base);
  assert.equal((await turn('۲ سال')).state.ambiguity, 'NONE');
});
test('explicit correction updates only the named previous field, pending question remains', async () => {
  const turn = conversation(base, async () => ({ assignments: [assignment('age', '۱۰ سال', '۶ تا ۱۵ سال ساخت')] }));
  await turn('2');
  const result = await turn('سن ساختمان را اصلاح کن، ۱۰ سال');
  assert.deepEqual(result.updates, { age: '۶ تا ۱۵ سال ساخت' });
  assert.equal(result.state.currentQuestion?.fieldName, 'elevators');
  assert.equal(result.decisions[0].outcome, 'CORRECTED');
});
test('correction of last answer uses persisted lastAnsweredField', async () => {
  const turn = conversation({ ...base, age: 'تا ۵ سال ساخت' }, async () => ({ assignments: [assignment('elevators', '3')] }));
  await turn('2');
  const result = await turn('جواب قبلی اشتباه گفتم 3');
  assert.deepEqual(result.updates, { elevators: '3' });
  assert.equal(result.state.currentQuestion?.fieldName, 'guard');
});
test('multiple explicitly labelled fields are saved under their own names, order remains canonical', async () => {
  const result = await conversation({ usage: 'مجتمع مسکونی' }, async () => ({ assignments: [assignment('area', '500'), assignment('elevators', '2')] }))('متراژ: 500؛ تعداد آسانسور: 2');
  assert.deepEqual(result.updates, { area: '500', elevators: '2' });
  assert.equal(result.state.currentQuestion?.fieldName, 'age');
});
test('fabricated option, unknown field, absent evidence, low confidence and duplicate field are rejected', async () => {
  for (const assignments of [
    [assignment('secret', 'نوسازه')], [assignment('age', 'نوسازه', 'گزینه خیالی')],
    [assignment('age', 'وجود ندارد', 'تا ۵ سال ساخت')],
    [assignment('age', 'نوسازه', 'تا ۵ سال ساخت', .4)],
    [assignment('age', 'نوسازه', 'تا ۵ سال ساخت'), assignment('age', 'نوسازه', '۶ تا ۱۵ سال ساخت')],
  ]) assert.deepEqual((await conversation(base, async () => ({ assignments }))('نوسازه')).updates, {});
});
test('semantic model may choose only a real option with verbatim evidence', async () => {
  const result = await conversation(base, async () => ({ assignments: [assignment('age', 'نوسازه', 'تا ۵ سال ساخت')] }))('نوسازه');
  assert.equal(result.updates.age, 'تا ۵ سال ساخت');
});
test('out of bounds numbers and ranges spanning bands cannot be overridden by model', async () => {
  for (const message of ['-2', '۴ تا ۸ سال']) {
    assert.deepEqual((await conversation(base, async () => ({ assignments: [assignment('age', message, 'تا ۵ سال ساخت')] }))(message)).updates, {});
  }
  assert.deepEqual((await conversation({ ...base, age: 'تا ۵ سال ساخت' })('500')).updates, {});
});
test('conditional questions use same boolean semantics as session evaluation', () => {
  const conditional = { ...questions[3], condition: JSON.stringify({ dependsOn: 'guard', value: 'true' }) };
  assert.equal(applicableQuotationQuestions([conditional], { guard: 'بله' }).length, 1);
  assert.equal(applicableQuotationQuestions([conditional], { guard: 'خیر' }).length, 0);
});
test('correction at completed questionnaire updates answer without starting a new questionnaire', async () => {
  const result = await conversation({ ...base, age: 'تا ۵ سال ساخت', elevators: '2', guard: 'بله' }, async () => ({ assignments: [assignment('elevators', '3')] }))('تعداد آسانسور اصلاح شود: 3');
  assert.equal(result.updates.elevators, '3');
  assert.equal(result.state.currentQuestion, null);
});
test('model outage preserves state and offers retry/help without trapping customer', async () => {
  const result = await conversation(base, async () => { throw Error('mock outage'); })('نوسازه');
  assert.deepEqual(result.updates, {});
  assert.equal(result.state.currentQuestion?.fieldName, 'age');
});
test('explanation cannot invent knowledge or replace a stored question', async () => {
  const knowledge = 'این پوشش شامل مسئولیت مدیر ساختمان است.';
  assert.equal(await explainQuotationInterruption({ message: 'توضیح بده', knowledge, select: async () => ({ passages: [knowledge] }) }), knowledge);
  const fallback = await explainQuotationInterruption({ message: 'قیمت؟', knowledge, select: async () => ({ passages: ['قیمت قطعی 100 است.', 'چند واحد دارید؟'] }) });
  assert.doesNotMatch(fallback, /100|چند واحد/);
});
test('concurrent turns serialize persistence and recover after an exception', async () => {
  const order: number[] = [];
  await Promise.all([withConversationTurn('chat', async () => { await Promise.resolve(); order.push(1); }), withConversationTurn('chat', async () => { order.push(2); })]);
  assert.deepEqual(order, [1, 2]);
  await assert.rejects(withConversationTurn('chat', async () => { throw Error('failure'); }));
  await withConversationTurn('chat', async () => { order.push(3); });
  assert.deepEqual(order, [1, 2, 3]);
});

test('numeric normalization covers decimals, separators and compound Persian words', async () => {
  for (const [message, value] of [['دوازده', '12'], ['بیست و دو متر', '22'], ['۱٬۲۰۰ متر', '1200'], ['1,200', '1200'], ['۲٫۵ متر', '2.5']]) {
    const result = await conversation({ usage: 'مجتمع مسکونی' })(message);
    assert.equal(result.updates.area, value, message);
  }
});
test('all twenty questions complete without manufacturing or reordering questions', async () => {
  const form = Array.from({ length: 20 }, (_, index) => ({ id: `q${index}`, title: `فیلد ${index}`, aiQuestion: `متن ذخیره‌شده ${index}`, fieldName: `f${index}`, required: true, type: 'number', order: index + 1, minVal: 0 }));
  let state: QuotationTurnState | undefined;
  for (let index = 0; index < 20; index++) {
    const result = await advanceQuotationTurn({ sessionId: 'twenty', questions: [...form].reverse(), answers: state?.answers || {}, previous: state, message: '۲ ساله' });
    assert.deepEqual(result.updates, { [`f${index}`]: '2' });
    assert.equal(result.nextQuestionText, form[index + 1]?.aiQuestion || null);
    state = result.state;
  }
  assert.equal(Object.keys(state!.answers).length, 20);
});

test('completion collects contact information then requires actual confirmation', () => {
  let decision = startQuotationSubmission({ sessionId: 'session', productId: 'product', productName: 'مدیر ساختمان', answers: [], existingProfile: {} });
  assert.equal(decision.state.step, 'FULL_NAME');
  assert.equal(advanceQuotationSubmission(decision.state, 'آره').state.step, 'FULL_NAME');
  decision = advanceQuotationSubmission(decision.state, 'آرش رضایی');
  assert.equal(decision.state.step, 'MOBILE');
  decision = advanceQuotationSubmission(decision.state, '۰۹۱۲۱۲۳۴۵۶۷');
  assert.equal(decision.state.step, 'CITY');
  assert.equal(advanceQuotationSubmission(decision.state, 'چقدر هزینه دارد؟').state.profile.city, undefined);
  decision = advanceQuotationSubmission(decision.state, 'تهران');
  assert.equal(decision.state.step, 'CONFIRM');
  assert.equal(decision.action, 'ASK');
  assert.equal(advanceQuotationSubmission(decision.state, 'نه').action, 'ASK');
  assert.equal(advanceQuotationSubmission(decision.state, 'آره').action, 'SUBMIT');
});

test('area help without an article explains summation and preserves the exact pending question', async () => {
  const message = 'چجوری حسابش کنم؟';
  const result = await conversation({ usage: 'مجتمع مسکونی' }, async () => { assert.fail('help must not invoke answer model'); })(message);
  assert.deepEqual(result.updates, {});
  assert.equal(result.state.currentQuestion?.fieldName, 'area');
  assert.equal(result.state.attempts.area, undefined);
  const reply = await explainQuotationInterruption({ message, question: questions[1], knowledge: '', select: async () => { assert.fail('no article/model needed'); } });
  assert.match(reply, /همکف.*منفی/);
  assert.match(reply, /۱۰۰.*۵۰.*۳۵۰/);
  assert.match(reply, /مجموع تقریبی/);
  assert.doesNotMatch(reply, /کارشناس|اطلاعات ندارم|متوقف/);
  assert.equal(result.nextQuestionText, questions[1].aiQuestion);
});
test('elevator and building age guidance depend on the question, never advance it', async () => {
  for (const [question, expected] of [[questions[3], /دستگاه.*نه تعداد توقف/], [questions[2], /سال ساخت را از سال جاری کم کنید/]] as const) {
    const result = await advanceQuotationTurn({ sessionId: 'help', questions: [question], answers: {}, message: 'چجوری حسابش کنم' });
    assert.deepEqual(result.updates, {});
    assert.equal(result.nextQuestionText, question.aiQuestion);
    const reply = await explainQuotationInterruption({ question, message: 'چجوری حسابش کنم', knowledge: '', select: async () => null });
    assert.match(reply, expected);
    assert.doesNotMatch(reply, /کارشناس|اطلاعات ندارم/);
  }
});
test('admin helpText has priority and blank help uses a generic type-aware guide', () => {
  assert.equal(quotationQuestionHelp({ ...questions[1], helpText: '  مساحت درج‌شده در نقشه را جمع کنید.  ' }), 'مساحت درج‌شده در نقشه را جمع کنید.');
  const generic = { title: 'تعداد ورودی‌ها', fieldName: 'entrances', required: true, order: 1, type: 'number', minVal: 1, helpText: '' };
  assert.match(quotationQuestionHelp(generic), /موارد خواسته‌شده را بشمارید.*حداقل 1/);
  assert.doesNotMatch(quotationQuestionHelp(generic), /متراژ|زیرزمین|کارشناس/);
});
test('insurance coverage questions still use knowledge, not operational helpText', async () => {
  const passage = 'این پوشش شامل مسئولیت مدیر ساختمان است.';
  const reply = await explainQuotationInterruption({ question: { ...questions[1], helpText: 'متراژ را جمع کنید.' }, message: 'درباره پوشش بیمه توضیح بده', knowledge: passage, select: async () => ({ passages: [passage] }) });
  assert.equal(reply, passage);
});
