export const PRODUCT_ALREADY_EXISTS_MESSAGE = 'این محصول قبلاً تعریف شده است؛ اطلاعات آن را از بخش ویرایش همان محصول تغییر دهید.';
export const SUBCATEGORY_PRODUCT_EXISTS_MESSAGE = 'برای این زیر‌دسته قبلاً محصول تعریف شده است. اطلاعات محصول موجود را ویرایش کنید.';

export type CanonicalProductInput = {
  id?: string | null;
  name: string;
  slug?: string | null;
  subCategoryId?: string | null;
  aliases?: string[] | string | null;
  status?: string | null;
};

export type ProductIdentityConflictReason = 'SUBCATEGORY_OCCUPIED' | 'NORMALIZED_NAME' | 'SLUG' | 'ALIAS';

export type ProductIdentityConflict<T extends CanonicalProductInput = CanonicalProductInput> = {
  existingProduct: T;
  reason: ProductIdentityConflictReason;
  conflictingValue: string;
};

export function normalizeProductIdentity(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ|ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/[إأ]/g, 'ا')
    .replace(/‌/g, ' ')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeProductSlug(value: unknown): string {
  return String(value || '').normalize('NFKC').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

export function buildCanonicalProductName(categoryName: unknown, subCategoryName: unknown): string {
  const category = String(categoryName || '').replace(/\s+/g, ' ').trim();
  const subCategory = String(subCategoryName || '').replace(/\s+/g, ' ').trim();
  return category && subCategory ? `${category} — ${subCategory}` : '';
}

export function parseProductAliasInput(value: CanonicalProductInput['aliases']): string[] {
  const items = Array.isArray(value) ? value : String(value || '').split(/[|،,\n]/);
  const seen = new Set<string>();
  return items.map(item => String(item).trim()).filter(item => {
    const normalized = normalizeProductIdentity(item);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function active(product: CanonicalProductInput) {
  return String(product.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
}

export function findCanonicalProductConflict<T extends CanonicalProductInput>(
  candidate: CanonicalProductInput,
  existingProducts: T[],
  excludeProductId?: string | null,
): ProductIdentityConflict<T> | null {
  const candidateName = normalizeProductIdentity(candidate.name);
  const candidateSlug = normalizeProductSlug(candidate.slug);
  const candidateAliases = parseProductAliasInput(candidate.aliases).map(normalizeProductIdentity);
  for (const existing of existingProducts) {
    if (excludeProductId && existing.id === excludeProductId) continue;
    const existingName = normalizeProductIdentity(existing.name);
    const existingSlug = normalizeProductSlug(existing.slug);
    const existingAliases = parseProductAliasInput(existing.aliases).map(normalizeProductIdentity);

    if (
      active(candidate)
      && active(existing)
      && candidate.subCategoryId
      && candidate.subCategoryId === existing.subCategoryId
    ) {
      return { existingProduct: existing, reason: 'SUBCATEGORY_OCCUPIED', conflictingValue: candidate.subCategoryId };
    }

    if (candidateName && candidateName === existingName) {
      return { existingProduct: existing, reason: 'NORMALIZED_NAME', conflictingValue: candidate.name };
    }
    if (candidateSlug && existingSlug && candidateSlug === existingSlug) {
      return { existingProduct: existing, reason: 'SLUG', conflictingValue: String(candidate.slug) };
    }

    if (active(candidate) && active(existing)) {
      const candidateTerms = new Set([candidateName, ...candidateAliases].filter(Boolean));
      const existingTerms = [existingName, ...existingAliases].filter(Boolean);
      const sharedTerm = existingTerms.find(term => candidateTerms.has(term));
      if (sharedTerm) {
        return { existingProduct: existing, reason: 'ALIAS', conflictingValue: sharedTerm };
      }
    }
  }

  return null;
}
