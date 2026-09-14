export function hasProductGrounding(product: {
  aiKnowledgeArticle?: string | null;
  aiRules?: string | null;
  description?: string | null;
  coverage?: string | null;
  purchaseConditions?: string | null;
  exclusions?: string | null;
  benefits?: string | null;
} | null | undefined): boolean {
  if (!product) return false;
  return [
    product.aiKnowledgeArticle,
    product.aiRules,
    product.coverage,
    product.purchaseConditions,
    product.exclusions,
    product.benefits,
  ].some(value => Boolean(value?.trim()));
}
