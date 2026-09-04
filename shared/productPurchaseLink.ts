export const PURCHASE_LINK_METADATA_KEY = 'purchaseLinkProductId';
export const PURCHASE_LINK_RULE_ID = 'system-purchase-link-before-quotation';
export const PURCHASE_LINK_RULE_CATEGORY = 'SYSTEM_PURCHASE_LINK_BEFORE_QUOTATION';
export const PURCHASE_LINK_RULE_TITLE = 'پیشنهاد لینک خرید پیش از شروع استعلام';
export const LEGACY_QUOTATION_RULE_TITLE = 'استعلام قیمت آنلاین، ارجاع به کارشناس و پاسخ کوتاه و انسانی';
export const PURCHASE_LINK_RULE_DIRECTIVE = `شرط: محصول با اطمینان مشخص شده، intent خرید/قیمت است و purchaseUrl معتبر دارد.
رفتار: عبارت‌های «می‌خوام»، «می‌خواهم»، «نیاز دارم»، «می‌خواهم بخرم» و درخواست قیمت برای محصول مشخص، قصد خرید/استعلام هستند. پیش از هر سؤال quotation، لینک خرید/استعلام آنلاین همان محصول را فقط یک‌بار پیشنهاد بده و تا انتخاب مشتری برای «استعلام دقیق» سؤال استعلام نپرس. اگر URL خالی است، سؤال‌های استعلام مستقیماً و دقیقاً به ترتیب backend آغاز شوند. درخواست صریح مجدد لینک باید همان لینک را دوباره نمایش دهد. این قانون بر «Ask Quotation Questions» اولویت دارد و ترتیب قطعی را backend تعیین می‌کند.`;
export const PURCHASE_LINK_RULE_SORT_ORDER = 0;

export function normalizeProductPurchaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isValidOptionalProductPurchaseUrl(value: unknown): boolean {
  return typeof value !== 'string' || !value.trim() || normalizeProductPurchaseUrl(value) !== null;
}

export function isDirectQuotationWorkflowRequest(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  return [
    /استعلام\s*(دقیق|کامل)/,
    /(خودتان|خودتون|شما|همینجا|همین جا)\s*(انجام|پیگیری|استعلام)/,
    /(لینک|خرید آنلاین|آنلاین)\s*(را|رو)?\s*(نمی\s*خواهم|نمیخوام|نمی خواهم|نمی‌خواهم)/,
    /(سؤال|سوال).*(بپرس|شروع)/,
  ].some((pattern) => pattern.test(normalized));
}

export function isProductPurchaseIntent(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  return [
    /می\s*(خوام|خواهم|خواهم بخرم)/,
    /نیاز\s*دارم/,
    /می\s*خوام\s*بخرم/,
    /قصد\s*(خرید|بیمه کردن)/,
  ].some((pattern) => pattern.test(normalized));
}

export function isExplicitProductPurchaseLinkRequest(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  return /(لینک).*(بفرست|ارسال|نمایش|بده|می\s*خوام|می\s*خواهم)|((بفرست|ارسال|نمایش|بده).*(لینک))/.test(normalized);
}

export function shouldOfferProductPurchaseLink(input: {
  intent: string;
  productId?: string | null;
  purchaseUrl?: string | null;
  offeredProductIds?: Iterable<string>;
  message: string;
}): boolean {
  if (!input.productId) return false;
  if (!normalizeProductPurchaseUrl(input.purchaseUrl)) return false;
  if (isDirectQuotationWorkflowRequest(input.message)) return false;
  if (isExplicitProductPurchaseLinkRequest(input.message)) return true;
  if (input.intent !== 'Insurance Quotation') return false;
  return !new Set(input.offeredProductIds || []).has(input.productId);
}

export function shouldWaitForProductPurchaseDecision(input: {
  productId?: string | null;
  purchaseUrl?: string | null;
  offeredProductIds?: Iterable<string>;
  quotationWorkflowActive: boolean;
  message: string;
}): boolean {
  if (!input.productId || !normalizeProductPurchaseUrl(input.purchaseUrl)) return false;
  if (
    input.quotationWorkflowActive ||
    isDirectQuotationWorkflowRequest(input.message) ||
    isExplicitProductPurchaseLinkRequest(input.message)
  ) return false;
  return new Set(input.offeredProductIds || []).has(input.productId);
}

export function purchaseLinkAwaitingState(productId: string) {
  return { status: 'AWAITING_CUSTOMER_CHOICE', productId } as const;
}

export function purchaseLinkQuotationSelectedState(productId: string) {
  return { status: 'DETAILED_QUOTATION_SELECTED', productId } as const;
}

export function productPurchaseLinkReply(purchaseUrl: string): string {
  const safeUrl = normalizeProductPurchaseUrl(purchaseUrl);
  if (!safeUrl) throw new Error('A valid http/https product purchase URL is required.');

  return `می‌توانید با لینک زیر خودتان استعلام قیمت انجام دهید:\n${safeUrl}\nاگر می‌خواهید ما برایتان قیمت بگیریم و مشاوره بدهیم، اعلام کنید.`;
}

export function purchaseLinkDecisionLogSummary(productName: string): string {
  return `[قانون قطعی]: ${PURCHASE_LINK_RULE_TITLE} | [محصول]: ${productName}`;
}

export function offeredPurchaseLinkProductIds(
  messages: Array<{ metadata?: string | null }>,
): string[] {
  const productIds = new Set<string>();
  for (const message of messages) {
    if (!message.metadata) continue;
    try {
      const metadata: unknown = JSON.parse(message.metadata);
      if (
        metadata &&
        typeof metadata === 'object' &&
        typeof (metadata as Record<string, unknown>)[PURCHASE_LINK_METADATA_KEY] === 'string'
      ) {
        productIds.add((metadata as Record<string, string>)[PURCHASE_LINK_METADATA_KEY]);
      }
    } catch {
      // Ignore malformed legacy metadata; it must not block the conversation.
    }
  }
  return [...productIds];
}
