export type GoftinoTopicCatalogEntry = {
  id: string;
  title: string;
  aliases: readonly string[];
  categoryIdentityCandidates: readonly string[];
  requiresInsuranceCategory: boolean;
};

// Fixed catalog copied from the uploaded Goftino topic list. Identity candidates
// are retained only as a compatibility fallback until an administrator stores
// an explicit category id for the stable topic id.
export const GOFTINO_TOPIC_CATALOG: readonly GoftinoTopicCatalogEntry[] = [
  {
    id: 'insurance-responsibility',
    title: 'بخش مشاوره و خرید بیمه های مسئولیت',
    aliases: ['بخش مشاوره و خرید بیمه های مسئولیت'],
    categoryIdentityCandidates: ['responsibility', 'مسئولیت', 'بیمه مسئولیت', 'بیمه های مسئولیت'],
    requiresInsuranceCategory: true,
  },
  {
    id: 'insurance-fire',
    title: 'بخش مشاوره و خرید بیمه های آتش سوزی',
    aliases: ['بخش مشاوره و خرید بیمه های آتش سوزی'],
    categoryIdentityCandidates: ['fire', 'property', 'آتش سوزی', 'بیمه آتش سوزی', 'بیمه های آتش سوزی', 'اموال'],
    requiresInsuranceCategory: true,
  },
  {
    id: 'insurance-vehicle',
    title: 'بخش مشاوره و خرید بیمه های خودرو',
    aliases: ['بخش مشاوره و خرید بیمه های خودرو'],
    categoryIdentityCandidates: ['vehicle', 'auto', 'خودرو', 'بیمه خودرو', 'بیمه های خودرو'],
    requiresInsuranceCategory: true,
  },
  {
    id: 'insurance-engineering',
    title: 'بخش مشاوره و خرید بیمه های مهندسی',
    aliases: ['بخش مشاوره و خرید بیمه های مهندسی'],
    categoryIdentityCandidates: ['engineering', 'مهندسی', 'بیمه مهندسی', 'بیمه های مهندسی'],
    requiresInsuranceCategory: true,
  },
  {
    id: 'other-insurance',
    title: 'بخش مشاوره و خرید سایر بیمه ها',
    aliases: ['بخش مشاوره و خرید سایر بیمه ها'],
    categoryIdentityCandidates: [],
    requiresInsuranceCategory: true,
  },
  {
    id: 'claims',
    title: 'بخش مشاوره خسارت',
    aliases: ['بخش مشاوره خسارت'],
    categoryIdentityCandidates: [],
    requiresInsuranceCategory: true,
  },
  {
    id: 'issuance-follow-up',
    title: 'پیگیری درخواست صدور بیمه نامه',
    aliases: ['پیگیری درخواست صدور بیمه نامه'],
    categoryIdentityCandidates: [],
    requiresInsuranceCategory: false,
  },
  {
    id: 'partnership',
    title: 'درخواست همکاری با بیمه جم',
    aliases: ['درخواست همکاری با بیمه جم'],
    categoryIdentityCandidates: [],
    requiresInsuranceCategory: false,
  },
  {
    id: 'technical-support',
    title: 'پشتیبانی فنی سامانه بیمه جم',
    aliases: ['پشتیبانی فنی سامانه بیمه جم'],
    categoryIdentityCandidates: [],
    requiresInsuranceCategory: false,
  },
  {
    id: 'management',
    title: 'ارتباط مستقیم با مدیریت بیمه جم',
    aliases: ['ارتباط مستقیم با مدیریت بیمه جم'],
    categoryIdentityCandidates: [],
    requiresInsuranceCategory: false,
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
