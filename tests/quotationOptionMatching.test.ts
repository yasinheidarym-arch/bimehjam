import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQuotationOptionText,
  quotationOptionFollowup,
  resolveQuotationOptionSelection,
} from '../server/services/quotationOptionMatchingService.ts';

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
  const result = await resolveQuotationOptionSelection({ question, message: 'خونه و محل سکونته' });
  assert.equal(result.selectedOptionValue, 'مجتمع مسکونی');
  assert.equal(result.source, 'DETERMINISTIC');
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
  assert.match(quotationOptionFollowup(ageQuestion, ambiguous), /دقیقاً کدام بازه یا گزینه/);

  const unrelated = await resolveQuotationOptionSelection({
    question: ageQuestion,
    message: 'امروز هوا خوبه',
    modelSelector: async () => ({ fieldName: 'buildingAgeBand', selectedOptionId: null, selectedOptionValue: null, confidence: 0.1 }),
  });
  assert.equal(unrelated.status, 'UNRELATED');
  assert.match(quotationOptionFollowup(ageQuestion, unrelated), /تا ۵ سال ساخت.*بیش از ۲۵ سال ساخت/);
  assert.equal(normalizeQuotationOptionText('  ۲  ساله‌ '), '2 ساله');
});
