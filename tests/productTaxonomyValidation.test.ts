import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectConfirmedProductCandidate,
  validateProductTaxonomyAssignment,
} from '../server/services/productTaxonomyValidation.ts';

function taxonomyDb(input: { categoryExists?: boolean; subCategory?: { id: string; categoryId: string } | null }) {
  return {
    insuranceCategory: {
      async findUnique() {
        return input.categoryExists === false ? null : { id: 'category-1' };
      },
    },
    insuranceSubCategory: {
      async findUnique() {
        return input.subCategory === undefined
          ? { id: 'subcategory-1', categoryId: 'category-1' }
          : input.subCategory;
      },
    },
  };
}

test('backend rejects product creation without a subcategory', async () => {
  const result = await validateProductTaxonomyAssignment(taxonomyDb({}), 'category-1', null);
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /زیر‌دسته/);
});

test('backend accepts a product with a valid subcategory belonging to its category', async () => {
  const result = await validateProductTaxonomyAssignment(taxonomyDb({}), 'category-1', 'subcategory-1');
  assert.deepEqual(result, { valid: true, categoryId: 'category-1', subCategoryId: 'subcategory-1' });
});

test('backend rejects a subcategory from another category', async () => {
  const result = await validateProductTaxonomyAssignment(
    taxonomyDb({ subCategory: { id: 'subcategory-2', categoryId: 'category-2' } }),
    'category-1',
    'subcategory-2',
  );
  assert.equal(result.valid, false);
});

test('unconfirmed products can never become a product knowledge source', () => {
  const products = [{ id: 'product-1', subCategoryId: 'subcategory-1', aiKnowledgeArticle: 'دانش محصول' }];
  assert.equal(selectConfirmedProductCandidate(null, products), null);
  assert.equal(selectConfirmedProductCandidate(undefined, products), null);
});

test('only the explicitly confirmed product with a subcategory is selected', () => {
  const products = [
    { id: 'product-1', subCategoryId: 'subcategory-1' },
    { id: 'product-2', subCategoryId: 'subcategory-2' },
  ];
  assert.equal(selectConfirmedProductCandidate('product-2', products)?.id, 'product-2');
  assert.equal(selectConfirmedProductCandidate('missing', products), null);
});

test('legacy product without a subcategory is blocked even when its id is confirmed', () => {
  assert.equal(selectConfirmedProductCandidate('legacy', [{ id: 'legacy', subCategoryId: null }]), null);
});
