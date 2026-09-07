import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQuotationOptionText,
  resolveQuotationOptionSelection,
} from '../server/services/quotationOptionMatchingService.ts';
import { isQuotationMoneyQuestion, parseQuotationMoney, quotationMoneyMismatchReply, resolveQuotationMoney } from '../server/services/quotationMoney.ts';

const ageQuestion = {
  title: 'سن ساختمان', aiQuestion: 'ساختمان مورد بیمه چند سال ساخته؟', fieldName: 'buildingAgeBand',
  type: 'select', required: true, order: 1,
  options: JSON.stringify(['تا ۵ سال ساخت', '۶ تا ۱۵ سال ساخت', '۱۶ تا ۲۰ سال ساخت', '۲۱ تا ۲۵ سال ساخت', 'بیش از ۲۵ سال ساخت']),
};

test('2, Persian 2 and colloquial two years map to the canonical first age band', async () => {
  for (const message of ['2', '۲', '۲ سال', 'دو ساله']) {
    const result = await resolveQuotationOptionSelection({ question: ageQuestion, message });
    assert.deepEqual({
      fieldName: result.fieldName,
      selectedOptionId: result.selectedOptionId,
      selectedOptionValue: result.selectedOptionValue,
      status: result.status,
    }, {
      fieldName: 'buildingAgeBand',
      selectedOptionId: 'option-1',
      selectedOptionValue: 'تا ۵ سال ساخت',
      status: 'MATCHED',
    }, message);
  }
});

test('colloquial answer is semantically restricted to a real canonical option', async () => {
  const question = { ...ageQuestion, fieldName: 'usage', options: ['مجتمع مسکونی', 'مجتمع تجاری'] };
  const result = await resolveQuotationOptionSelection({ question, message: 'خونه و محل سکونته', modelSelector: async () => ({
    fieldName: 'usage', selectedOptionId: 'option-1', selectedOptionValue: 'مجتمع مسکونی', confidence: .96,
  }) });
  assert.equal(result.selectedOptionValue, 'مجتمع مسکونی');
  assert.equal(result.source, 'AI');
});

test('AI structured selection is accepted only with exact field, id, value and confidence', async () => {
  const result = await resolveQuotationOptionSelection({
    question: ageQuestion,
    message: 'ساختمان نوساز محسوب نمی‌شود',
    modelSelector: async () => ({
      fieldName: 'buildingAgeBand', selectedOptionId: 'option-2',
      selectedOptionValue: '۶ تا ۱۵ سال ساخت', confidence: 0.91,
    }),
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.selectedOptionValue, '۶ تا ۱۵ سال ساخت');

  const fabricated = await resolveQuotationOptionSelection({
    question: ageQuestion,
    message: 'پاسخ ساختگی',
    modelSelector: async () => ({
      fieldName: 'buildingAgeBand', selectedOptionId: 'option-99',
      selectedOptionValue: 'گزینه ساخته‌شده', confidence: 0.99,
    }),
  });
  assert.notEqual(fabricated.status, 'MATCHED');
  assert.equal(fabricated.selectedOptionValue, null);
});

test('ambiguous answer asks one short clarification and unrelated answer lists real options', async () => {
  const ambiguous = await resolveQuotationOptionSelection({
    question: ageQuestion,
    message: 'فکر کنم قدیمیه',
    modelSelector: async () => ({ fieldName: 'buildingAgeBand', selectedOptionId: null, selectedOptionValue: null, confidence: 0.55 }),
  });
  assert.equal(ambiguous.status, 'AMBIGUOUS');

  const unrelated = await resolveQuotationOptionSelection({
    question: ageQuestion,
    message: 'امروز هوا خوبه',
    modelSelector: async () => ({ fieldName: 'buildingAgeBand', selectedOptionId: null, selectedOptionValue: null, confidence: 0.1 }),
  });
  assert.equal(unrelated.status, 'UNRELATED');
  assert.equal(normalizeQuotationOptionText('  ۲  ساله‌ '), '2 ساله');
});

const moneyQuestion = {
  title: 'سقف سرمایه درخواستی (تومان)', fieldName: 'capital', type: 'select', required: true, order: 1,
  options: ['۵۰۰ میلیون تومان', '۱ میلیارد و ۵۰۰ میلیون تومان', '۲ میلیارد تومان'],
};

test('Persian and English conversational money is normalized to integer toman', () => {
  assert.equal(parseQuotationMoney('۱ میلیارد و ۵۰۰ میلیون تومان'), 1_500_000_000);
  assert.equal(parseQuotationMoney('1 میلیارد و 500 میلیون تومان'), 1_500_000_000);
  assert.equal(parseQuotationMoney('یک و نیم میلیارد'), 1_500_000_000);
  assert.equal(parseQuotationMoney('۵۰۰ میلیون تومان'), 500_000_000);
  assert.equal(parseQuotationMoney('500 تومن', true), 500_000_000);
});

test('money equal to a real option is selected canonically', async () => {
  for (const message of ['۱ میلیارد و ۵۰۰ میلیون تومان', 'یک و نیم میلیارد', '1.5 میلیارد']) {
    const result = await resolveQuotationOptionSelection({ question: moneyQuestion, message });
    assert.equal(result.status, 'MATCHED', message);
    assert.equal(result.selectedOptionValue, '۱ میلیارد و ۵۰۰ میلیون تومان', message);
  }
  const colloquial = await resolveQuotationOptionSelection({ question: moneyQuestion, message: '500 تومن' });
  assert.equal(colloquial.selectedOptionValue, '۵۰۰ میلیون تومان');
});

test('clear money outside real options is confirmed and gets nearby valid choices', () => {
  const decision = resolveQuotationMoney(moneyQuestion, '۸۰۰ میلیون تومان');
  assert.equal(decision?.status, 'OUT_OF_OPTIONS');
  assert.equal(decision?.amountToman, 800_000_000);
  const reply = quotationMoneyMismatchReply(decision!);
  assert.match(reply, /۸۰۰٬۰۰۰٬۰۰۰ تومان.*جزو گزینه/);
  assert.match(reply, /۵۰۰ میلیون تومان/);
  assert.doesNotMatch(reply, /منظورتان چیست/);
});

test('financial commitment count is not a money question and one maps to one commitment', async () => {
  const question = {
    title: 'تعداد تعهد مالی', aiQuestion: 'چند تعهد مالی می‌خواهید؟', fieldName: 'tedade_mali',
    type: 'select', required: true, order: 1,
    options: ['یک تعهد', 'دو تعهد', 'سه تعهد'],
  };
  assert.equal(isQuotationMoneyQuestion(question), false);
  const result = await resolveQuotationOptionSelection({ question, message: 'یک' });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.selectedOptionValue, 'یک تعهد');
});

test('declining optional coverage maps only to the real canonical no-coverage option', async () => {
  const question = {
    title: 'پوشش‌های تکمیلی', fieldName: 'extra', type: 'select', required: true, order: 1,
    options: ['فاقد پوشش', 'غرامت و نقص عضو', 'حذف فرانشیز'],
  };
  for (const message of ['پوشش تکمیلی نمی‌خواهم', 'نیاز ندارم', 'هیچی', 'بدون پوشش']) {
    const result = await resolveQuotationOptionSelection({ question, message });
    assert.equal(result.status, 'MATCHED', message);
    assert.equal(result.selectedOptionValue, 'فاقد پوشش', message);
  }
});
