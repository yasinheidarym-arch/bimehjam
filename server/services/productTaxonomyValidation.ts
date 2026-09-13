type TaxonomyLookup = {
  insuranceCategory: {
    findUnique(args: { where: { id: string }; select: { id: true; name: true } }): Promise<{ id: string; name: string } | null>;
  };
  insuranceSubCategory: {
    findUnique(args: { where: { id: string }; select: { id: true; name: true; categoryId: true } }): Promise<{ id: string; name: string; categoryId: string } | null>;
  };
};

export type ProductTaxonomyValidation =
  | { valid: true; categoryId: string; categoryName: string; subCategoryId: string; subCategoryName: string }
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
    db.insuranceCategory.findUnique({ where: { id: normalizedCategoryId }, select: { id: true, name: true } }),
    db.insuranceSubCategory.findUnique({ where: { id: normalizedSubCategoryId }, select: { id: true, name: true, categoryId: true } }),
  ]);

  if (!category) {
    return { valid: false, error: 'دسته‌بندی اصلی انتخاب‌شده معتبر نیست.' };
  }
  if (!subCategory || subCategory.categoryId !== category.id) {
    return { valid: false, error: 'زیر‌دسته انتخاب‌شده معتبر نیست یا به دسته‌بندی اصلی انتخاب‌شده تعلق ندارد.' };
  }

  return {
    valid: true,
    categoryId: category.id,
    categoryName: category.name,
    subCategoryId: subCategory.id,
    subCategoryName: subCategory.name,
  };
}
