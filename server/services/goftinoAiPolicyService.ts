import prisma from '../db/client';
import { decideGoftinoAiPolicy, GoftinoAiPolicyInput, GoftinoAiPolicyDecision } from './goftinoAiPolicyDecision';
import { findCategoryForCatalogTopic, GOFTINO_TOPIC_CATALOG } from './goftinoTopicCatalog';

export { decideGoftinoAiPolicy } from './goftinoAiPolicyDecision';
export type { GoftinoAiPolicyInput, GoftinoAiPolicyDecision } from './goftinoAiPolicyDecision';

const SETTING_PREFIX = 'goftino_ai_enabled:';

function settingKey(topicId: string) {
  return `${SETTING_PREFIX}${topicId}`;
}

export async function resolveGoftinoAiPolicy(goftinoTopicId?: string | null): Promise<GoftinoAiPolicyDecision> {
  const topic = GOFTINO_TOPIC_CATALOG.find((item) => item.id === goftinoTopicId) || null;
  if (!topic) return decideGoftinoAiPolicy(null, false);

  const [categories, setting] = await Promise.all([
    prisma.insuranceCategory.findMany({ where: { status: 'ACTIVE' }, select: { id: true, slug: true, name: true, status: true } }),
    prisma.systemSetting.findUnique({ where: { key: settingKey(topic.id) } }),
  ]);
  const category = findCategoryForCatalogTopic(topic, categories);

  return decideGoftinoAiPolicy({
    goftinoTopicId: topic.id,
    goftinoTopicTitle: topic.title,
    insuranceCategoryId: category?.id || null,
  }, setting?.value === 'true');
}

export async function getGoftinoAiPolicyCatalog() {
  const [categories, settings] = await Promise.all([
    prisma.insuranceCategory.findMany({ where: { status: 'ACTIVE' }, select: { id: true, slug: true, name: true, status: true } }),
    prisma.systemSetting.findMany({ where: { key: { startsWith: SETTING_PREFIX } }, select: { key: true, value: true } }),
  ]);
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  return GOFTINO_TOPIC_CATALOG.map((topic) => {
    const category = findCategoryForCatalogTopic(topic, categories);
    return {
      id: topic.id,
      title: topic.title,
      category: category ? { id: category.id, name: category.name } : null,
      enabled: values.get(settingKey(topic.id)) === 'true',
    };
  });
}

export async function setGoftinoAiPolicyEnabled(topicId: string, enabled: boolean) {
  const rows = await getGoftinoAiPolicyCatalog();
  const row = rows.find((item) => item.id === topicId);
  if (!row) throw new Error('رشتهٔ گفتینو در catalog شناخته‌شده نیست.');

  await prisma.systemSetting.upsert({
    where: { key: settingKey(topicId) },
    create: { key: settingKey(topicId), value: String(enabled), description: `وضعیت پاسخ AI برای ${row.title}` },
    update: { value: String(enabled) },
  });
  return { ...row, enabled };
}
