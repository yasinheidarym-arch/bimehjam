type TaxonomyLookup = {
  insuranceCategory: {
    findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
  insuranceSubCategory: {
    findUnique(args: { where: { id: string }; select: { id: true; categoryId: true } }): Promise<{ id: string; categoryId: string } | null>;
  };
};

export type ProductTaxonomyValidation =
  | { valid: true; categoryId: string; subCategoryId: string }
  | { valid: false; error: string };

export function selectConfirmedProductCandidate<T extends { id: string; subCategoryId?: string | null }>(
  confirmedProductId: string | null | undefined,
  candidates: T[],
): T | null {
  if (!confirmedProductId) return null;
  const product = candidates.find(candidate => candidate.id === confirmedProductId) || null;
  return product?.subCategoryId ? product : null;
}

export async function validateProductTaxonomyAssignment(
  db: TaxonomyLookup,
  categoryId: unknown,
  subCategoryId: unknown,
): Promise<ProductTaxonomyValidation> {
  const normalizedCategoryId = String(categoryId || '').trim();
  const normalizedSubCategoryId = String(subCategoryId || '').trim();

  if (!normalizedCategoryId || !normalizedSubCategoryId) {
    return { valid: false, error: 'انتخاب دسته‌بندی اصلی و زیر‌دسته برای محصول الزامی است.' };
  }

  const [category, subCategory] = await Promise.all([
    db.insuranceCategory.findUnique({ where: { id: normalizedCategoryId }, select: { id: true } }),
    db.insuranceSubCategory.findUnique({ where: { id: normalizedSubCategoryId }, select: { id: true, categoryId: true } }),
  ]);

  if (!category) {
    return { valid: false, error: 'دسته‌بندی اصلی انتخاب‌شده معتبر نیست.' };
  }
  if (!subCategory || subCategory.categoryId !== category.id) {
    return { valid: false, error: 'زیر‌دسته انتخاب‌شده معتبر نیست یا به دسته‌بندی اصلی انتخاب‌شده تعلق ندارد.' };
  }

  return { valid: true, categoryId: category.id, subCategoryId: subCategory.id };
}
