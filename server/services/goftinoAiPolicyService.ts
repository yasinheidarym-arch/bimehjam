import prisma from '../db/client';
import { decideGoftinoAiPolicy, GoftinoAiPolicyInput, GoftinoAiPolicyDecision } from './goftinoAiPolicyDecision';
import {
  findCategoryForCatalogTopic,
  GOFTINO_TOPIC_CATALOG,
} from './goftinoTopicCatalog';
import {
  GOFTINO_CATEGORY_SETTING_PREFIX,
  goftinoCategorySettingKey,
  goftinoPolicyConfigurationError,
  resolveStoredGoftinoCategoryMapping,
  type GoftinoMappingCategory,
} from '../../shared/goftinoCategoryMapping';

export { decideGoftinoAiPolicy } from './goftinoAiPolicyDecision';
export type { GoftinoAiPolicyInput, GoftinoAiPolicyDecision } from './goftinoAiPolicyDecision';

const ENABLED_SETTING_PREFIX = 'goftino_ai_enabled:';
export { goftinoCategorySettingKey } from '../../shared/goftinoCategoryMapping';

type ActiveCategory = GoftinoMappingCategory;

function enabledSettingKey(topicId: string) {
  return `${ENABLED_SETTING_PREFIX}${topicId}`;
}

function resolveGoftinoCategoryMapping(
  topic: (typeof GOFTINO_TOPIC_CATALOG)[number],
  categories: ActiveCategory[],
  configuredCategoryId: string | null,
  hasConfiguredSetting: boolean,
){
  return resolveStoredGoftinoCategoryMapping({
    categories,
    configuredCategoryId,
    hasConfiguredSetting,
    legacyFallbackCategoryId: findCategoryForCatalogTopic(topic, categories)?.id || null,
  });
}

async function loadPolicyData() {
  const [categories, settings] = await Promise.all([
    prisma.insuranceCategory.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, slug: true, name: true, status: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    }),
    prisma.systemSetting.findMany({
      where: {
        OR: [
          { key: { startsWith: ENABLED_SETTING_PREFIX } },
          { key: { startsWith: GOFTINO_CATEGORY_SETTING_PREFIX } },
        ],
      },
      select: { key: true, value: true },
    }),
  ]);
  return { categories, values: new Map(settings.map((setting) => [setting.key, setting.value])) };
}

export async function resolveGoftinoAiPolicy(goftinoTopicId?: string | null): Promise<GoftinoAiPolicyDecision> {
  const topic = GOFTINO_TOPIC_CATALOG.find((item) => item.id === goftinoTopicId) || null;
  if (!topic) return decideGoftinoAiPolicy(null, false);

  const { categories, values } = await loadPolicyData();
  const categoryKey = goftinoCategorySettingKey(topic.id);
  const mapping = resolveGoftinoCategoryMapping(
    topic,
    categories,
    values.get(categoryKey)?.trim() || null,
    values.has(categoryKey),
  );

  return decideGoftinoAiPolicy({
    goftinoTopicId: topic.id,
    goftinoTopicTitle: topic.title,
    insuranceCategoryId: mapping.category?.id || null,
  }, values.get(enabledSettingKey(topic.id)) === 'true');
}

function policyRows(categories: ActiveCategory[], values: Map<string, string>) {
  return GOFTINO_TOPIC_CATALOG.map((topic) => {
    const categoryKey = goftinoCategorySettingKey(topic.id);
    const configuredCategoryId = values.get(categoryKey)?.trim() || null;
    const mapping = resolveGoftinoCategoryMapping(topic, categories, configuredCategoryId, values.has(categoryKey));
    const enabled = values.get(enabledSettingKey(topic.id)) === 'true';
    const isConfigurationValid = !enabled || !topic.requiresInsuranceCategory || mapping.source === 'SETTING';
    return {
      id: topic.id,
      title: topic.title,
      category: mapping.category ? { id: mapping.category.id, name: mapping.category.name } : null,
      configuredCategoryId,
      mappingSource: mapping.source,
      requiresInsuranceCategory: topic.requiresInsuranceCategory,
      enabled,
      isConfigurationValid,
      warning: isConfigurationValid
        ? null
        : mapping.source === 'INVALID_SETTING'
          ? 'دستهٔ ذخیره‌شده معتبر یا فعال نیست؛ یک دستهٔ فعال انتخاب کنید.'
          : 'برای این رشتهٔ فعال، دستهٔ بیمه‌ای معتبر ثبت نشده است.',
    };
  });
}

export async function getGoftinoAiPolicyCatalog() {
  const { categories, values } = await loadPolicyData();
  return policyRows(categories, values);
}

export async function getGoftinoAiPolicyAdminData() {
  const { categories, values } = await loadPolicyData();
  return {
    policies: policyRows(categories, values),
    categories: categories.map(({ id, name }) => ({ id, name })),
  };
}

export async function setGoftinoAiPolicyConfiguration(
  topicId: string,
  input: { enabled?: boolean; categoryId?: string | null },
) {
  const topic = GOFTINO_TOPIC_CATALOG.find((item) => item.id === topicId);
  if (!topic) throw new Error('رشتهٔ گفتینو در catalog شناخته‌شده نیست.');
  if (input.enabled === undefined && input.categoryId === undefined) {
    throw new Error('حداقل وضعیت AI یا دستهٔ بیمه‌ای باید مشخص شود.');
  }

  const { categories, values } = await loadPolicyData();
  const categoryKey = goftinoCategorySettingKey(topicId);
  const existingConfiguredCategoryId = values.get(categoryKey)?.trim() || null;
  const requestedCategoryId = input.categoryId === undefined
    ? existingConfiguredCategoryId
    : String(input.categoryId || '').trim() || null;
  const selectedCategory = requestedCategoryId
    ? categories.find((category) => category.id === requestedCategoryId) || null
    : null;
  if (requestedCategoryId && !selectedCategory) {
    throw new Error('دستهٔ بیمه‌ای انتخاب‌شده معتبر یا فعال نیست.');
  }

  const finalEnabled = input.enabled === undefined
    ? values.get(enabledSettingKey(topicId)) === 'true'
    : input.enabled;
  const configurationError = goftinoPolicyConfigurationError(
    topic.requiresInsuranceCategory,
    finalEnabled,
    selectedCategory,
  );
  if (configurationError) throw new Error(configurationError);

  await prisma.$transaction(async (tx) => {
    if (selectedCategory) {
      const stillActive = await tx.insuranceCategory.findFirst({
        where: { id: selectedCategory.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!stillActive) throw new Error('دستهٔ بیمه‌ای انتخاب‌شده دیگر فعال نیست.');
    }
    if (input.enabled !== undefined) {
      await tx.systemSetting.upsert({
        where: { key: enabledSettingKey(topicId) },
        create: { key: enabledSettingKey(topicId), value: String(input.enabled), description: `وضعیت پاسخ AI برای ${topic.title}` },
        update: { value: String(input.enabled) },
      });
    }
    if (input.categoryId !== undefined) {
      if (selectedCategory) {
        await tx.systemSetting.upsert({
          where: { key: categoryKey },
          create: { key: categoryKey, value: selectedCategory.id, description: `دستهٔ بیمه‌ای متصل به ${topic.title}` },
          update: { value: selectedCategory.id },
        });
      } else {
        await tx.systemSetting.deleteMany({ where: { key: categoryKey } });
      }
    }
  });

  const refreshed = await getGoftinoAiPolicyCatalog();
  return refreshed.find((item) => item.id === topicId)!;
}

export async function setGoftinoAiPolicyEnabled(topicId: string, enabled: boolean) {
  return setGoftinoAiPolicyConfiguration(topicId, { enabled });
}
