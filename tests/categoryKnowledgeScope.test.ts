import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryKnowledgeScope,
  composeScopedKnowledge,
  resolveGoftinoCategoryId,
} from '../server/services/categoryKnowledgeScope.ts';

const categories = [
  { id: 'responsibility-id', slug: 'responsibility', name: 'مسئولیت' },
  { id: 'vehicle-id', slug: 'vehicle', name: 'خودرو' },
];

test('Goftino responsibility topic resolves by stable category slug to the category id', () => {
  assert.equal(resolveGoftinoCategoryId(categories, 'بیمه مسئولیت'), 'responsibility-id');
});

test('unknown Goftino topic resolves no category instead of guessing', () => {
  assert.equal(resolveGoftinoCategoryId(categories, 'موضوع نامشخص'), null);
});

test('category knowledge scope is stable and id-based', () => {
  assert.equal(categoryKnowledgeScope('responsibility-id'), 'CATEGORY_KNOWLEDGE:responsibility-id');
});

test('category knowledge is used before product knowledge and product is marked as the override', () => {
  const result = composeScopedKnowledge(['دانش مسئولیت'], 'دانش مدیران ساختمان', ['دانش عمومی']);
  assert.deepEqual(result.sections, ['دانش عمومی', 'دانش مسئولیت', 'دانش مدیران ساختمان']);
  assert.equal(result.productOverridesCategory, true);
});

test('category context remains usable before a product is confirmed', () => {
  const result = composeScopedKnowledge(['دانش معتبر دسته مسئولیت'], null, ['دانش عمومی']);
  assert.deepEqual(result.sections, ['دانش عمومی', 'دانش معتبر دسته مسئولیت']);
  assert.equal(result.productOverridesCategory, false);
  assert.equal(result.hasRelevantKnowledge, true);
});

test('missing category and product content requires clarification instead of a guessed answer', () => {
  assert.equal(composeScopedKnowledge([], '').hasRelevantKnowledge, false);
});
