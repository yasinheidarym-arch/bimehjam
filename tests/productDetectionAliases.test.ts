import test from 'node:test';
import assert from 'node:assert/strict';
import { productDescriptionWithoutAliases, productDetectionAliases, productDetectionTerms, uniqueProductDetectionMatch, withProductDetectionAliases } from '../server/services/productDetectionAliases';
import { applyProductIntentClassification } from '../shared/productIntentRouting';

test('product aliases are loaded only from editable product metadata', () => {
  const description = 'محصول فعال است.\nنام‌های جایگزین برای تشخیص AI: نام اول | نام دوم | نام اول';
  assert.deepEqual(productDetectionAliases(description), ['نام اول', 'نام دوم']);
  assert.deepEqual(productDetectionTerms('نام اصلی', description), ['نام اصلی', 'نام اول', 'نام دوم']);
});

test('ordinary product descriptions do not accidentally become aliases', () => {
  assert.deepEqual(productDetectionAliases('توضیح عمومی محصول و شرایط آن'), []);
});

test('administrator aliases map one business concept without a redundant confirmation', () => {
  const description = withProductDetectionAliases('توضیح محصول', [
    'احداث ساختمان',
    'کارگرهای پروژه',
    'مسئولیت کارفرما در قبال کارکنان پروژه ساختمانی',
  ]);
  const products = [
    { id: 'construction-employer', name: 'بیمه مسئولیت کارفرما', description },
    { id: 'building-manager', name: 'بیمه مسئولیت مدیر ساختمان', description: 'مدیریت ساختمان بهره‌برداری‌شده' },
  ];
  const matched = uniqueProductDetectionMatch('برای کارگرهای پروژه بیمه میخوام', products);
  assert.equal(matched?.id, 'construction-employer');
  const routed = applyProductIntentClassification({
    classification: {
      decision: 'SELECT_PRODUCT', selectedProductId: matched!.id, confidence: 1,
      explicitCorrection: false, confirmation: 'EXPLICIT', intentSummary: matched!.name,
      reason: 'administrator alias', clarificationQuestion: null,
    },
    candidates: products,
    previous: null,
  });
  assert.equal(routed.state.status, 'CONFIRMED');
  assert.equal(routed.clarificationQuestion, null);
  assert.equal(uniqueProductDetectionMatch('بیمه احداث ساختمان لازم دارم', products)?.id, 'construction-employer');
});

test('editing aliases preserves ordinary product description and changes matching immediately', () => {
  const stored = withProductDetectionAliases('شرح اصلی محصول', 'نام قدیم، نام تازه');
  assert.match(stored, /^شرح اصلی محصول/m);
  assert.deepEqual(productDetectionAliases(stored), ['نام قدیم', 'نام تازه']);
  assert.equal(productDescriptionWithoutAliases(stored), 'شرح اصلی محصول');
  const updated = withProductDetectionAliases(stored, 'عنوان مدیریتی جدید');
  assert.deepEqual(productDetectionAliases(updated), ['عنوان مدیریتی جدید']);
  assert.match(updated, /^شرح اصلی محصول/m);
});
