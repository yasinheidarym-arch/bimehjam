export const PURCHASE_LINK_METADATA_KEY = 'purchaseLinkProductId';
export const PURCHASE_LINK_RULE_ID = 'system-purchase-link-before-quotation';
export const PURCHASE_LINK_RULE_CATEGORY = 'SYSTEM_PURCHASE_LINK_BEFORE_QUOTATION';
export const PURCHASE_LINK_RULE_TITLE = 'پیشنهاد لینک خرید پیش از شروع استعلام';
export const LEGACY_QUOTATION_RULE_TITLE = 'استعلام قیمت آنلاین، ارجاع به کارشناس و پاسخ کوتاه و انسانی';
export const PURCHASE_LINK_RULE_DIRECTIVE = `شرط: محصول با اطمینان مشخص شده، intent خرید/قیمت است و purchaseUrl معتبر دارد.
رفتار: پیش از هر سؤال quotation، لینک خرید/استعلام آنلاین همان محصول را فقط یک‌بار پیشنهاد بده و تا انتخاب مشتری برای «استعلام دقیق» سؤال استعلام نپرس. اگر URL خالی است، سؤال‌های استعلام مستقیماً و دقیقاً به ترتیب backend آغاز شوند. این قانون بر «Ask Quotation Questions» اولویت دارد و ترتیب قطعی را backend تعیین می‌کند.`;
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
    /(خودتان|خودتون|همینجا|همین جا)\s*(انجام|پیگیری|استعلام)/,
    /(لینک|خرید آنلاین|آنلاین)\s*(را|رو)?\s*(نمی\s*خواهم|نمیخوام|نمی خواهم|نمی‌خواهم)/,
    /(سؤال|سوال).*(بپرس|شروع)/,
  ].some((pattern) => pattern.test(normalized));
}

export function shouldOfferProductPurchaseLink(input: {
  intent: string;
  productId?: string | null;
  purchaseUrl?: string | null;
  offeredProductIds?: Iterable<string>;
  message: string;
}): boolean {
  if (input.intent !== 'Insurance Quotation' || !input.productId) return false;
  if (!normalizeProductPurchaseUrl(input.purchaseUrl)) return false;
  if (isDirectQuotationWorkflowRequest(input.message)) return false;
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
  if (input.quotationWorkflowActive || isDirectQuotationWorkflowRequest(input.message)) return false;
  return new Set(input.offeredProductIds || []).has(input.productId);
}

export function productPurchaseLinkReply(purchaseUrl: string): string {
  const safeUrl = normalizeProductPurchaseUrl(purchaseUrl);
  if (!safeUrl) throw new Error('A valid http/https product purchase URL is required.');

  return `می‌توانید قیمت این بیمه را آنلاین ببینید و در صورت تمایل خرید کنید:\n${safeUrl}\nاگر ترجیح می‌دهید استعلام دقیق‌تری برایتان آماده کنیم، بگویید “استعلام دقیق می‌خواهم”.`;
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
