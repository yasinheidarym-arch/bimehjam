export const CURRENT_PAGE_PRODUCT_SUGGESTION_KEY = 'currentPageProductSuggestion';

export type CurrentPageProductSuggestionState = {
  status: 'AWAITING_CONFIRMATION' | 'ACCEPTED' | 'REJECTED';
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  currentPageUrl: string;
};

function normalize(value: string): string {
  return String(value || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .trim()
    .toLowerCase();
}

export function messageRequestsMainCategory(message: string, categoryName: string): boolean {
  const value = normalize(message);
  const categoryTokens = normalize(categoryName)
    .split(/[\s،,؛:()\-_/|]+/)
    .filter((token) => token.length >= 3 && !['بیمه', 'بیمهها', 'اصلی'].includes(token));
  const categoryMentioned = categoryTokens.some((token) => value.includes(token));
  const purchaseRequested = /می\s*(خوام|خواهم)|نیاز\s*دارم|قیمت|استعلام|خرید/.test(value);
  return categoryMentioned && purchaseRequested;
}

export function shouldOfferCurrentPageProductSuggestion(input: {
  message: string;
  matchedCategoryId: string | null;
  matchedCategoryName: string | null;
  productSelectionRequired: boolean;
  currentPageProduct: { id: string; categoryId: string | null } | null;
  previousSuggestion: CurrentPageProductSuggestionState | null;
}): boolean {
  if (!input.productSelectionRequired || !input.matchedCategoryId || !input.matchedCategoryName) return false;
  if (!input.currentPageProduct || input.currentPageProduct.categoryId !== input.matchedCategoryId) return false;
  if (
    input.previousSuggestion?.status === 'REJECTED' &&
    input.previousSuggestion.productId === input.currentPageProduct.id
  ) return false;
  return messageRequestsMainCategory(input.message, input.matchedCategoryName);
}

export function isCurrentPageProductSuggestionAccepted(message: string): boolean {
  const value = normalize(message);
  return /^(بله|آره|اره|درسته|درست است|همونه|همان|همین|اوکی|باشه|حتما|حتماً)(?:\s|[،,.!؟?]|$)/.test(value);
}

export function isCurrentPageProductSuggestionRejected(message: string): boolean {
  const value = normalize(message);
  return /^(نه|خیر|نخیر)(?:\s|[،,.!؟?]|$)|منظورم.*نیست|این.*نمی\s*(خوام|خواهم)|محصول.*دیگر/.test(value);
}

export function currentPageProductSuggestionReply(productName: string): string {
  return `منظورتان ${productName} است؟`;
}

export function categoryProductClarificationReply(categoryName: string): string {
  return `کدام نوع ${categoryName} مدنظرتان است؟`;
}

export function readCurrentPageProductSuggestion(value: unknown): CurrentPageProductSuggestionState | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!['AWAITING_CONFIRMATION', 'ACCEPTED', 'REJECTED'].includes(String(item.status))) return null;
  for (const key of ['productId', 'productName', 'categoryId', 'categoryName', 'currentPageUrl']) {
    if (typeof item[key] !== 'string' || !String(item[key]).trim()) return null;
  }
  return item as CurrentPageProductSuggestionState;
}
