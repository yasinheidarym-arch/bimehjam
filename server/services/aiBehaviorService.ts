import prisma from '../db/client';
import {
  FULL_NAME_HANDOFF_RULE_CATEGORY,
  DEFAULT_HUMAN_HANDOFF_RULE_CONFIG,
  FULL_NAME_HANDOFF_RULE_DIRECTIVE,
  FULL_NAME_HANDOFF_RULE_ID,
  FULL_NAME_HANDOFF_RULE_TITLE,
  LEGACY_FULL_NAME_HANDOFF_RULE_DIRECTIVE,
  parseHumanHandoffRule,
  serializeHumanHandoffRule,
} from '../../shared/humanHandoffRule';
import {
  LEGACY_QUOTATION_RULE_TITLE,
  LEGACY_PURCHASE_LINK_RULE_CATEGORY,
  LEGACY_PURCHASE_LINK_RULE_TITLE,
  parseQuotationRoutingTemplates,
  PURCHASE_LINK_RULE_CATEGORY,
  PURCHASE_LINK_RULE_DIRECTIVE,
  PURCHASE_LINK_RULE_ID,
  PURCHASE_LINK_RULE_SORT_ORDER,
  PURCHASE_LINK_RULE_TITLE,
  serializeQuotationRoutingTemplates,
} from '../../shared/productPurchaseLink';
import {
  parseQuotationResponseEngineConfig,
  QUOTATION_RESPONSE_ENGINE_CATEGORY,
  QUOTATION_RESPONSE_ENGINE_DIRECTIVE,
  QUOTATION_RESPONSE_ENGINE_RULE_ID,
  QUOTATION_RESPONSE_ENGINE_TITLE,
  serializeQuotationResponseEngineConfig,
  type QuotationResponseEngineConfig,
} from '../../shared/quotationResponseEngine';
import {
  DEFAULT_QUOTATION_COMPLETION_PROMPT,
  DEFAULT_QUOTATION_COMPLETION_CONFIG,
  parseQuotationCompletionRule,
  QUOTATION_COMPLETION_RULE_DIRECTIVE,
  QUOTATION_COMPLETION_RULE_CATEGORY,
  QUOTATION_COMPLETION_RULE_ID,
  QUOTATION_COMPLETION_RULE_TITLE,
  serializeQuotationCompletionRule,
} from '../../shared/quotationCompletionRule';
import { parseAiBehaviorRuleEnvelope, serializeAiBehaviorRuleEnvelope, type AiBehaviorRuleScope } from '../../shared/aiBehaviorRuntime';
import {
  PRODUCT_INTENT_ROUTING_RULE_CATEGORY,
  PRODUCT_INTENT_ROUTING_RULE_DIRECTIVE,
  PRODUCT_INTENT_ROUTING_RULE_ID,
  PRODUCT_INTENT_ROUTING_RULE_SORT_ORDER,
  PRODUCT_INTENT_ROUTING_RULE_TITLE,
  LEGACY_BUILDING_INTENT_RULE_TITLE,
} from '../../shared/productIntentRouting';

export interface AiBehaviorRuleItem {
  id: string;
  title: string;
  directive: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  category?: string;
  enforcementLevel?: string;
  scope?: AiBehaviorRuleScope;
  conflictKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DEFAULT_INITIAL_RULES = [
  { title: 'سلام و احوالپرسی', directive: 'با سلام و احترام به گرمی خوش‌آمدگویی کنید و خود را مشاور رسمی بیمه جم معرفی نمایید.', sortOrder: 1, status: 'ACTIVE' },
  { title: 'لحن گفتار', directive: 'از لحن محترمانه، صمیمی، حرفه‌ای و اعتمادآفرین استفاده کنید.', sortOrder: 2, status: 'ACTIVE' },
  { title: 'حداکثر طول پاسخ', directive: 'پاسخ‌ها را مختصر، مفید و حداکثر در ۲ الی ۳ جمله کوتاه تنظیم کنید.', sortOrder: 3, status: 'ACTIVE' },
  { title: 'عبارات ممنوعه', directive: 'از کلمات عامیانه سخیف، تضمین‌های غیرواقعی، و حدس زدن قیمت بدون مشخصات اکیداً خودداری کنید.', sortOrder: 4, status: 'ACTIVE' },
  { title: 'سیاست اعلام قیمت', directive: 'استعلام قیمت را پس از اخذ مشخصات اعلام نموده و امکان پرداخت اقساطی بدون سود را یادآوری کنید.', sortOrder: 5, status: 'ACTIVE' },
  { title: 'سیاست پیشنهاد پوشش', directive: 'پوشش‌های مکمل و ضروری (مانند سرقت، حوادث یا مسئولیت) را متناسب با نیاز مشتری پیشنهاد دهید.', sortOrder: 6, status: 'ACTIVE' },
  { title: 'ارجاع به کارشناس', directive: 'پس از استخراج تمامی پاسخ‌های استعلام، پرونده را جهت محاسبه و اعلام قیمت به کارشناس ارجاع دهید.', sortOrder: 7, status: 'ACTIVE' },
  { title: 'سوال پیگیری', directive: 'در انتهای هر پاسخ، فقط یک سوال مشخص مربوط به مرحله بعد استعلام از مشتری بپرسید.', sortOrder: 8, status: 'ACTIVE' },
];

/**
 * Seed initial behavior rules if DB table is empty
 */
async function ensureSeedRules() {
  const count = await prisma.aiRule.count();
  if (count === 0) {
    for (const rule of DEFAULT_INITIAL_RULES) {
      await prisma.aiRule.create({
        data: {
          title: rule.title,
          directive: rule.directive,
          sortOrder: rule.sortOrder,
          status: rule.status,
          category: 'CUSTOM',
          enforcementLevel: 'STRICT',
        },
      });
    }
  }
  const existingSystemRule = await prisma.aiRule.findFirst({
    where: { OR: [{ id: FULL_NAME_HANDOFF_RULE_ID }, { category: FULL_NAME_HANDOFF_RULE_CATEGORY }, { title: FULL_NAME_HANDOFF_RULE_TITLE }] },
  });
  if (!existingSystemRule) {
    const aggregate = await prisma.aiRule.aggregate({ _max: { sortOrder: true } });
    await prisma.aiRule.create({
      data: {
        id: FULL_NAME_HANDOFF_RULE_ID,
        title: FULL_NAME_HANDOFF_RULE_TITLE,
        directive: FULL_NAME_HANDOFF_RULE_DIRECTIVE,
        sortOrder: (aggregate._max.sortOrder || 0) + 1,
        status: 'ACTIVE',
        category: FULL_NAME_HANDOFF_RULE_CATEGORY,
        enforcementLevel: 'STRICT',
      },
    }).catch(async (error: { code?: string }) => {
      if (error.code !== 'P2002') throw error;
    });
  } else if (existingSystemRule.directive === LEGACY_FULL_NAME_HANDOFF_RULE_DIRECTIVE) {
    // Idempotent data-shape migration of the untouched legacy default only.
    // Manager-customized directives are never overwritten.
    await prisma.aiRule.update({ where: { id: existingSystemRule.id }, data: { directive: FULL_NAME_HANDOFF_RULE_DIRECTIVE } });
  }

  const purchaseLinkRule = await prisma.aiRule.findFirst({
    where: {
      OR: [
        { id: PURCHASE_LINK_RULE_ID },
        { category: PURCHASE_LINK_RULE_CATEGORY },
        { category: LEGACY_PURCHASE_LINK_RULE_CATEGORY },
        { title: PURCHASE_LINK_RULE_TITLE },
        { title: LEGACY_PURCHASE_LINK_RULE_TITLE },
        { title: LEGACY_QUOTATION_RULE_TITLE },
      ],
    },
  });
  if (!purchaseLinkRule) {
    await prisma.aiRule.create({
      data: {
        id: PURCHASE_LINK_RULE_ID,
        title: PURCHASE_LINK_RULE_TITLE,
        directive: PURCHASE_LINK_RULE_DIRECTIVE,
        sortOrder: PURCHASE_LINK_RULE_SORT_ORDER,
        status: 'ACTIVE',
        category: PURCHASE_LINK_RULE_CATEGORY,
        enforcementLevel: 'STRICT',
      },
    }).catch(async (error: { code?: string }) => {
      if (error.code !== 'P2002') throw error;
    });
  }

  const productIntentRule = await prisma.aiRule.findFirst({
    where: { OR: [
      { id: PRODUCT_INTENT_ROUTING_RULE_ID },
      { category: PRODUCT_INTENT_ROUTING_RULE_CATEGORY },
      { title: PRODUCT_INTENT_ROUTING_RULE_TITLE },
      { title: LEGACY_BUILDING_INTENT_RULE_TITLE },
    ] },
  });
  if (!productIntentRule) {
    await prisma.aiRule.create({ data: {
      id: PRODUCT_INTENT_ROUTING_RULE_ID,
      title: PRODUCT_INTENT_ROUTING_RULE_TITLE,
      directive: PRODUCT_INTENT_ROUTING_RULE_DIRECTIVE,
      sortOrder: PRODUCT_INTENT_ROUTING_RULE_SORT_ORDER,
      status: 'ACTIVE', category: PRODUCT_INTENT_ROUTING_RULE_CATEGORY, enforcementLevel: 'STRICT',
    }}).catch((error: { code?: string }) => { if (error.code !== 'P2002') throw error; });
  } else if (productIntentRule.category !== PRODUCT_INTENT_ROUTING_RULE_CATEGORY) {
    // Promote the equivalent legacy admin rule instead of creating a duplicate.
    // This happens once; subsequent manager edits remain untouched.
    await prisma.aiRule.update({ where: { id: productIntentRule.id }, data: {
      title: PRODUCT_INTENT_ROUTING_RULE_TITLE,
      directive: PRODUCT_INTENT_ROUTING_RULE_DIRECTIVE,
      sortOrder: PRODUCT_INTENT_ROUTING_RULE_SORT_ORDER,
      category: PRODUCT_INTENT_ROUTING_RULE_CATEGORY,
      enforcementLevel: 'STRICT',
    } });
  }

  const responseEngineRule = await prisma.aiRule.findFirst({
    where: { OR: [{ id: QUOTATION_RESPONSE_ENGINE_RULE_ID }, { category: QUOTATION_RESPONSE_ENGINE_CATEGORY }] },
  });
  if (!responseEngineRule) {
    const aggregate = await prisma.aiRule.aggregate({ _max: { sortOrder: true } });
    await prisma.aiRule.create({ data: {
      id: QUOTATION_RESPONSE_ENGINE_RULE_ID,
      title: QUOTATION_RESPONSE_ENGINE_TITLE,
      directive: QUOTATION_RESPONSE_ENGINE_DIRECTIVE,
      sortOrder: (aggregate._max.sortOrder || 0) + 1,
      status: 'ACTIVE', category: QUOTATION_RESPONSE_ENGINE_CATEGORY, enforcementLevel: 'STRICT',
    }}).catch((error: { code?: string }) => { if (error.code !== 'P2002') throw error; });
  }

  const completionRule = await prisma.aiRule.findFirst({
    where: { OR: [{ id: QUOTATION_COMPLETION_RULE_ID }, { category: QUOTATION_COMPLETION_RULE_CATEGORY }] },
  });
  if (!completionRule) {
    const aggregate = await prisma.aiRule.aggregate({ _max: { sortOrder: true } });
    await prisma.aiRule.create({ data: {
      id: QUOTATION_COMPLETION_RULE_ID,
      title: QUOTATION_COMPLETION_RULE_TITLE,
      directive: QUOTATION_COMPLETION_RULE_DIRECTIVE,
      sortOrder: (aggregate._max.sortOrder || 0) + 1,
      status: 'ACTIVE', category: QUOTATION_COMPLETION_RULE_CATEGORY, enforcementLevel: 'STRICT',
    }}).catch((error: { code?: string }) => { if (error.code !== 'P2002') throw error; });
  } else if (completionRule.directive === DEFAULT_QUOTATION_COMPLETION_PROMPT) {
    await prisma.aiRule.update({ where: { id: completionRule.id }, data: { directive: QUOTATION_COMPLETION_RULE_DIRECTIVE } });
  }
}

export async function ensureSystemAiBehaviorRules(): Promise<void> {
  await ensureSeedRules();
}

export async function isFullNameHandoffRuleActive(): Promise<boolean> {
  const rule = await prisma.aiRule.findFirst({ where: { category: FULL_NAME_HANDOFF_RULE_CATEGORY }, select: { status: true } });
  return rule?.status === 'ACTIVE';
}

type StoredRuleConfig = { status: string; directive: string } | null | undefined;

export function resolveHumanHandoffRuleConfigRecord(rule: StoredRuleConfig) {
  return rule?.status === 'ACTIVE'
    ? (parseHumanHandoffRule(rule.directive) || DEFAULT_HUMAN_HANDOFF_RULE_CONFIG)
    : null;
}

export async function getHumanHandoffRuleConfig() {
  const rule = await prisma.aiRule.findFirst({ where: { category: FULL_NAME_HANDOFF_RULE_CATEGORY } });
  return resolveHumanHandoffRuleConfigRecord(rule);
}

/**
 * Get all AI Behavior Rules (active & inactive) sorted by sortOrder asc
 */
export async function getAllBehaviorRules(): Promise<AiBehaviorRuleItem[]> {
  const rules = await prisma.aiRule.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return rules.map((r) => {
    const envelope = parseAiBehaviorRuleEnvelope(r.directive);
    return {
      id: r.id,
      title: r.title,
      directive: envelope?.instruction || r.directive,
      sortOrder: r.sortOrder,
      status: r.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      category: r.category,
      enforcementLevel: r.enforcementLevel,
      scope: envelope?.scope,
      conflictKey: envelope?.conflictKey,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

/**
 * Format enabled behavior rules into single prompt string for Layer 2 AI Injection
 */
export async function getFormattedAiBehaviorPrompt(): Promise<string> {
  const activeRules = await prisma.aiRule.findMany({
    where: { status: 'ACTIVE', category: { notIn: [PURCHASE_LINK_RULE_CATEGORY, QUOTATION_RESPONSE_ENGINE_CATEGORY, QUOTATION_COMPLETION_RULE_CATEGORY] } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (!activeRules || activeRules.length === 0) {
    return '=== قوانین رفتار هوش مصنوعی (AI Behavior Rules) ===\n• پاسخ‌های محترمانه، کوتاه و دقیق با زبان فارسی ارائه دهید.';
  }

  const ruleLines = activeRules.map((r, idx) => `${idx + 1}. [${r.title}]: ${parseAiBehaviorRuleEnvelope(r.directive)?.instruction || r.directive}`);
  return `=== قوانین رفتار هوش مصنوعی (AI Behavior Rules) ===\n${ruleLines.join('\n')}`;
}

/**
 * Create a new dynamic AI Behavior Rule
 */
export async function createBehaviorRule(data: {
  title: string;
  directive: string;
  sortOrder?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  scope?: AiBehaviorRuleScope;
  conflictKey?: string;
}): Promise<AiBehaviorRuleItem> {
  const count = await prisma.aiRule.count();
  const sortOrder = data.sortOrder ?? count + 1;

  const created = await prisma.aiRule.create({
    data: {
      title: data.title.trim(),
      directive: data.scope || data.conflictKey
        ? serializeAiBehaviorRuleEnvelope({ version: 1, instruction: data.directive, scope: data.scope, conflictKey: data.conflictKey })
        : data.directive.trim(),
      sortOrder: sortOrder,
      status: data.status || 'ACTIVE',
      category: 'CUSTOM',
      enforcementLevel: 'STRICT',
    },
  });

  return {
    id: created.id,
    title: created.title,
    directive: parseAiBehaviorRuleEnvelope(created.directive)?.instruction || created.directive,
    sortOrder: created.sortOrder,
    status: created.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

/**
 * Update an existing AI Behavior Rule
 */
export async function updateBehaviorRule(
  id: string,
  data: Partial<{
    title: string;
    directive: string;
    sortOrder: number;
    status: 'ACTIVE' | 'INACTIVE';
    scope: AiBehaviorRuleScope;
    conflictKey: string;
  }>
): Promise<AiBehaviorRuleItem> {
  const updateData: any = {};
  const existing = await prisma.aiRule.findUnique({ where: { id } });
  if (!existing) throw new Error('قانون رفتار یافت نشد.');
  if (existing.category === FULL_NAME_HANDOFF_RULE_CATEGORY) {
    if (data.directive !== undefined) {
      const config = parseHumanHandoffRule(data.directive);
      if (!config) throw new Error('تنظیمات دریافت مشخصات و ارجاع نامعتبر است.');
      updateData.directive = serializeHumanHandoffRule(config);
    }
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.status !== undefined) updateData.status = data.status;
  } else if (existing.category === PURCHASE_LINK_RULE_CATEGORY) {
    if (data.directive !== undefined) {
      if (!parseQuotationRoutingTemplates(data.directive)) throw new Error('متن‌های قانون هدایت استعلام نامعتبر هستند.');
      updateData.directive = data.directive.trim();
    }
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.status !== undefined) updateData.status = data.status;
  } else if (existing.category === QUOTATION_COMPLETION_RULE_CATEGORY) {
    if (data.directive !== undefined) {
      const config = parseQuotationCompletionRule(data.directive);
      if (!config) throw new Error('تنظیمات مرحله پایانی استعلام نامعتبر است.');
      updateData.directive = serializeQuotationCompletionRule(config);
    }
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.status !== undefined) updateData.status = data.status;
  } else if (existing.category === QUOTATION_RESPONSE_ENGINE_CATEGORY) {
    if (data.directive !== undefined) {
      const config = parseQuotationResponseEngineConfig(data.directive);
      if (!config) throw new Error('پیکربندی موتور پاسخ استعلام نامعتبر است.');
      updateData.directive = serializeQuotationResponseEngineConfig(config);
    }
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.status !== undefined) updateData.status = data.status;
  } else {
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.directive !== undefined || data.scope !== undefined || data.conflictKey !== undefined) {
    const envelope = parseAiBehaviorRuleEnvelope(existing.directive);
    const instruction = data.directive !== undefined ? data.directive.trim() : envelope?.instruction || existing.directive;
    const scope = data.scope !== undefined ? data.scope : envelope?.scope;
    const conflictKey = data.conflictKey !== undefined ? data.conflictKey : envelope?.conflictKey;
    updateData.directive = scope || conflictKey
      ? serializeAiBehaviorRuleEnvelope({ version: 1, instruction, scope, conflictKey })
      : instruction;
  }
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.status !== undefined) updateData.status = data.status;
  }

  const updated = await prisma.aiRule.update({
    where: { id },
    data: updateData,
  });

  return {
    id: updated.id,
    title: updated.title,
    directive: parseAiBehaviorRuleEnvelope(updated.directive)?.instruction || updated.directive,
    sortOrder: updated.sortOrder,
    status: updated.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    category: updated.category,
    enforcementLevel: updated.enforcementLevel,
    scope: parseAiBehaviorRuleEnvelope(updated.directive)?.scope,
    conflictKey: parseAiBehaviorRuleEnvelope(updated.directive)?.conflictKey,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function getQuotationRoutingRule() {
  const rule = await prisma.aiRule.findFirst({ where: { category: PURCHASE_LINK_RULE_CATEGORY } });
  if (!rule) return null;
  const templates = parseQuotationRoutingTemplates(rule.directive);
  if (!templates) return null;
  return {
    id: rule.id,
    title: rule.title,
    status: rule.status === 'ACTIVE' ? 'ACTIVE' as const : 'INACTIVE' as const,
    sortOrder: rule.sortOrder,
    templates,
  };
}

export async function getQuotationCompletionPrompt(): Promise<string | null> {
  const rule = await prisma.aiRule.findFirst({ where: { category: QUOTATION_COMPLETION_RULE_CATEGORY } });
  return rule?.status === 'ACTIVE' ? (parseQuotationCompletionRule(rule.directive)?.choicePrompt || DEFAULT_QUOTATION_COMPLETION_PROMPT) : null;
}

export async function getQuotationCompletionConfig() {
  const rule = await prisma.aiRule.findFirst({ where: { category: QUOTATION_COMPLETION_RULE_CATEGORY } });
  return resolveQuotationCompletionConfigRecord(rule);
}

export function resolveQuotationCompletionConfigRecord(rule: StoredRuleConfig) {
  return rule?.status === 'ACTIVE'
    ? (parseQuotationCompletionRule(rule.directive) || DEFAULT_QUOTATION_COMPLETION_CONFIG)
    : null;
}

export async function getQuotationFinalizationRuleContext() {
  const rules = await prisma.aiRule.findMany({
    where: { category: { in: [FULL_NAME_HANDOFF_RULE_CATEGORY, QUOTATION_COMPLETION_RULE_CATEGORY] } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { title: true, category: true, status: true, sortOrder: true, enforcementLevel: true, directive: true },
  });
  return rules.map(rule => ({
    title: rule.title,
    category: rule.category,
    active: rule.status === 'ACTIVE',
    priority: rule.sortOrder,
    enforcementLevel: rule.enforcementLevel,
    directive: rule.directive,
  }));
}

export async function getQuotationResponseEngineRule() {
  const rule = await prisma.aiRule.findFirst({ where: { category: QUOTATION_RESPONSE_ENGINE_CATEGORY } });
  if (!rule) return null;
  const config = parseQuotationResponseEngineConfig(rule.directive);
  if (!config) return null;
  return { id: rule.id, title: rule.title, status: rule.status === 'ACTIVE' ? 'ACTIVE' as const : 'INACTIVE' as const, sortOrder: rule.sortOrder, config };
}

export async function updateQuotationQuestionExamples(questionId: string, examples: string[]): Promise<QuotationResponseEngineConfig> {
  const rule = await getQuotationResponseEngineRule();
  if (!rule) throw new Error('قانون موتور پاسخ استعلام یافت نشد.');
  const cleaned = examples.map(item => item.trim()).filter(Boolean).slice(0, 30);
  const config = { ...rule.config, questionExamples: { ...rule.config.questionExamples } };
  if (cleaned.length) config.questionExamples[questionId] = cleaned;
  else delete config.questionExamples[questionId];
  await prisma.aiRule.update({ where: { id: rule.id }, data: { directive: serializeQuotationResponseEngineConfig(config) } });
  return config;
}

/**
 * Delete an AI Behavior Rule
 */
export async function deleteBehaviorRule(id: string): Promise<boolean> {
  const existing = await prisma.aiRule.findUnique({ where: { id }, select: { category: true } });
  if (existing?.category === FULL_NAME_HANDOFF_RULE_CATEGORY || existing?.category === PURCHASE_LINK_RULE_CATEGORY || existing?.category === QUOTATION_RESPONSE_ENGINE_CATEGORY || existing?.category === QUOTATION_COMPLETION_RULE_CATEGORY || existing?.category === PRODUCT_INTENT_ROUTING_RULE_CATEGORY) {
    throw new Error('این قانون سیستمی قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید.');
  }
  await prisma.aiRule.delete({
    where: { id },
  });
  return true;
}

/**
 * Reorder behavior rules by array of IDs
 */
export async function reorderBehaviorRules(orderedIds: string[]): Promise<boolean> {
  const ids = [...new Set(orderedIds)];
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < ids.length; index++) {
      await tx.aiRule.update({ where: { id: ids[index] }, data: { sortOrder: -(index + 1) } });
    }
    for (let index = 0; index < ids.length; index++) {
      await tx.aiRule.update({ where: { id: ids[index] }, data: { sortOrder: index + 1 } });
    }
  });
  return true;
}
