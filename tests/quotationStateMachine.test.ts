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
  const turn = conversation({}, async ({ message, currentQuestion }) => {
    const values: Record<string, { value: string; option?: string }> = {
      usage: { value: 'مجتمع مسکونی', option: 'option-1' }, area: { value: message }, age: { value: 'تا ۵ سال ساخت', option: 'option-1' }, elevators: { value: message }, guard: { value: 'بله' },
    };
    const selected = values[currentQuestion!.fieldName];
    return { status: 'VALID_ANSWER', confidence: .95, reason: 'test', relatedFieldName: null, relatedExplanation: null, clarification: null, assignments: [{ ...assignment(currentQuestion!.fieldName, message, selected.value), selectedOptionId: selected.option || null, selectedOptionValue: selected.option ? selected.value : null }] };
  });
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
test('valid answer followed by a question saves only the validated current field', async () => {
  const result = await conversation({ ...base, age: 'تا ۵ سال ساخت' })('۳ تا، بیمه چه پوشش‌هایی دارد؟');
  assert.equal(result.updates.elevators, '3');
  assert.equal(result.classification.status, 'VALID_ANSWER');
  assert.equal(result.nextQuestionText, questions[4].aiQuestion);
});
test('ambiguous and irrelevant replies clarify then offer help while preserving state', async () => {
  const turn = conversation(base, async () => ({ assignments: [] }));
  const first = await turn('فکر کنم قدیمیه');
  assert.equal(first.state.ambiguity, 'CLARIFY');
  assert.match(first.clarification!, /تا ۵ سال ساخت/);
  const second = await turn('امروز هوا خوبه');
  assert.equal(second.state.ambiguity, 'CLARIFY');
  assert.match(second.clarification!, /تا ۵ سال ساخت/);
  assert.equal(second.state.currentQuestion?.fieldName, 'age');
  assert.deepEqual(second.state.answers, base);
  assert.equal((await turn('۲ سال')).state.ambiguity, 'NONE');
});
test('explicit correction updates only the named previous field, pending question remains', async () => {
  const turn = conversation(base, async () => ({ status: 'CORRECTION', confidence: .96, reason: 'semantic correction', assignments: [assignment('age', '۱۰ سال', '۶ تا ۱۵ سال ساخت')] }));
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
  const result = await conversation({ ...base, age: 'تا ۵ سال ساخت', elevators: '2', guard: 'بله' }, async () => ({ status: 'CORRECTION', confidence: .96, reason: 'semantic correction', assignments: [assignment('elevators', '3')] }))('تعداد آسانسور اصلاح شود: 3');
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

test('completion collects contact information, shows a summary, and routes only after confirmation', () => {
  const choicePrompt = 'تماس کارشناس یا اعلام قیمت در چت؟';
  let decision = startQuotationSubmission({ sessionId: 'session', productId: 'product', productName: 'مدیر ساختمان', answers: [], existingProfile: {}, choicePrompt });
  assert.equal(decision.state.step, 'FULL_NAME');
  assert.equal(advanceQuotationSubmission(decision.state, 'آره').state.step, 'FULL_NAME');
  decision = advanceQuotationSubmission(decision.state, 'آرش رضایی');
  assert.equal(decision.state.step, 'MOBILE');
  decision = advanceQuotationSubmission(decision.state, '۰۹۱۲۱۲۳۴۵۶۷');
  assert.equal(decision.state.step, 'CITY');
  assert.equal(advanceQuotationSubmission(decision.state, 'چقدر هزینه دارد؟').state.profile.city, undefined);
  decision = advanceQuotationSubmission(decision.state, 'تهران');
  assert.equal(decision.state.step, 'CONFIRM');
  assert.equal(decision.state.status, 'AWAITING_CONFIRMATION');
  assert.equal(decision.action, 'ASK');
  assert.match(decision.replyText, /مدیر ساختمان/);
  assert.match(decision.replyText, /آرش رضایی/);
  const correction = advanceQuotationSubmission(decision.state, 'شهر اشتباه است');
  assert.equal(correction.action, 'ASK');
  assert.equal(correction.state.step, 'CONFIRM');
  decision = advanceQuotationSubmission(decision.state, 'بله، درسته');
  assert.equal(decision.action, 'ROUTE');
  if (decision.action === 'ROUTE') assert.equal(decision.route, 'CALL');
});

test('area help without configured helpText uses generic field guidance and preserves the exact pending question', async () => {
  const message = 'چجوری حسابش کنم؟';
  const result = await conversation({ usage: 'مجتمع مسکونی' }, async () => { assert.fail('help must not invoke answer model'); })(message);
  assert.deepEqual(result.updates, {});
  assert.equal(result.state.currentQuestion?.fieldName, 'area');
  assert.equal(result.state.attempts.area, undefined);
  const reply = await explainQuotationInterruption({ message, question: questions[1], knowledge: '', select: async () => { assert.fail('no article/model needed'); } });
  assert.match(reply, /مقدار عددی.*حداقل/);
  assert.doesNotMatch(reply, /کارشناس|اطلاعات ندارم|متوقف/);
  assert.equal(result.nextQuestionText, questions[1].aiQuestion);
});
test('generic question guidance is type/options-aware and never advances it', async () => {
  for (const [question, expected] of [[questions[3], /مقدار عددی.*حداقل/], [questions[2], /گزینه‌ای.*تا ۵ سال ساخت/]] as const) {
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
  assert.match(quotationQuestionHelp(generic), /مقدار عددی.*حداقل 1/);
  assert.doesNotMatch(quotationQuestionHelp(generic), /متراژ|زیرزمین|کارشناس/);
});

test('building-manager helpText is used and the same exact question survives reload', async () => {
  const amenities: QuotationTurnQuestion = {
    id: 'amenities', createdAt: '2026-01-01T00:00:09Z', order: 9,
    title: 'امکانات رفاهی ساختمان', aiQuestion: 'ساختمان چه امکانات رفاهی دارد؟',
    fieldName: 'amenities', type: 'text', required: true,
    helpText: 'مواردی مثل استخر، باشگاه، سونا و جکوزی را که در ساختمان فعال است نام ببرید.',
  };
  const initial = await advanceQuotationTurn({ sessionId: 'manager-session', questions: [amenities], answers: {}, message: 'چی شد پس' });
  assert.deepEqual(initial.updates, {});
  assert.equal(initial.currentQuestionBefore?.helpText, amenities.helpText);
  const reply = await explainQuotationInterruption({ message: 'چی شد پس', question: initial.currentQuestionBefore, knowledge: '', select: async () => null });
  assert.match(reply, /استخر.*باشگاه.*سونا.*جکوزی/);
  assert.doesNotMatch(reply, /راهنمای این سؤال:/);
  assert.doesNotMatch(reply, new RegExp(amenities.aiQuestion!));
  assert.equal(initial.nextQuestionText, amenities.aiQuestion);

  const reloaded = await advanceQuotationTurn({
    sessionId: 'manager-session', questions: [amenities], answers: initial.state.answers,
    previous: JSON.parse(JSON.stringify(initial.state)), message: 'چجوری باید جواب بدم؟',
  });
  assert.deepEqual(reloaded.updates, {});
  assert.equal(reloaded.state.currentQuestion?.fieldName, 'amenities');
  assert.equal(reloaded.nextQuestionText, amenities.aiQuestion);
});

test('unique helpText concept is mandatory and its source/question identity are auditable', async () => {
  const question: QuotationTurnQuestion = {
    id: 'unique-help', title: 'متراژ کل ساختمان', aiQuestion: 'متراژ کل چقدر است؟',
    fieldName: 'area', type: 'number', required: true, order: 1,
    helpText: 'عبارت منحصربه‌فرد: همکف و زیرزمین را نیز در مجموع طبقات حساب کنید.',
  };
  const result = await advanceQuotationTurn({
    sessionId: 'help-audit', questions: [question], answers: {}, message: 'چجوری حسابش کنم؟',
    productKnowledge: 'دانش دیگری که نباید جایگزین راهنمای سؤال شود.',
    model: async ({ grounding }) => {
      assert.equal(grounding.questionId, 'unique-help');
      assert.equal(grounding.questionText, 'متراژ کل چقدر است؟');
      assert.match(grounding.helpText || '', /عبارت منحصربه‌فرد/);
      return { status: 'QUESTION_ABOUT_FIELD', confidence: .99, reason: 'help', assignments: [] };
    },
  });
  assert.equal(result.guidance?.source, 'HELP_TEXT');
  assert.equal(result.guidance?.questionId, 'unique-help');
  assert.equal(result.guidance?.questionText, 'متراژ کل چقدر است؟');
  assert.match(result.responseText, /عبارت منحصربه‌فرد.*همکف.*زیرزمین/s);
  assert.equal(result.state.currentQuestion?.fieldName, 'area');
});

test('QUESTION_ABOUT_FIELD uses a grounded natural helpResponse without copying helpText or repeating the question', async () => {
  const question: QuotationTurnQuestion = {
    id: 'natural-help', title: 'متراژ کل ساختمان',
    aiQuestion: 'جمع کل متراژ مجموع طبقات ساختمان با احتساب طبقه همکف و منفی چقدر است؟',
    fieldName: 'area', type: 'number', required: true, order: 1,
    helpText: 'متراژ تمام طبقات شامل همکف و زیرزمین را با هم جمع کنید.',
  };
  const natural = 'متراژ تمام طبقات، شامل همکف و طبقات منفی، با هم جمع می‌شود. اگر متراژ کل را در اختیار دارید بفرمایید؛ مقدار تقریبی هم قابل قبول است.';
  const result = await advanceQuotationTurn({
    sessionId: 'natural-help', questions: [question], answers: {}, message: 'چجوری حسابش کنم؟',
    model: async () => ({ status: 'QUESTION_ABOUT_FIELD', confidence: .99, reason: 'help', assignments: [] }),
    guidanceSelector: async ({ source, sourceText, question: groundedQuestion, tone }) => {
      assert.equal(source, 'HELP_TEXT');
      assert.equal(sourceText, question.helpText);
      assert.equal(groundedQuestion.id, question.id);
      assert.match(tone, /کارشناس حرفه‌ای.*محترمانه.*صمیمی/);
      return { helpResponse: natural, passages: [], source: 'HELP_TEXT' };
    },
  });
  assert.equal(result.responseText, natural);
  assert.notEqual(result.responseText, question.helpText);
  assert.doesNotMatch(result.responseText, /راهنمای این سؤال/);
  assert.doesNotMatch(result.responseText, new RegExp(question.aiQuestion!));
  assert.match(result.responseText, /همکف.*(?:زیرزمین|طبقات منفی)/);
  assert.equal(result.state.currentQuestion?.id, question.id);
  assert.equal(result.guidance?.helpTextUsed, question.helpText);
  assert.equal(result.guidance?.helpResponse, natural);
});

test('all QUESTION_ABOUT_FIELD types reject childish or dry imperative tone', async () => {
  const fieldTypes: QuotationTurnQuestion[] = [
    { id: 'n', title: 'تعداد', aiQuestion: 'تعداد چقدر است؟', fieldName: 'n', type: 'number', required: true, order: 1, helpText: 'تعداد موجود را وارد کنید.' },
    { id: 's', title: 'نوع', aiQuestion: 'نوع را انتخاب کنید؟', fieldName: 's', type: 'select', options: ['الف', 'ب'], required: true, order: 1, helpText: 'گزینه متناسب را انتخاب کنید.' },
    { id: 'b', title: 'وضعیت', aiQuestion: 'این مورد برقرار است؟', fieldName: 'b', type: 'boolean', required: true, order: 1, helpText: 'برقرار بودن یا نبودن مورد را مشخص کنید.' },
    { id: 't', title: 'توضیحات', aiQuestion: 'چه توضیحی دارید؟', fieldName: 't', type: 'text', required: true, order: 1, helpText: 'اطلاعات مرتبط را کوتاه توضیح دهید.' },
  ];
  const forbidden = /کافیه|حالا|بفرست|همشونو|فقط این کار رو بکن|بگو ببینم/;
  for (const question of fieldTypes) {
    const result = await advanceQuotationTurn({
      sessionId: `tone-${question.id}`, questions: [question], answers: {}, message: 'چجوری جواب بدم؟',
      model: async () => ({ status: 'QUESTION_ABOUT_FIELD', confidence: .99, reason: 'help', assignments: [] }),
      guidanceSelector: async () => ({ helpResponse: 'کافیه همین رو بفرست؛ حالا بگو ببینم.', passages: [] }),
    });
    assert.doesNotMatch(result.responseText, forbidden, question.type);
    assert.match(result.responseText, /بفرمایید|اعلام کنید|در نظر بگیرید/, question.type);
    assert.doesNotMatch(result.responseText, new RegExp(question.aiQuestion!));
    assert.equal(result.state.currentQuestion?.id, question.id);
  }
});

test('building-manager count and no-coverage answers advance without validator loops', async () => {
  const form: QuotationTurnQuestion[] = [
    { id: 'count', title: 'تعداد تعهد مالی', aiQuestion: 'چند تعهد مالی می‌خواهید؟', fieldName: 'tedade_mali', type: 'select', required: true, order: 1, options: ['یک تعهد', 'دو تعهد'] },
    { id: 'extra', title: 'پوشش‌های تکمیلی', aiQuestion: 'چه پوشش تکمیلی می‌خواهید؟', fieldName: 'extra', type: 'select', required: true, order: 2, options: ['فاقد پوشش', 'حذف فرانشیز'] },
    { id: 'next', title: 'مرحله بعد', aiQuestion: 'سؤال بعدی', fieldName: 'next', type: 'number', required: true, order: 3 },
  ];
  const count = await advanceQuotationTurn({ sessionId: 'root-fix', questions: form, answers: {}, message: 'یک' });
  assert.deepEqual(count.updates, { tedade_mali: 'یک تعهد' });
  assert.equal(count.nextQuestionText, form[1].aiQuestion);
  const none = await advanceQuotationTurn({ sessionId: 'root-fix', questions: form, answers: count.state.answers, previous: count.state, message: 'پوشش تکمیلی نمی‌خواهم' });
  assert.deepEqual(none.updates, { extra: 'فاقد پوشش' });
  assert.equal(none.nextQuestionText, 'سؤال بعدی');
});

test('database order, createdAt and id deterministically rebuild queue after reload', async () => {
  const panelQuestions: QuotationTurnQuestion[] = [
    { id: 'z', createdAt: '2026-01-03T00:00:00Z', order: 2, title: 'سؤال دوم ب', aiQuestion: 'متن دوم ب', fieldName: 'secondB', type: 'number', required: true },
    { id: 'first', createdAt: '2026-01-04T00:00:00Z', order: 1, title: 'سؤال اول', aiQuestion: 'متن اول', fieldName: 'first', type: 'number', required: true },
    { id: 'a', createdAt: '2026-01-03T00:00:00Z', order: 2, title: 'سؤال دوم الف', aiQuestion: 'متن دوم الف', fieldName: 'secondA', type: 'number', required: true },
    { id: 'old', createdAt: '2026-01-02T00:00:00Z', order: 2, title: 'سؤال دوم قدیمی', aiQuestion: 'متن دوم قدیمی', fieldName: 'secondOld', type: 'number', required: true },
  ];
  let result = await advanceQuotationTurn({ sessionId: 'reload', questions: panelQuestions, answers: {}, message: '1' });
  assert.deepEqual(result.updates, { first: '1' });
  assert.equal(result.nextQuestionText, 'متن دوم قدیمی');

  // Persist answers only; deliberately corrupt the cached question to prove it
  // cannot reorder a freshly loaded database queue.
  const staleState = { ...result.state, currentQuestion: panelQuestions[0] };
  result = await advanceQuotationTurn({ sessionId: 'reload', questions: [...panelQuestions].reverse(), answers: result.state.answers, previous: staleState, message: '2' });
  assert.deepEqual(result.updates, { secondOld: '2' });
  assert.equal(result.nextQuestionText, 'متن دوم الف');
  assert.equal(result.state.answers.secondB, undefined);
});
test('insurance coverage questions still use knowledge, not operational helpText', async () => {
  const passage = 'این پوشش شامل مسئولیت مدیر ساختمان است.';
  const reply = await explainQuotationInterruption({ question: { ...questions[1], helpText: 'متراژ را جمع کنید.' }, message: 'درباره پوشش بیمه توضیح بده', knowledge: passage, select: async () => ({ passages: [passage] }) });
  assert.equal(reply, passage);
});

test('masked production 4096 transcript messages preserve grounded questionnaire state', async () => {
  const facade: QuotationTurnQuestion = {
    id: 'facade', title: 'نوع نمای ساختمان', aiQuestion: 'نوع جنس متریال نمای ساختمان چیه؟',
    fieldName: 'jenseh_nama', type: 'select', required: true, order: 4,
    options: ['سنگ', 'سیمانی / آجری', 'شیشه', 'کامپوزیت'], helpText: '',
  };
  const productPassage = 'نمای ساختمان در صورت عدم نگهداری مناسب می‌تواند باعث حادثه شود.';
  const help = await advanceQuotationTurn({
    sessionId: 'masked-production-help', questions: [facade], answers: {}, message: 'بیشتر بهم توضیح بده',
    productKnowledge: productPassage,
    model: async ({ grounding }) => {
      assert.equal(grounding.helpText, null);
      assert.equal(grounding.productKnowledge, productPassage);
      return { status: 'QUESTION_ABOUT_FIELD', confidence: .95, reason: 'راهنمای همان فیلد', relatedFieldName: 'jenseh_nama', assignments: [] };
    },
    guidanceSelector: async ({ knowledge }) => ({ helpResponse: 'نوع نما برای ارزیابی ریسک نگهداری و حادثه در نظر گرفته می‌شود.', passages: [knowledge], source: 'PRODUCT_KNOWLEDGE' }),
  });
  assert.deepEqual(help.updates, {});
  assert.equal(help.state.currentQuestion?.fieldName, 'jenseh_nama');
  assert.equal(help.guidance?.source, 'PRODUCT_KNOWLEDGE');
  assert.match(help.responseText, /نگهداری.*حادثه/);
  assert.notEqual(help.responseText, productPassage);
  assert.doesNotMatch(help.responseText, /نوع جنس متریال نمای ساختمان چیه/);

  const age = await advanceQuotationTurn({ sessionId: 'masked-production-age', questions: [questions[2]], answers: {}, message: '2 سال' });
  assert.equal(age.updates.age, 'تا ۵ سال ساخت');

  const medical: QuotationTurnQuestion = {
    id: 'medical', title: 'هزینه پزشکی هر نفر', aiQuestion: 'چقدر پوشش هزینه پزشکی می‌خواهید؟',
    fieldName: 'pezeshki', type: 'select', required: true, order: 9,
    options: ['50 میلیون تومان', '100 میلیون تومان', '200 میلیون تومان', '280 میلیون تومان'],
  };
  const outOfOptions = await advanceQuotationTurn({ sessionId: 'masked-production-money', questions: [medical], answers: {}, message: '28 میلیون تومان' });
  assert.deepEqual(outOfOptions.updates, {});
  assert.equal(outOfOptions.state.currentQuestion?.fieldName, 'pezeshki');
  assert.match(outOfOptions.responseText, /۲۸٬۰۰۰٬۰۰۰ تومان/);
});

test('money options save exact canonical value and never save a clear out-of-list amount', async () => {
  const money = {
    id: 'capital', title: 'سرمایه درخواستی (تومان)', aiQuestion: 'چه مبلغی را انتخاب می‌کنید؟',
    fieldName: 'capital', type: 'select', required: true, order: 1,
    options: ['۵۰۰ میلیون تومان', '۱ میلیارد و ۵۰۰ میلیون تومان', '۲ میلیارد تومان'],
  };
  const afterMoney = { id: 'after-money', title: 'تعداد کارکنان', aiQuestion: 'چند نفر کارمند دارید؟', fieldName: 'staff', type: 'number', required: true, order: 2 };
  const exact = await advanceQuotationTurn({ sessionId: 'money', questions: [afterMoney, money], answers: {}, message: 'یک و نیم میلیارد' });
  assert.deepEqual(exact.updates, { capital: '۱ میلیارد و ۵۰۰ میلیون تومان' });
  assert.equal(exact.nextQuestionText, afterMoney.aiQuestion);

  const outside = await advanceQuotationTurn({ sessionId: 'money', questions: [money], answers: {}, message: '800 میلیون تومان', model: async () => ({ assignments: [{ fieldName: 'capital', value: '۵۰۰ میلیون تومان', evidence: '800 میلیون تومان', confidence: 1 }] }) });
  assert.deepEqual(outside.updates, {});
  assert.equal(outside.state.currentQuestion?.fieldName, 'capital');
  assert.match(outside.clarification!, /۸۰۰٬۰۰۰٬۰۰۰ تومان.*گزینه‌های معتبر نزدیک/);
  assert.match(outside.decisions[0].reason, /800000000.*no exact real option/);

  const ambiguous = await advanceQuotationTurn({ sessionId: 'money', questions: [money], answers: {}, message: 'یک میلیارد و خورده‌ای', model: async () => ({ assignments: [{ fieldName: 'capital', value: '۱ میلیارد و ۵۰۰ میلیون تومان', evidence: 'یک میلیارد و خورده‌ای', confidence: 1 }] }) });
  assert.deepEqual(ambiguous.updates, {});
  assert.match(ambiguous.clarification!, /مبلغ را دقیق‌تر.*واحد/);
});
