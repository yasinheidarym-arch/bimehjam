export const GOFTINO_CATEGORY_SETTING_PREFIX = 'goftino_ai_category:';

export type GoftinoMappingCategory = {
  id: string;
  slug: string;
  name: string;
  status?: string;
};

export type GoftinoMappingSource = 'SETTING' | 'LEGACY_FALLBACK' | 'UNMAPPED' | 'INVALID_SETTING';

export function goftinoCategorySettingKey(topicId: string) {
  return `${GOFTINO_CATEGORY_SETTING_PREFIX}${topicId}`;
}

export function resolveStoredGoftinoCategoryMapping(input: {
  categories: GoftinoMappingCategory[];
  configuredCategoryId: string | null;
  hasConfiguredSetting: boolean;
  legacyFallbackCategoryId?: string | null;
}): { category: GoftinoMappingCategory | null; source: GoftinoMappingSource } {
  if (input.hasConfiguredSetting) {
    const category = input.categories.find((item) =>
      item.id === input.configuredCategoryId && item.status !== 'INACTIVE',
    ) || null;
    return { category, source: category ? 'SETTING' : 'INVALID_SETTING' };
  }
  const category = input.categories.find((item) => item.id === input.legacyFallbackCategoryId) || null;
  return { category, source: category ? 'LEGACY_FALLBACK' : 'UNMAPPED' };
}

export function goftinoPolicyConfigurationError(
  requiresInsuranceCategory: boolean,
  enabled: boolean,
  category: GoftinoMappingCategory | null,
) {
  return enabled && requiresInsuranceCategory && !category
    ? 'برای فعال‌کردن AI این رشته، ابتدا یک دستهٔ بیمه‌ای فعال انتخاب کنید.'
    : null;
}
