import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryProductClarificationReply,
  currentPageProductSuggestionReply,
  isCurrentPageProductSuggestionAccepted,
  isCurrentPageProductSuggestionRejected,
  shouldOfferCurrentPageProductSuggestion,
} from '../shared/currentPageProductSuggestion.ts';

const pageProduct = { id: 'building-managers', categoryId: 'responsibility' };

test('responsibility category request offers the active current-page product without selecting it', () => {
  assert.equal(shouldOfferCurrentPageProductSuggestion({
    message: 'بیمه مسئولیت می‌خوام',
    matchedCategoryId: 'responsibility',
    matchedCategoryName: 'مسئولیت',
    productSelectionRequired: true,
    currentPageProduct: pageProduct,
    previousSuggestion: null,
  }), true);
  assert.equal(
    currentPageProductSuggestionReply('بیمه مسئولیت مدیران ساختمان'),
    'منظورتان بیمه مسئولیت مدیران ساختمان است؟',
  );
  assert.equal(isCurrentPageProductSuggestionAccepted('بله، همونه'), true);
});

test('rejecting the page product asks for the category subtype and does not offer it again', () => {
  assert.equal(isCurrentPageProductSuggestionRejected('نه، منظورم این نیست'), true);
  assert.equal(categoryProductClarificationReply('بیمه مسئولیت'), 'کدام نوع بیمه مسئولیت مدنظرتان است؟');
  assert.equal(shouldOfferCurrentPageProductSuggestion({
    message: 'بیمه مسئولیت می‌خوام',
    matchedCategoryId: 'responsibility',
    matchedCategoryName: 'مسئولیت',
    productSelectionRequired: true,
    currentPageProduct: pageProduct,
    previousSuggestion: {
      status: 'REJECTED',
      productId: pageProduct.id,
      productName: 'بیمه مسئولیت مدیران ساختمان',
      categoryId: 'responsibility',
      categoryName: 'مسئولیت',
      currentPageUrl: 'https://bimejam.com/liability-insurance/building-managers',
    },
  }), false);
});

test('a current-page product from another category is never suggested', () => {
  assert.equal(shouldOfferCurrentPageProductSuggestion({
    message: 'بیمه آتش‌سوزی می‌خوام',
    matchedCategoryId: 'fire',
    matchedCategoryName: 'آتش‌سوزی',
    productSelectionRequired: true,
    currentPageProduct: pageProduct,
    previousSuggestion: null,
  }), false);
});
