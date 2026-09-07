import test from 'node:test';
import assert from 'node:assert/strict';
import { productDetectionAliases, productDetectionTerms } from '../server/services/productDetectionAliases';

test('product aliases are loaded only from editable product metadata', () => {
  const description = 'محصول فعال است.\nنام‌های جایگزین برای تشخیص AI: نام اول | نام دوم | نام اول';
  assert.deepEqual(productDetectionAliases(description), ['نام اول', 'نام دوم']);
  assert.deepEqual(productDetectionTerms('نام اصلی', description), ['نام اصلی', 'نام اول', 'نام دوم']);
});

test('ordinary product descriptions do not accidentally become aliases', () => {
  assert.deepEqual(productDetectionAliases('توضیح عمومی محصول و شرایط آن'), []);
});

