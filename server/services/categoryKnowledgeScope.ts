export const CATEGORY_KNOWLEDGE_PREFIX = 'CATEGORY_KNOWLEDGE:';

export type InsuranceCategoryIdentity = {
  id: string;
  slug: string;
  name: string;
};

const topicSlugCandidates: Record<string, string[]> = {
  RESPONSIBILITY: ['responsibility'],
  VEHICLE: ['vehicle', 'auto'],
  HEALTH: ['health'],
  PROPERTY: ['property', 'fire'],
  ENGINEERING: ['engineering'],
};

export function categoryKnowledgeScope(categoryId: string) {
  return `${CATEGORY_KNOWLEDGE_PREFIX}${categoryId}`;
}

export function goftinoTopicCode(topic?: string | null) {
  const normalized = String(topic || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  if (normalized.includes('مسئولیت')) return 'RESPONSIBILITY';
  if (normalized.includes('خودرو')) return 'VEHICLE';
  if (normalized.includes('درمان')) return 'HEALTH';
  if (normalized.includes('آتش') || normalized.includes('اموال')) return 'PROPERTY';
  if (normalized.includes('مهندسی')) return 'ENGINEERING';
  return null;
}

export function resolveGoftinoCategoryId(
  categories: InsuranceCategoryIdentity[],
  topic?: string | null,
) {
  const code = goftinoTopicCode(topic);
  if (!code) return null;

  const candidates = topicSlugCandidates[code] || [];
  return categories.find((category) => candidates.includes(category.slug.toLowerCase()))?.id || null;
}

export function composeScopedKnowledge(categoryArticles: string[], productArticle?: string | null) {
  const category = categoryArticles.filter((article) => article.trim());
  const product = productArticle?.trim() || '';
  return {
    sections: [...category, ...(product ? [product] : [])],
    hasRelevantKnowledge: category.length > 0 || Boolean(product),
    productOverridesCategory: Boolean(product),
  };
}
