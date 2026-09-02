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
  const result = composeScopedKnowledge(['دانش مسئولیت'], 'دانش مدیران ساختمان');
  assert.deepEqual(result.sections, ['دانش مسئولیت', 'دانش مدیران ساختمان']);
  assert.equal(result.productOverridesCategory, true);
});

test('missing category and product content requires clarification instead of a guessed answer', () => {
  assert.equal(composeScopedKnowledge([], '').hasRelevantKnowledge, false);
});
