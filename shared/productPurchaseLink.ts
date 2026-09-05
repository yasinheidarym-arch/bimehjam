export const PURCHASE_LINK_METADATA_KEY = 'purchaseLinkProductId';
export const PURCHASE_LINK_RULE_ID = 'system-purchase-link-before-quotation';
export const PURCHASE_LINK_RULE_CATEGORY = 'SYSTEM_QUOTATION_PURCHASE_ROUTING';
export const PURCHASE_LINK_RULE_TITLE = 'هدایت استعلام قیمت و خرید آنلاین';
export const LEGACY_QUOTATION_RULE_TITLE = 'استعلام قیمت آنلاین، ارجاع به کارشناس و پاسخ کوتاه و انسانی';
export const PURCHASE_LINK_RULE_SORT_ORDER = 0;
export const LEGACY_PURCHASE_LINK_RULE_TITLE = 'پیشنهاد لینک خرید پیش از شروع استعلام';
export const LEGACY_PURCHASE_LINK_RULE_CATEGORY = 'SYSTEM_PURCHASE_LINK_BEFORE_QUOTATION';

export type QuotationRoutingTemplates = {
  version: 1;
  acceptanceExamples: string[];
  samePageResponse: string;
  differentPageResponse: string;
  awaitingChoiceResponse: string;
  chatStartResponse: string;
};

export const DEFAULT_QUOTATION_ROUTING_TEMPLATES: QuotationRoutingTemplates = {
  version: 1,
  acceptanceExamples: [
    'برام حساب کنید',
    'شما حساب کنید',
    'خودتون انجام بدید',
    'استعلام بگیرید',
    'قیمت بگیرید',
    'بله، شما انجام بدید',
  ],
  samePageResponse: 'فرم استعلام آنلاین {{productName}} در همین صفحه در دسترس است و می‌توانید خودتان آن را تکمیل کنید.\nاگر بخواهید، در همین چت هم سؤال‌های استعلام را یکی‌یکی از شما می‌پرسم.',
  differentPageResponse: 'برای استعلام آنلاین {{productName}} از لینک زیر استفاده کنید:\n{{purchaseUrl}}\nاگر بخواهید، در همین چت هم سؤال‌های استعلام را یکی‌یکی از شما می‌پرسم.',
  awaitingChoiceResponse: 'اگر می‌خواهید استعلام را در چت انجام دهیم، بگویید «خودتان استعلام کنید»؛ در غیر این صورت می‌توانید فرم آنلاین را تکمیل کنید.',
  chatStartResponse: 'حتماً؛ سؤال‌های استعلام را یکی‌یکی می‌پرسم.',
};

export const PURCHASE_LINK_RULE_DIRECTIVE = JSON.stringify(DEFAULT_QUOTATION_ROUTING_TEMPLATES, null, 2);

const ROUTING_TEMPLATE_KEYS = ['samePageResponse', 'differentPageResponse', 'awaitingChoiceResponse', 'chatStartResponse'] as const;
const ROUTING_TEMPLATE_VARIABLES = new Set(['productName', 'purchaseUrl', 'currentPageUrl']);
const FORBIDDEN_UNVERIFIED_CLAIM = /کد\s*یکتا|کمتر از\s*[۰-۹0-9]+\s*دقیقه|قیمت\s*قطعی|زمان\s*تضمینی|درخواست.*(?:ثبت|ارسال|ارجاع)\s*(?:شد|گردید)/i;

export function parseQuotationRoutingTemplates(value: unknown): QuotationRoutingTemplates | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>).version !== 1) return null;
    for (const key of ROUTING_TEMPLATE_KEYS) {
      const template = (parsed as Record<string, unknown>)[key];
      if (typeof template !== 'string' || !template.trim()) return null;
      if (FORBIDDEN_UNVERIFIED_CLAIM.test(template)) return null;
      for (const match of template.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
        if (!ROUTING_TEMPLATE_VARIABLES.has(match[1])) return null;
      }
    }
    if (!String((parsed as Record<string, unknown>).differentPageResponse).includes('{{purchaseUrl}}')) return null;
    const acceptanceExamples = (parsed as Record<string, unknown>).acceptanceExamples;
    if (acceptanceExamples !== undefined && (
      !Array.isArray(acceptanceExamples) ||
      acceptanceExamples.some((example) => typeof example !== 'string' || !example.trim())
    )) return null;
    return {
      ...(parsed as Omit<QuotationRoutingTemplates, 'acceptanceExamples'>),
      acceptanceExamples: Array.isArray(acceptanceExamples)
        ? acceptanceExamples.map((example) => String(example).trim())
        : [...DEFAULT_QUOTATION_ROUTING_TEMPLATES.acceptanceExamples],
    };
  } catch {
    return null;
  }
}

export function serializeQuotationRoutingTemplates(value: QuotationRoutingTemplates): string {
  if (!parseQuotationRoutingTemplates(value)) throw new Error('قالب‌های قانون هدایت استعلام نامعتبر هستند.');
  return JSON.stringify(value, null, 2);
}

export function renderQuotationRoutingTemplate(
  template: string,
  context: { productName: string; purchaseUrl?: string | null; currentPageUrl?: string | null },
): string {
  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, key: string) => {
    if (!ROUTING_TEMPLATE_VARIABLES.has(key)) return '';
    return String(context[key as keyof typeof context] || '');
  }).trim();
}

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

export function normalizeComparablePageUrl(value: unknown): string | null {
  const normalized = normalizeProductPurchaseUrl(value);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  const pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/, '') || '/';
  return `${parsed.hostname.toLowerCase()}${pathname.toLowerCase()}`;
}

export function isDetectedProductCurrentPage(input: {
  productId: string;
  currentPageProductId?: string | null;
  purchaseUrl?: string | null;
  currentPageUrl?: string | null;
}): boolean {
  if (input.currentPageProductId === input.productId) return true;
  const purchasePage = normalizeComparablePageUrl(input.purchaseUrl);
  const currentPage = normalizeComparablePageUrl(input.currentPageUrl);
  return Boolean(purchasePage && currentPage && purchasePage === currentPage);
}

export function isValidOptionalProductPurchaseUrl(value: unknown): boolean {
  return typeof value !== 'string' || !value.trim() || normalizeProductPurchaseUrl(value) !== null;
}

export function isDirectQuotationWorkflowRequest(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  return [
    /استعلام\s*(دقیق|کامل)/,
    /(خودتان|خودتون|شما|همینجا|همین جا)\s*(انجام|پیگیری|استعلام)/,
    /(آره|اره|بله|باشه|حتما|حتماً)?.*(شما|خودتان|خودتون).*(زحمت).*(بکش|بده)/,
    /فرم.*(نمی\s*(خوام|خواهم)|مشکل|باز\s*نمی|کار\s*نمی)/,
    /(کارشناس|اپراتور|انسان|مشاور).*(می\s*(خوام|خواهم)|وصل|انجام|تماس)/,
    /(لینک|خرید آنلاین|آنلاین)\s*(را|رو)?\s*(نمی\s*خواهم|نمیخوام|نمی خواهم|نمی‌خواهم)/,
    /(سؤال|سوال).*(بپرس|شروع)/,
    /(برام|برای\s*من|واسم)\s*(?:قیمت\s*)?(?:حساب|محاسبه)\s*(کن|کنید|بگیر|بگیرید)/,
    /(شما|خودتان|خودتون)\s*(?:برام|برای\s*من|واسم)?\s*(?:قیمت\s*)?(حساب|محاسبه)\s*(کن|کنید)/,
    /(استعلام|قیمت)\s*(را|رو)?\s*(بگیر|بگیرید|حساب|محاسبه|انجام)\s*(کن|کنید)?/,
  ].some((pattern) => pattern.test(normalized));
}

export function isPositiveQuotationWorkflowResponse(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  return /^(آره|اره|بله|باشه|اوکی|حتما|حتماً|قبوله|موافقم)(?:\s|[،,.!؟?]|$)/.test(normalized);
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

export function hasRecentProductPurchaseIntent(
  currentMessage: string,
  recentCustomerMessages: Iterable<string>,
): boolean {
  if (isProductPurchaseIntent(currentMessage) || isInsurancePriceIntent(currentMessage)) return true;
  return [...recentCustomerMessages].slice(-4).some((message) =>
    isProductPurchaseIntent(message) || isInsurancePriceIntent(message)
  );
}

function isInsurancePriceIntent(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  return /قیمت|استعلام|خرید|هزینه|نرخ|چقدر/.test(normalized);
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
    isPositiveQuotationWorkflowResponse(input.message) ||
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
