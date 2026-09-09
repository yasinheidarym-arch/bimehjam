export const PRODUCT_INTENT_ROUTING_RULE_ID = 'system-product-intent-routing';
export const PRODUCT_INTENT_ROUTING_RULE_CATEGORY = 'SYSTEM_PRODUCT_INTENT_ROUTING';
export const PRODUCT_INTENT_ROUTING_RULE_TITLE = 'تشخیص نیت، انتخاب محصول و جلوگیری از قفل زودهنگام';
export const LEGACY_BUILDING_INTENT_RULE_TITLE = 'تشخیص منظور مشتری از «بیمه ساختمان» و هدایت به بیمه‌نامه صحیح (Building Insurance Intent Detection)';
export const PRODUCT_INTENT_ROUTING_RULE_SORT_ORDER = -10;

export const PRODUCT_INTENT_ROUTING_INSTRUCTION_V1 = [
  'آخرین نیاز یا اصلاح صریح مشتری بر هر محصول قبلی و محصول صفحه اولویت دارد.',
  'محصول صفحه فقط سرنخ است و بدون تأیید یا شواهد معنایی قوی، محصول قطعی نیست.',
  'اگر نیاز مشتری با محصول فعال قبلی ناسازگار است، محصول قبلی را حفظ نکن؛ محصول سازگار را از فهرست واقعی انتخاب کن یا برای رفع ابهام فقط یک سؤال کوتاه بپرس.',
  'در درخواست‌های ساختمانی ابتدا مرحله ساختمان و موضوع پوشش را تشخیص بده: ساخت/تخریب/بازسازی در برابر بهره‌برداری و مدیریت ساختمان. کاربری مسکونی یا تجاری به‌تنهایی محصول مدیر ساختمان را ثابت نمی‌کند.',
  'درخواست بیمه کارگران یا مسئولیت کارفرما در پروژه در حال ساخت با مسئولیت مدیر ساختمان تکمیل‌شده یکسان نیست.',
  'اصلاح‌هایی مانند «من می‌گویم ساختمان‌سازی» باید state و لینک محصول نامرتبط قبلی را بی‌اعتبار کند.',
  'هیچ شناسه یا محصولی خارج از candidateهای واقعی backend انتخاب نکن.',
].join('\n');

export const PRODUCT_INTENT_ROUTING_INSTRUCTION = [
  'پیش از کشف یا انتخاب محصول، intent مکالمه را تشخیص بده.',
  'Greeting ساده فقط پاسخ خوش‌آمد طبیعی می‌گیرد و نباید سؤال فروش، نوع بیمه یا محصول ایجاد کند.',
  'INFORMATIONAL فقط با دانش مجاز پاسخ داده می‌شود و Sales/Quote Flow را شروع نمی‌کند.',
  'Sales/Quote شامل خرید، قیمت، استعلام یا صدور است. Support/Follow-up/Claim مسیر خدماتی مستقل دارد.',
  'دسته انتخاب‌شده در گفتینو فقط category context است و محصول قطعی محسوب نمی‌شود.',
  'آخرین نیاز یا اصلاح صریح مشتری بر هر محصول قبلی و محصول صفحه اولویت دارد.',
  'محصول صفحه فقط سرنخ است و بدون تأیید یا شواهد معنایی قوی، محصول قطعی نیست.',
  'اگر نیاز مشتری با محصول فعال قبلی ناسازگار است، محصول قبلی را حفظ نکن؛ محصول سازگار را از فهرست واقعی انتخاب کن یا برای رفع ابهام فقط یک سؤال کوتاه بپرس.',
  'در درخواست‌های ساختمانی ابتدا مرحله ساختمان و موضوع پوشش را تشخیص بده: ساخت/تخریب/بازسازی در برابر بهره‌برداری و مدیریت ساختمان. کاربری مسکونی یا تجاری به‌تنهایی محصول مدیر ساختمان را ثابت نمی‌کند.',
  'اصلاح صریح کاربر باید state و لینک محصول نامرتبط قبلی را بی‌اعتبار کند.',
  'ASSISTED_LEAD فقط برای جمع‌آوری حداقل اطلاعات تماس کارشناس است و حداکثر ۳ تا ۵ سؤال کلیدی دارد.',
  'ASSISTED_QUOTE وقتی کاربر می‌خواهد سامانه قیمت را برایش بگیرد، workflow کامل سؤال‌های واقعی محصول را اجرا می‌کند و محدودیت ۳ تا ۵ سؤال ندارد.',
  'اطلاعاتی که قبلاً با اطمینان ثبت شده دوباره پرسیده نشود.',
  'هیچ شناسه یا محصولی خارج از candidateهای واقعی backend انتخاب نکن.',
].join('\n');

export const PRODUCT_INTENT_ROUTING_RULE_DIRECTIVE_V1 = JSON.stringify({
  kind: 'AI_BEHAVIOR_RULE',
  version: 1,
  instruction: PRODUCT_INTENT_ROUTING_INSTRUCTION_V1,
  scope: { channels: ['GOFTINO'], messageTypes: ['CUSTOMER_MESSAGE'], userRoles: ['CUSTOMER'] },
  conflictKey: PRODUCT_INTENT_ROUTING_RULE_CATEGORY,
}, null, 2);

export const PRODUCT_INTENT_ROUTING_RULE_DIRECTIVE = JSON.stringify({
  kind: 'AI_BEHAVIOR_RULE',
  version: 1,
  instruction: PRODUCT_INTENT_ROUTING_INSTRUCTION,
  scope: { channels: ['GOFTINO'], messageTypes: ['CUSTOMER_MESSAGE'], userRoles: ['CUSTOMER'] },
  conflictKey: PRODUCT_INTENT_ROUTING_RULE_CATEGORY,
}, null, 2);

export type ProductIntentRoutingState = {
  version: 1;
  originPageProductId: string | null;
  originPageProductName: string | null;
  activeProductId: string | null;
  activeProductName: string | null;
  confirmedProductId: string | null;
  confirmedProductName: string | null;
  status: 'UNRESOLVED' | 'INFERRED' | 'CONFIRMED' | 'NEEDS_CLARIFICATION';
  confidence: number;
  lastDecision: ProductIntentRoutingDecision;
  lastReason: string;
  updatedAt: string;
};

export type ProductIntentRoutingDecision =
  | 'KEEP_ACTIVE'
  | 'SELECT_PRODUCT'
  | 'CLEAR_AND_CLARIFY'
  | 'CATEGORY_ONLY'
  | 'NO_CHANGE';

export type ProductIntentClassification = {
  decision: ProductIntentRoutingDecision;
  selectedProductId: string | null;
  confidence: number;
  explicitCorrection: boolean;
  confirmation: 'EXPLICIT' | 'STRONG_INFERENCE' | 'NONE';
  intentSummary: string;
  reason: string;
  clarificationQuestion: string | null;
};

export function readProductIntentRoutingState(value: unknown): ProductIntentRoutingState | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<ProductIntentRoutingState>;
  if (item.version !== 1 || typeof item.status !== 'string' || typeof item.lastDecision !== 'string') return null;
  return {
    version: 1,
    originPageProductId: typeof item.originPageProductId === 'string' ? item.originPageProductId : null,
    originPageProductName: typeof item.originPageProductName === 'string' ? item.originPageProductName : null,
    activeProductId: typeof item.activeProductId === 'string' ? item.activeProductId : null,
    activeProductName: typeof item.activeProductName === 'string' ? item.activeProductName : null,
    confirmedProductId: typeof item.confirmedProductId === 'string' ? item.confirmedProductId : null,
    confirmedProductName: typeof item.confirmedProductName === 'string' ? item.confirmedProductName : null,
    status: ['UNRESOLVED', 'INFERRED', 'CONFIRMED', 'NEEDS_CLARIFICATION'].includes(item.status) ? item.status as ProductIntentRoutingState['status'] : 'UNRESOLVED',
    confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0,
    lastDecision: item.lastDecision as ProductIntentRoutingDecision,
    lastReason: typeof item.lastReason === 'string' ? item.lastReason : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
  };
}

export function safeClarificationQuestion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 240) return null;
  return text.endsWith('؟') ? text : `${text}؟`;
}

export function applyProductIntentClassification(input: {
  classification: ProductIntentClassification;
  candidates: Array<{ id: string; name: string }>;
  previous: ProductIntentRoutingState | null;
  legacyActiveProductId?: string | null;
  originPageProduct?: { id: string; name: string } | null;
  now?: string;
}): { state: ProductIntentRoutingState; selectedProductId: string | null; changed: boolean; clarificationQuestion: string | null } {
  const byId = new Map(input.candidates.map(product => [product.id, product]));
  const priorId = input.previous?.activeProductId || input.legacyActiveProductId || null;
  const prior = priorId ? byId.get(priorId) : null;
  const proposed = input.classification.selectedProductId ? byId.get(input.classification.selectedProductId) : null;
  const canSelect = input.classification.decision === 'SELECT_PRODUCT'
    && Boolean(proposed)
    && input.classification.confidence >= 0.72;
  const mustClear = input.classification.decision === 'CLEAR_AND_CLARIFY'
    && input.classification.confidence >= 0.55;
  const selected = canSelect ? proposed! : mustClear ? null : prior || null;
  const confirmation = canSelect ? input.classification.confirmation : 'NONE';
  const legacyConfirmed = !input.previous && Boolean(input.legacyActiveProductId && selected?.id === input.legacyActiveProductId);
  const status: ProductIntentRoutingState['status'] = mustClear
    ? 'NEEDS_CLARIFICATION'
    : selected
      ? confirmation === 'EXPLICIT' || legacyConfirmed ? 'CONFIRMED' : (input.previous?.confirmedProductId === selected.id ? 'CONFIRMED' : 'INFERRED')
      : 'UNRESOLVED';
  const origin = input.previous?.originPageProductId
    ? { id: input.previous.originPageProductId, name: input.previous.originPageProductName }
    : input.originPageProduct || null;
  const state: ProductIntentRoutingState = {
    version: 1,
    originPageProductId: origin?.id || null,
    originPageProductName: origin?.name || null,
    activeProductId: selected?.id || null,
    activeProductName: selected?.name || null,
    confirmedProductId: status === 'CONFIRMED' ? selected?.id || null : null,
    confirmedProductName: status === 'CONFIRMED' ? selected?.name || null : null,
    status,
    confidence: input.classification.confidence,
    lastDecision: input.classification.decision,
    lastReason: input.classification.reason,
    updatedAt: input.now || new Date().toISOString(),
  };
  return {
    state,
    selectedProductId: state.activeProductId,
    changed: priorId !== state.activeProductId,
    clarificationQuestion: mustClear || status === 'INFERRED' ? safeClarificationQuestion(input.classification.clarificationQuestion) : null,
  };
}

export const PRODUCT_SCOPED_COLLECTED_DATA_KEYS = [
  'quotationTurnState', 'purchaseLinkState', 'quotationSubmission', 'quotationTechnical',
  'quotationOptionSelection', 'currentPageProductSuggestion',
] as const;

export function invalidateStaleProductState(
  collectedData: Record<string, unknown>,
  previousQuestionFieldNames: string[],
): Record<string, unknown> {
  const blocked = new Set<string>([...PRODUCT_SCOPED_COLLECTED_DATA_KEYS, ...previousQuestionFieldNames]);
  return Object.fromEntries(Object.entries(collectedData).filter(([key]) => !blocked.has(key)));
}
