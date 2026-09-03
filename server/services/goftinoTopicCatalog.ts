export type GoftinoTopicCatalogEntry = {
  id: string;
  title: string;
  aliases: readonly string[];
  categoryIdentityCandidates: readonly string[];
};

// Fixed catalog copied from the uploaded Goftino topic list. Category identities
// are internal aliases and are never editable from the administration panel.
export const GOFTINO_TOPIC_CATALOG: readonly GoftinoTopicCatalogEntry[] = [
  {
    id: 'insurance-responsibility',
    title: 'بخش مشاوره و خرید بیمه های مسئولیت',
    aliases: ['بخش مشاوره و خرید بیمه های مسئولیت'],
    categoryIdentityCandidates: ['responsibility', 'مسئولیت', 'بیمه مسئولیت', 'بیمه های مسئولیت'],
  },
  {
    id: 'insurance-fire',
    title: 'بخش مشاوره و خرید بیمه های آتش سوزی',
    aliases: ['بخش مشاوره و خرید بیمه های آتش سوزی'],
    categoryIdentityCandidates: ['fire', 'property', 'آتش سوزی', 'بیمه آتش سوزی', 'بیمه های آتش سوزی', 'اموال'],
  },
  {
    id: 'insurance-vehicle',
    title: 'بخش مشاوره و خرید بیمه های خودرو',
    aliases: ['بخش مشاوره و خرید بیمه های خودرو'],
    categoryIdentityCandidates: ['vehicle', 'auto', 'خودرو', 'بیمه خودرو', 'بیمه های خودرو'],
  },
  {
    id: 'insurance-engineering',
    title: 'بخش مشاوره و خرید بیمه های مهندسی',
    aliases: ['بخش مشاوره و خرید بیمه های مهندسی'],
    categoryIdentityCandidates: ['engineering', 'مهندسی', 'بیمه مهندسی', 'بیمه های مهندسی'],
  },
  {
    id: 'other-insurance',
    title: 'بخش مشاوره و خرید سایر بیمه ها',
    aliases: ['بخش مشاوره و خرید سایر بیمه ها'],
    categoryIdentityCandidates: [],
  },
  {
    id: 'claims',
    title: 'بخش مشاوره خسارت',
    aliases: ['بخش مشاوره خسارت'],
    categoryIdentityCandidates: [],
  },
  {
    id: 'issuance-follow-up',
    title: 'پیگیری درخواست صدور بیمه نامه',
    aliases: ['پیگیری درخواست صدور بیمه نامه'],
    categoryIdentityCandidates: [],
  },
  {
    id: 'partnership',
    title: 'درخواست همکاری با بیمه جم',
    aliases: ['درخواست همکاری با بیمه جم'],
    categoryIdentityCandidates: [],
  },
  {
    id: 'technical-support',
    title: 'پشتیبانی فنی سامانه بیمه جم',
    aliases: ['پشتیبانی فنی سامانه بیمه جم'],
    categoryIdentityCandidates: [],
  },
  {
    id: 'management',
    title: 'ارتباط مستقیم با مدیریت بیمه جم',
    aliases: ['ارتباط مستقیم با مدیریت بیمه جم'],
    categoryIdentityCandidates: [],
  },
];

function normalize(value?: string | null) {
  return String(value || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/[-_]+/g, ' ')
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
  const candidates = new Set(topic.categoryIdentityCandidates.map(normalize));
  return categories.find((category) => {
    if (category.status === 'INACTIVE') return false;
    return candidates.has(normalize(category.slug)) || candidates.has(normalize(category.name));
  }) || null;
}
