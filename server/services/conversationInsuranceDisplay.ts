import prisma from '../db/client';
import { readProductIntentRoutingState } from '../../shared/productIntentRouting';
import { resolveGoftinoTopicCategories } from './goftinoAiPolicyService';
import { normalizeUrlPath } from './productIntelligenceService';

export type ConversationInsuranceDisplaySource =
  | 'CONFIRMED_PRODUCT'
  | 'MAPPED_TOPIC_CATEGORY'
  | 'GENERAL';

export type ConversationInsuranceDisplay = {
  name: string;
  source: ConversationInsuranceDisplaySource;
};

export type ConversationInsuranceDisplayInput = {
  id: string;
  currentProductId?: string | null;
  collectedData?: string | Record<string, unknown> | null;
  customerMetadata?: string | Record<string, unknown> | null;
};

type ProductName = { id: string; name: string; categoryName?: string | null };

const GENERAL_INSURANCE_NAME = 'بیمه عمومی';

function parseRecord(value: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function topicIdFromMetadata(value: string | Record<string, unknown> | null | undefined): string | null {
  const metadata = parseRecord(value);
  const topicId = metadata.goftinoTopicId;
  return typeof topicId === 'string' && topicId.trim() ? topicId.trim() : null;
}

function categoryIdFromMetadata(value: string | Record<string, unknown> | null | undefined): string | null {
  const metadata = parseRecord(value);
  for (const key of ['goftinoCategoryId', 'insuranceCategoryId', 'categoryId']) {
    const categoryId = metadata[key];
    if (typeof categoryId === 'string' && categoryId.trim()) return categoryId.trim();
  }
  return null;
}

function pageUrlFromMetadata(value: string | Record<string, unknown> | null | undefined): string | null {
  const metadata = parseRecord(value);
  for (const key of ['lastUrl', 'currentPageUrl', 'pageUrl', 'current_url']) {
    const url = metadata[key];
    if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) return url.trim();
  }
  return null;
}

/**
 * Applies the display priority without using cached display names. A legacy
 * currentProductId is used only when old conversations predate routing state.
 */
export function deriveConversationInsuranceDisplay(
  input: ConversationInsuranceDisplayInput,
  products: Map<string, ProductName>,
  mappedCategoryName: string | null,
  legacyCategoryName: string | null = null,
): ConversationInsuranceDisplay {
  const collectedData = parseRecord(input.collectedData);
  const routing = readProductIntentRoutingState(collectedData.productIntentRouting);
  const productId = routing?.confirmedProductId || (!routing ? input.currentProductId || null : null);
  const product = productId ? products.get(productId) : null;
  if (product) return { name: product.name, source: 'CONFIRMED_PRODUCT' };
  if (mappedCategoryName) return { name: mappedCategoryName, source: 'MAPPED_TOPIC_CATEGORY' };
  if (legacyCategoryName) return { name: legacyCategoryName, source: 'MAPPED_TOPIC_CATEGORY' };
  const pageProduct = routing?.originPageProductId ? products.get(routing.originPageProductId) : null;
  if (pageProduct?.categoryName) return { name: pageProduct.categoryName, source: 'MAPPED_TOPIC_CATEGORY' };
  return { name: GENERAL_INSURANCE_NAME, source: 'GENERAL' };
}

export async function resolveConversationInsuranceDisplays(
  inputs: ConversationInsuranceDisplayInput[],
): Promise<Map<string, ConversationInsuranceDisplay>> {
  const productIds = new Set<string>();
  const topicByConversation = new Map<string, string | null>();
  const categoryIdByConversation = new Map<string, string | null>();
  const pageUrlByConversation = new Map<string, string | null>();

  for (const input of inputs) {
    const collectedData = parseRecord(input.collectedData);
    const routing = readProductIntentRoutingState(collectedData.productIntentRouting);
    const productId = routing?.confirmedProductId || (!routing ? input.currentProductId || null : null);
    if (productId) productIds.add(productId);
    if (routing?.originPageProductId) productIds.add(routing.originPageProductId);
    topicByConversation.set(input.id, topicIdFromMetadata(input.customerMetadata));
    categoryIdByConversation.set(input.id, categoryIdFromMetadata(input.customerMetadata));
    pageUrlByConversation.set(input.id, pageUrlFromMetadata(input.customerMetadata));
  }

  const metadataCategoryIds = [...new Set([...categoryIdByConversation.values()].filter((id): id is string => Boolean(id)))];
  const uniquePageUrls = [...new Set([...pageUrlByConversation.values()].filter((url): url is string => Boolean(url)))];
  const pagePaths = new Map(uniquePageUrls.map((url) => [url, normalizeUrlPath(url)]));
  const [products, categoriesByTopic, metadataCategories, legacyPageMaps, productsWithPurchaseUrl] = await Promise.all([
    productIds.size
      ? prisma.insuranceProduct.findMany({
          where: { id: { in: [...productIds] } },
          select: { id: true, name: true, categoryRef: { select: { name: true } } },
        })
      : Promise.resolve([]),
    resolveGoftinoTopicCategories([...topicByConversation.values()]),
    metadataCategoryIds.length
      ? prisma.insuranceCategory.findMany({
          where: { id: { in: metadataCategoryIds }, status: 'ACTIVE' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    pagePaths.size
      ? prisma.productUrlMap.findMany({
          where: { url: { in: [...pagePaths.values()].filter(Boolean) } },
          select: { url: true, product: { select: { categoryId: true } } },
        })
      : Promise.resolve([]),
    pagePaths.size
      ? prisma.insuranceProduct.findMany({
          where: { status: 'ACTIVE', purchaseUrl: { not: null } },
          select: { purchaseUrl: true, categoryId: true },
        })
      : Promise.resolve([]),
  ]);
  const categoryIdByPagePath = new Map<string, string>();
  for (const map of legacyPageMaps) {
    const path = normalizeUrlPath(map.url);
    if (path && map.product.categoryId) categoryIdByPagePath.set(path, map.product.categoryId);
  }
  for (const product of productsWithPurchaseUrl) {
    const path = product.purchaseUrl ? normalizeUrlPath(product.purchaseUrl) : '';
    if (path && product.categoryId) categoryIdByPagePath.set(path, product.categoryId);
  }
  const pageCategoryIds = [...new Set([...categoryIdByPagePath.values()])];
  const pageCategories = pageCategoryIds.length
    ? await prisma.insuranceCategory.findMany({
        where: { id: { in: pageCategoryIds }, status: 'ACTIVE' },
        select: { id: true, name: true },
      })
    : [];
  const productNames = new Map(products.map((product) => [product.id, {
    id: product.id,
    name: product.name,
    categoryName: product.categoryRef?.name || null,
  }]));
  const result = new Map<string, ConversationInsuranceDisplay>();
  const metadataCategoryNames = new Map(metadataCategories.map((category) => [category.id, category.name]));
  const pageCategoryNamesById = new Map(pageCategories.map((category) => [category.id, category.name]));
  const pageCategoryNames = new Map(uniquePageUrls.map((url) => {
    const categoryId = categoryIdByPagePath.get(pagePaths.get(url) || '') || null;
    return [url, categoryId ? pageCategoryNamesById.get(categoryId) || null : null];
  }));

  for (const input of inputs) {
    const topicId = topicByConversation.get(input.id) || null;
    const category = topicId ? categoriesByTopic.get(topicId) || null : null;
    const metadataCategoryId = categoryIdByConversation.get(input.id) || null;
    const pageUrl = pageUrlByConversation.get(input.id) || null;
    result.set(input.id, deriveConversationInsuranceDisplay(
      input,
      productNames,
      category?.name || null,
      metadataCategoryId
        ? metadataCategoryNames.get(metadataCategoryId) || null
        : pageUrl
          ? pageCategoryNames.get(pageUrl) || null
          : null,
    ));
  }
  return result;
}
