import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCanonicalProductName,
  findCanonicalProductConflict,
  normalizeProductIdentity,
  PRODUCT_ALREADY_EXISTS_MESSAGE,
} from '../shared/productCanonicalIdentity.ts';

const existing = {
  id: 'product-1',
  name: 'بیمه مسئولیت مدیران ساختمان',
  slug: 'building-managers',
  subCategoryId: 'subcategory-1',
  aliases: ['مسئولیت مدیر ساختمان', 'بیمه هیئت مدیره ساختمان'],
  status: 'ACTIVE',
};

test('creating the same canonical product is rejected', () => {
  const conflict = findCanonicalProductConflict({ ...existing, id: undefined }, [existing]);
  assert.equal(conflict?.existingProduct.id, existing.id);
  assert.equal(conflict?.reason, 'SUBCATEGORY_OCCUPIED');
  assert.equal(PRODUCT_ALREADY_EXISTS_MESSAGE, 'این محصول قبلاً تعریف شده است؛ اطلاعات آن را از بخش ویرایش همان محصول تغییر دهید.');
});

test('normalized Persian and Arabic name variants resolve to the same product', () => {
  assert.equal(normalizeProductIdentity('  بیمه‌ مسئوليت مديران ساختمان! '), normalizeProductIdentity(existing.name));
  const conflict = findCanonicalProductConflict({
    name: 'بیمه‌ مسئوليت مديران ساختمان!',
    slug: 'another-slug',
    subCategoryId: 'subcategory-2',
    status: 'ACTIVE',
  }, [existing]);
  assert.equal(conflict?.reason, 'NORMALIZED_NAME');
});

test('an alias owned by another active product is rejected', () => {
  const conflict = findCanonicalProductConflict({
    name: 'عنوان تازه',
    slug: 'new-title',
    subCategoryId: 'subcategory-2',
    aliases: ['مسئولیت مدیر ساختمان'],
    status: 'ACTIVE',
  }, [existing]);
  assert.equal(conflict?.reason, 'ALIAS');
  assert.equal(conflict?.existingProduct.id, existing.id);
});

test('a genuinely different product in a free subcategory is allowed', () => {
  const conflict = findCanonicalProductConflict({
    name: 'بیمه مسئولیت آسانسور',
    slug: 'elevator-liability',
    subCategoryId: 'subcategory-2',
    aliases: ['پوشش مسئولیت آسانسور'],
    status: 'ACTIVE',
  }, [existing]);
  assert.equal(conflict, null);
});

test('a second active product in the same subcategory is rejected', () => {
  const conflict = findCanonicalProductConflict({
    name: 'محصول متفاوت',
    slug: 'different-product',
    subCategoryId: existing.subCategoryId,
    status: 'ACTIVE',
  }, [existing]);
  assert.equal(conflict?.reason, 'SUBCATEGORY_OCCUPIED');
});

test('editing the canonical product itself is allowed', () => {
  const conflict = findCanonicalProductConflict({
    ...existing,
    aliases: [...existing.aliases, 'مدیر ساختمان'],
  }, [existing], existing.id);
  assert.equal(conflict, null);
});

test('editing knowledge on the existing product never creates a duplicate', () => {
  const conflict = findCanonicalProductConflict(existing, [existing], existing.id);
  assert.equal(conflict, null);
});

test('moving a product to an occupied subcategory is rejected', () => {
  const movingProduct = { id: 'product-2', name: 'محصول دوم', slug: 'product-2', subCategoryId: 'subcategory-2', status: 'ACTIVE' };
  const conflict = findCanonicalProductConflict(
    { ...movingProduct, subCategoryId: existing.subCategoryId },
    [existing, movingProduct],
    movingProduct.id,
  );
  assert.equal(conflict?.reason, 'SUBCATEGORY_OCCUPIED');
});

test('editing one record in an already-conflicted subcategory remains blocked', () => {
  const duplicate = {
    id: 'product-duplicate',
    name: 'محصول نامشخص',
    slug: 'unknown-product',
    subCategoryId: existing.subCategoryId,
    status: 'ACTIVE',
  };
  const conflict = findCanonicalProductConflict(existing, [existing, duplicate], existing.id);
  assert.equal(conflict?.reason, 'SUBCATEGORY_OCCUPIED');
});

test('canonical name is generated centrally from category and subcategory', () => {
  assert.equal(buildCanonicalProductName(' مسئولیت ', ' مدیران   ساختمان '), 'مسئولیت — مدیران ساختمان');
});

test('a duplicate slug is rejected even when the display names differ', () => {
  const conflict = findCanonicalProductConflict({
    name: 'محصول دیگر',
    slug: 'BUILDING-MANAGERS',
    subCategoryId: 'subcategory-2',
    status: 'ACTIVE',
  }, [existing]);
  assert.equal(conflict?.reason, 'SLUG');
});
