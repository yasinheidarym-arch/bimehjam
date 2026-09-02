export type GoftinoTopicCatalogEntry = {
  id: string;
  title: string;
  aliases: readonly string[];
  categorySlugCandidates: readonly string[];
};

// Fixed catalog copied from the uploaded Goftino topic list. An empty category
// mapping is intentional and permanently routes the topic to a human expert.
export const GOFTINO_TOPIC_CATALOG: readonly GoftinoTopicCatalogEntry[] = [
  {
    id: 'insurance-responsibility',
    title: 'بخش مشاوره و خرید بیمه های مسئولیت',
    aliases: ['بخش مشاوره و خرید بیمه های مسئولیت'],
    categorySlugCandidates: ['responsibility'],
  },
  {
    id: 'insurance-fire',
    title: 'بخش مشاوره و خرید بیمه های آتش سوزی',
    aliases: ['بخش مشاوره و خرید بیمه های آتش سوزی'],
    categorySlugCandidates: ['fire', 'property'],
  },
  {
    id: 'insurance-vehicle',
    title: 'بخش مشاوره و خرید بیمه های خودرو',
    aliases: ['بخش مشاوره و خرید بیمه های خودرو'],
    categorySlugCandidates: ['vehicle', 'auto'],
  },
  {
    id: 'insurance-engineering',
    title: 'بخش مشاوره و خرید بیمه های مهندسی',
    aliases: ['بخش مشاوره و خرید بیمه های مهندسی'],
    categorySlugCandidates: ['engineering'],
  },
  {
    id: 'other-insurance',
    title: 'بخش مشاوره و خرید سایر بیمه ها',
    aliases: ['بخش مشاوره و خرید سایر بیمه ها'],
    categorySlugCandidates: [],
  },
  {
    id: 'claims',
    title: 'بخش مشاوره خسارت',
    aliases: ['بخش مشاوره خسارت'],
    categorySlugCandidates: [],
  },
  {
    id: 'issuance-follow-up',
    title: 'پیگیری درخواست صدور بیمه نامه',
    aliases: ['پیگیری درخواست صدور بیمه نامه'],
    categorySlugCandidates: [],
  },
  {
    id: 'partnership',
    title: 'درخواست همکاری با بیمه جم',
    aliases: ['درخواست همکاری با بیمه جم'],
    categorySlugCandidates: [],
  },
  {
    id: 'technical-support',
    title: 'پشتیبانی فنی سامانه بیمه جم',
    aliases: ['پشتیبانی فنی سامانه بیمه جم'],
    categorySlugCandidates: [],
  },
  {
    id: 'management',
    title: 'ارتباط مستقیم با مدیریت بیمه جم',
    aliases: ['ارتباط مستقیم با مدیریت بیمه جم'],
    categorySlugCandidates: [],
  },
];

function normalize(value?: string | null) {
  return String(value || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function findGoftinoCatalogTopic(stableId?: string | null, title?: string | null) {
  const byId = GOFTINO_TOPIC_CATALOG.find((item) => item.id === stableId);
  if (byId) return byId;

  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;
  return GOFTINO_TOPIC_CATALOG.find((item) =>
    item.aliases.some((alias) => normalize(alias) === normalizedTitle),
  ) || null;
}

export function findCategoryForCatalogTopic(
  topic: GoftinoTopicCatalogEntry,
  categories: Array<{ id: string; slug: string; name: string; status?: string }>,
) {
  return categories.find((category) =>
    category.status !== 'INACTIVE' && topic.categorySlugCandidates.includes(category.slug.toLowerCase()),
  ) || null;
}
