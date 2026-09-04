import prisma from '../db/client';
import {
  FULL_NAME_HANDOFF_RULE_CATEGORY,
  FULL_NAME_HANDOFF_RULE_DIRECTIVE,
  FULL_NAME_HANDOFF_RULE_ID,
  FULL_NAME_HANDOFF_RULE_TITLE,
} from '../../shared/humanHandoffRule';
import {
  LEGACY_QUOTATION_RULE_TITLE,
  PURCHASE_LINK_RULE_CATEGORY,
  PURCHASE_LINK_RULE_DIRECTIVE,
  PURCHASE_LINK_RULE_ID,
  PURCHASE_LINK_RULE_SORT_ORDER,
  PURCHASE_LINK_RULE_TITLE,
} from '../../shared/productPurchaseLink';

export interface AiBehaviorRuleItem {
  id: string;
  title: string;
  directive: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  category?: string;
  enforcementLevel?: string;
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
  } else if (
    existingSystemRule.title !== FULL_NAME_HANDOFF_RULE_TITLE ||
    existingSystemRule.directive !== FULL_NAME_HANDOFF_RULE_DIRECTIVE ||
    existingSystemRule.category !== FULL_NAME_HANDOFF_RULE_CATEGORY
  ) {
    await prisma.aiRule.update({
      where: { id: existingSystemRule.id },
      data: { title: FULL_NAME_HANDOFF_RULE_TITLE, directive: FULL_NAME_HANDOFF_RULE_DIRECTIVE, category: FULL_NAME_HANDOFF_RULE_CATEGORY, enforcementLevel: 'STRICT' },
    });
  }

  const purchaseLinkRule = await prisma.aiRule.findFirst({
    where: {
      OR: [
        { id: PURCHASE_LINK_RULE_ID },
        { category: PURCHASE_LINK_RULE_CATEGORY },
        { title: PURCHASE_LINK_RULE_TITLE },
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
  } else if (
    purchaseLinkRule.title !== PURCHASE_LINK_RULE_TITLE ||
    purchaseLinkRule.directive !== PURCHASE_LINK_RULE_DIRECTIVE ||
    purchaseLinkRule.category !== PURCHASE_LINK_RULE_CATEGORY ||
    purchaseLinkRule.enforcementLevel !== 'STRICT' ||
    purchaseLinkRule.sortOrder !== PURCHASE_LINK_RULE_SORT_ORDER
  ) {
    await prisma.aiRule.update({
      where: { id: purchaseLinkRule.id },
      data: {
        title: PURCHASE_LINK_RULE_TITLE,
        directive: PURCHASE_LINK_RULE_DIRECTIVE,
        sortOrder: PURCHASE_LINK_RULE_SORT_ORDER,
        status: purchaseLinkRule.title === LEGACY_QUOTATION_RULE_TITLE ? 'ACTIVE' : purchaseLinkRule.status,
        category: PURCHASE_LINK_RULE_CATEGORY,
        enforcementLevel: 'STRICT',
      },
    });
  }
}

export async function ensureSystemAiBehaviorRules(): Promise<void> {
  await ensureSeedRules();
}

export async function isFullNameHandoffRuleActive(): Promise<boolean> {
  await ensureSeedRules();
  const rule = await prisma.aiRule.findFirst({ where: { category: FULL_NAME_HANDOFF_RULE_CATEGORY }, select: { status: true } });
  return rule?.status === 'ACTIVE';
}

/**
 * Get all AI Behavior Rules (active & inactive) sorted by sortOrder asc
 */
export async function getAllBehaviorRules(): Promise<AiBehaviorRuleItem[]> {
  await ensureSeedRules();
  const rules = await prisma.aiRule.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return rules.map((r) => ({
    id: r.id,
    title: r.title,
    directive: r.directive,
    sortOrder: r.sortOrder,
    status: r.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    category: r.category,
    enforcementLevel: r.enforcementLevel,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Format enabled behavior rules into single prompt string for Layer 2 AI Injection
 */
export async function getFormattedAiBehaviorPrompt(): Promise<string> {
  await ensureSeedRules();
  const activeRules = await prisma.aiRule.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (!activeRules || activeRules.length === 0) {
    return '=== قوانین رفتار هوش مصنوعی (AI Behavior Rules) ===\n• پاسخ‌های محترمانه، کوتاه و دقیق با زبان فارسی ارائه دهید.';
  }

  const ruleLines = activeRules.map((r, idx) => `${idx + 1}. [${r.title}]: ${r.directive}`);
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
}): Promise<AiBehaviorRuleItem> {
  const count = await prisma.aiRule.count();
  const sortOrder = data.sortOrder ?? count + 1;

  const created = await prisma.aiRule.create({
    data: {
      title: data.title.trim(),
      directive: data.directive.trim(),
      sortOrder: sortOrder,
      status: data.status || 'ACTIVE',
      category: 'CUSTOM',
      enforcementLevel: 'STRICT',
    },
  });

  return {
    id: created.id,
    title: created.title,
    directive: created.directive,
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
  }>
): Promise<AiBehaviorRuleItem> {
  const updateData: any = {};
  const existing = await prisma.aiRule.findUnique({ where: { id } });
  if (!existing) throw new Error('قانون رفتار یافت نشد.');
  if (existing.category === FULL_NAME_HANDOFF_RULE_CATEGORY || existing.category === PURCHASE_LINK_RULE_CATEGORY) {
    if (data.status !== undefined) updateData.status = data.status;
  } else {
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.directive !== undefined) updateData.directive = data.directive.trim();
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
    directive: updated.directive,
    sortOrder: updated.sortOrder,
    status: updated.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    category: updated.category,
    enforcementLevel: updated.enforcementLevel,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Delete an AI Behavior Rule
 */
export async function deleteBehaviorRule(id: string): Promise<boolean> {
  const existing = await prisma.aiRule.findUnique({ where: { id }, select: { category: true } });
  if (existing?.category === FULL_NAME_HANDOFF_RULE_CATEGORY || existing?.category === PURCHASE_LINK_RULE_CATEGORY) {
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
  for (let index = 0; index < orderedIds.length; index++) {
    const id = orderedIds[index];
    await prisma.aiRule.update({
      where: { id },
      data: { sortOrder: index + 1 },
    });
  }
  return true;
}
