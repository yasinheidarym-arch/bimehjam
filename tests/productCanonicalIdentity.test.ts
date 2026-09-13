import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
  assert.equal(conflict?.reason, 'NORMALIZED_NAME');
  assert.equal(PRODUCT_ALREADY_EXISTS_MESSAGE, 'این محصول قبلاً تعریف شده است؛ اطلاعات آن را از بخش ویرایش همان محصول تغییر دهید.');
});

test('normalized Persian and Arabic name variants resolve to the same product', () => {
  assert.equal(normalizeProductIdentity('  بیمه‌ مسئوليت مديران ساختمان! '), normalizeProductIdentity(existing.name));
  const conflict = findCanonicalProductConflict({
    name: 'بیمه‌ مسئوليت مديران ساختمان!',
    slug: 'another-slug',
    subCategoryId: 'subcategory-1',
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

test('a genuinely different product in the same subcategory is allowed', () => {
  const conflict = findCanonicalProductConflict({
    name: 'بیمه مسئولیت آسانسور',
    slug: 'elevator-liability',
    subCategoryId: existing.subCategoryId,
    aliases: ['پوشش مسئولیت آسانسور'],
    status: 'ACTIVE',
  }, [existing]);
  assert.equal(conflict, null);
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

test('a duplicate slug is rejected even when the display names differ', () => {
  const conflict = findCanonicalProductConflict({
    name: 'محصول دیگر',
    slug: 'BUILDING-MANAGERS',
    subCategoryId: 'subcategory-2',
    status: 'ACTIVE',
  }, [existing]);
  assert.equal(conflict?.reason, 'SLUG');
});
