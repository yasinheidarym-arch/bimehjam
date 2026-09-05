import prisma from '../db/client';

export interface ProductMapSeedItem {
  product_name: string;
  category: string;
  type: string;
  urls: string[];
  quotation_enabled: boolean;
  quotation_questions?: Array<{
    title: string;
    fieldName: string;
    type: string;
    options?: string;
    required?: boolean;
    order?: number;
  }>;
  knowledge_required?: string[];
}

export const INITIAL_PRODUCT_MAP_SEED: ProductMapSeedItem[] = [
  {
    product_name: 'بیمه شخص ثالث خودرو',
    category: 'خودرو',
    type: 'quotation',
    urls: [
      '/شخص-ثالث-خودرو',
      '/third-party-insurance',
      '/thirdparty-insurance',
      '/third-party-insurance/price/1403',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'نوع و برند خودرو (مثلا پراید، پژو ۲۰۶، دنا)', fieldName: 'vehicle_model', type: 'text', required: true, order: 1 },
      { title: 'سال ساخت خودرو (شمسی)', fieldName: 'build_year', type: 'number', required: true, order: 2 },
      { title: 'سابقه تخفیف عدم خسارت (سال)', fieldName: 'discount_years', type: 'number', required: true, order: 3 },
    ],
    knowledge_required: ['coverage', 'price', 'claims', 'renewal'],
  },
  {
    product_name: 'بیمه بدنه خودرو',
    category: 'خودرو',
    type: 'quotation',
    urls: ['/بیمه-بدنه-خودرو', '/badaneh'],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'ارزش تقریبی روز خودرو (تومان)', fieldName: 'car_value', type: 'number', required: true, order: 1 },
      { title: 'آیا پوشش سرقت درجا یا نوسان قیمت می‌خواهید؟', fieldName: 'extra_coverages', type: 'boolean', required: false, order: 2 },
    ],
    knowledge_required: ['coverage', 'deductible', 'damage'],
  },
  {
    product_name: 'بیمه موتورسیکلت',
    category: 'خودرو',
    type: 'quotation',
    urls: ['/motorcycle-insurance'],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'نوع موتورسیکلت (دنده‌ای، برقی، سه چرخ)', fieldName: 'motor_type', type: 'text', required: true, order: 1 },
      { title: 'سال ساخت موتورسیکلت', fieldName: 'build_year', type: 'number', required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه درمان مسافرتی',
    category: 'درمان',
    type: 'quotation',
    urls: [
      '/بیمه-درمان-مسافرتی',
      '/2107_بیمه-درمان-مسافرتی',
      '/خرید-آنلاین-بهترین-و-ارزانترین-بیمه-تورهای-مسافرتی',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'کشور یا منطقه مقصد سفر', fieldName: 'destination_country', type: 'text', required: true, order: 1 },
      { title: 'مدت زمان مسافرت (روز)', fieldName: 'travel_days', type: 'number', required: true, order: 2 },
      { title: 'سن مسافر یا مسافران', fieldName: 'passenger_age', type: 'number', required: true, order: 3 },
    ],
  },
  {
    product_name: 'بیمه آتش سوزی',
    category: 'اموال',
    type: 'quotation',
    urls: [
      '/بیمه-آتش-سوزی',
      '/آتش-سوزی',
      '/fire',
      '/home-fire-insurance-quote',
      '/home-fire-insurance-buy-now',
      '/residential-complex-fire-insurance',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'متراژ دقیق بنا (مترمربع)', fieldName: 'building_area', type: 'number', required: true, order: 1 },
      { title: 'ارزش تقریبی اثاثیه و لوازم منزل (تومان)', fieldName: 'furniture_value', type: 'number', required: true, order: 2 },
      { title: 'آیا پوشش زلزله و سرقت نیز افزوده شود؟', fieldName: 'include_earthquake', type: 'boolean', required: true, order: 3 },
    ],
  },
  {
    product_name: 'بیمه حوادث انفرادی',
    category: 'اشخاص',
    type: 'quotation',
    urls: ['/بیمه-حوادث-انفرادی'],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'شغل و حرفه اصلی بیمه‌شده', fieldName: 'job_title', type: 'text', required: true, order: 1 },
      { title: 'سقف سرمایه فوت و نقص عضو درخواستی (تومان)', fieldName: 'coverage_amount', type: 'number', required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه مسئولیت مدیر ساختمان',
    category: 'مسئولیت',
    type: 'quotation',
    urls: [
      '/liability-insurance/building-managers',
      '/insurance-for-building-managers',
      '/insurance-of-building-managers',
      '/building-manager-legal-liability',
      '/building-manager-elevator-accident-liability',
      '/building-manager-common-area-fire-liability',
      '/building-manager-parking-liability',
      '/building-manager-gas-leak-explosion-liability',
      '/building-manager-fall-accident-liability',
      '/building-manager-water-leak-liability',
      '/building-manager-liability-insurance-coverage',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'تعداد طبقات ساختمان (با احتساب پارکینگ)', fieldName: 'building_floors', type: 'number', required: true, order: 1 },
      { title: 'تعداد کل واحدهای مسکونی یا اداری', fieldName: 'unit_count', "type": 'number', required: true, order: 2 },
      { title: 'تعداد دستگاه آسانسور فعال', fieldName: 'elevator_count', type: 'number', required: true, order: 3 },
      { title: 'آیا ساختمان دارای سنگ‌نما می‌باشد؟', fieldName: 'has_stone_facade', type: 'boolean', required: true, order: 4 },
      { title: 'کاربری اصلی ساختمان', fieldName: 'building_usage', type: 'select', options: JSON.stringify(['مسکونی', 'اداری', 'تجاری', 'مختلط']), required: true, order: 5 },
    ],
    knowledge_required: ['coverage', 'building_rules', 'claims'],
  },
  {
    product_name: 'بیمه مسئولیت کارفرما',
    category: 'مسئولیت',
    type: 'quotation',
    urls: [
      '/building-construction-employer-insurance',
      '/non-construction-employer-insurance',
      '/employer-liability-insurance-additional-coverages',
      '/employer-liability-construction-accidents',
      '/worker-fall-scaffolding-employer-liability',
      '/construction-worker-death-compensation',
      '/construction-worker-injury-liability',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'نوع کارگاه یا پروژه (ساختمانی یا غیرساختمانی)', fieldName: 'project_type', type: 'select', options: JSON.stringify(['ساختمانی', 'صنعتی و کارخانجات', 'Dخدماتی و تجاری']), required: true, order: 1 },
      { title: 'حداکثر تعداد کارگران همزمان', fieldName: 'worker_count', type: 'number', required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه مسئولیت مهندسی',
    category: 'مسئولیت',
    type: 'quotation',
    urls: [
      '/liability-insurance/engineering',
      '/engineering-insurance/latent-defects-of-building',
      '/engineering-services-tariffs',
      '/civil-project-employer-insurance',
      '/all-risk-insurance/contractors',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'رشته مهندسی (عمران، معماری، برق، مکانیک، نقشه برداری)', fieldName: 'engineering_field', type: 'text', required: true, order: 1 },
      { title: 'پایه پروانه اشتغال نظام مهندسی', fieldName: 'license_grade', type: 'select', options: JSON.stringify(['پایه ۱', 'پایه ۲', 'پایه ۳', 'ارشد/خارج از نظام']), required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه مسئولیت پزشکان',
    category: 'مسئولیت',
    type: 'quotation',
    urls: [
      '/medical-liability-insurance',
      '/midwife-liability-insurance',
      '/cosmetic-surgeons-liability-insurance',
      '/nurse-liability-insurance',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'تخصص جراحی یا طبابت عمومی', fieldName: 'specialty', type: 'text', required: true, order: 1 },
      { title: 'آیا اعمال جراحی زیبایی یا بیهوشی انجام می‌دهید؟', fieldName: 'has_surgery', type: 'boolean', required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه مسئولیت مراکز درمانی',
    category: 'مسئولیت',
    type: 'quotation',
    urls: ['/parsian-insurance-medical-centers'],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'نوع مرکز (بیمارستان، درمانگاه، کلینیک، درمانگاه شبانه‌روزی)', fieldName: 'center_type', type: 'text', required: true, order: 1 },
      { title: 'تعداد تخت‌های بستری فعال', fieldName: 'bed_count', type: 'number', required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه مسئولیت مراکز آموزشی',
    category: 'مسئولیت',
    type: 'quotation',
    urls: [
      '/insurance-liability-educational-centers',
      '/child-care-liability-insurance',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'نوع مرکز (مدرسه، مهدکودک، آموزشگاه زبان، دانشگاه)', fieldName: 'school_type', type: 'text', required: true, order: 1 },
      { title: 'حداکثر ظرفیت فراگیران/دانش‌آموزان', fieldName: 'student_capacity', type: 'number', required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه مسئولیت باشگاه ورزشی',
    category: 'مسئولیت',
    type: 'quotation',
    urls: [
      '/health-club-insurance',
      '/sports-club-license',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'رشته‌های ورزشی فعال در سالن (بدنسازی، رزمی، آبی، توپی)', fieldName: 'sports_type', type: 'text', required: true, order: 1 },
      { title: 'مساحت سالن ورزشی (مترمربع)', fieldName: 'gym_area', type: 'number', required: true, order: 2 },
    ],
  },
  {
    product_name: 'بیمه مسئولیت مشاغل خاص',
    category: 'مسئولیت',
    type: 'quotation',
    urls: [
      '/liability-insurance-for-technical-managers-of-pharmacies',
      '/liability-insurance-for-garages',
      '/hall-manager-liability-insurance',
      '/facade-liability-insurance',
      '/boat-jet-ski-insurance',
      '/villa-suite-liability-insurance',
    ],
    quotation_enabled: true,
    quotation_questions: [
      { title: 'عنوان شغل یا کسب‌وکار خاص', fieldName: 'job_business_title', type: 'text', required: true, order: 1 },
      { title: 'آدرس و شهر محل فعالیت', fieldName: 'location_address', type: 'text', required: true, order: 2 },
    ],
  },
];

/**
 * Ensures Product Map seeding in database
 */
export async function seedProductMapData() {
  const urlMapCount = await prisma.productUrlMap.count();
  if (urlMapCount > 0) return;

  console.log('🌱 Seeding Product Map Data into Database...');

  for (const item of INITIAL_PRODUCT_MAP_SEED) {
    // Create or find Insurance Product
    let product = await prisma.insuranceProduct.findFirst({
      where: { name: item.product_name },
    });

    if (!product) {
      const uniqueSlug = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      try {
        product = await prisma.insuranceProduct.create({
          data: {
            name: item.product_name,
            slug: uniqueSlug,
            category: item.category,
            description: `پوشش تخصصی و استعلام آنلاین ${item.product_name} در بیمه جم`,
            status: 'ACTIVE',
            coverage: `پوشش کامل جانی و مالی مرتبط با ${item.product_name}`,
            benefits: 'ارسال رایگان بیمه‌نامه، تخفیف نقد و اقساط ویژه',
            requiredDocuments: 'تصویر کارت ملی، مشخصات کامل، استعلام استانداردهای مربوطه',
          },
        });
      } catch (err) {
        console.warn('Failed creating insurance product, attempting lookup:', item.product_name, err);
        product = await prisma.insuranceProduct.findFirst({
          where: { name: item.product_name },
        });
      }
    }

    if (!product) continue;

    // Add Quotation Questions
    if (item.quotation_questions && item.quotation_questions.length > 0) {
      for (const q of item.quotation_questions) {
        const existingQ = await prisma.quotationQuestion.findFirst({
          where: { productId: product.id, fieldName: q.fieldName },
        });

        if (!existingQ) {
          await prisma.quotationQuestion.create({
            data: {
              productId: product.id,
              title: q.title,
              fieldName: q.fieldName,
              type: q.type,
              options: q.options || '[]',
              required: q.required !== undefined ? q.required : true,
              order: q.order || 1,
            },
          });
        }
      }
    }

    // Add URL maps
    for (const rawUrl of item.urls) {
      const cleanUrl = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
      const existingUrl = await prisma.productUrlMap.findUnique({
        where: { url: cleanUrl },
      });

      if (!existingUrl) {
        await prisma.productUrlMap.create({
          data: {
            url: cleanUrl,
            pageTitle: item.product_name,
            productId: product.id,
            category: item.category,
            productType: item.type || 'quotation',
            quotationEnabled: item.quotation_enabled,
            aiEnabled: true,
            relatedKnowledge: JSON.stringify(item.knowledge_required || ['coverage', 'claims']),
          },
        });
      }
    }
  }

  console.log('✅ Product Map Data Seeding Completed!');
}

/**
 * Normalizes input URL/Path to match DB entries
 */
export function normalizeUrlPath(urlOrPath: string): string {
  if (!urlOrPath) return '';
  let clean = urlOrPath.trim();
  // Remove protocol and host if full URL
  if (clean.includes('://')) {
    try {
      const parsed = new URL(clean);
      clean = parsed.pathname;
    } catch {
      clean = clean.replace(/^https?:\/\/[^\/]+/, '');
    }
  }

  // Ensure leading slash
  if (!clean.startsWith('/')) {
    clean = '/' + clean;
  }

  // Remove trailing slash if longer than 1 char
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }

  return clean;
}

/**
 * Resolves an incoming URL/Path to its exact Insurance Product & Quotation Questions
 */
export async function resolveProductByUrl(urlOrPath: string, options: { seedIfEmpty?: boolean } = {}) {
  if (options.seedIfEmpty !== false) {
    await seedProductMapData();
  }

  const cleanPath = normalizeUrlPath(urlOrPath);
  if (!cleanPath) return null;

  // 1. Direct exact URL match
  let mapEntry = await prisma.productUrlMap.findFirst({
    where: {
      OR: [
        { url: cleanPath },
        { url: decodeURIComponent(cleanPath) },
        { url: encodeURI(cleanPath) },
      ],
    },
    include: {
      product: {
        include: {
          quotationQuestions: {
            orderBy: { order: 'asc' },
          },
          knowledgeItems: true,
        },
      },
    },
  });

  // 2. Suffix / Contains fallback search if direct match fails
  if (!mapEntry) {
    const allMaps = await prisma.productUrlMap.findMany({
      include: {
        product: {
          include: {
            quotationQuestions: {
              orderBy: { order: 'asc' },
            },
            knowledgeItems: true,
          },
        },
      },
    });

    const decoded = decodeURIComponent(cleanPath);
    mapEntry = allMaps.find(
      (m) =>
        m.url === decoded ||
        decoded.includes(m.url) ||
        m.url.includes(decoded) ||
        decoded.replace(/\//g, '').includes(m.url.replace(/\//g, ''))
    ) || null;
  }

  return mapEntry;
}

/**
 * Generates specific AI Context Block for System Prompt when a customer visits a product URL
 */
export async function generateProductAiContextBlock(customerUrl?: string) {
  if (!customerUrl) return '';

  const mapped = await resolveProductByUrl(customerUrl);
  if (!mapped || !mapped.product) return '';

  const p = mapped.product;
  const questionsList = p.quotationQuestions
    .map((q, idx) => `  ${idx + 1}. [${q.title}] (نام فیلد: ${q.fieldName}, نوع: ${q.type})`)
    .join('\n');

  return `
🎯 هوشمندی ورودی مشتری (Product URL Intelligence):
- مشتری هم‌اکنون از صفحه رسمی محصول زیر وارد چت شده است:
  * نام محصول شناسایی‌شده: "${p.name}"
  * آدرس صفحه ورود: "${mapped.url}"
  * دسته‌بندی: "${p.category}"
  * استعلام قیمت فعال: ${mapped.quotationEnabled ? 'بله' : 'خیر'}

🛑 قانون طلایی و غدقن صریح:
هرگز از مشتری سوال نپرسید: "چه بیمه‌ای نیاز دارید؟" یا "در چه زمینه‌ای می‌توانم کمکتان کنم؟".
چون هوش مصنوعی بیمه جم از روی URL مشتری متوجه شده است که او دقیقاً متقاضی "${p.name}" می‌باشد.

📋 فرآیند استعلام قیمت این محصول:
بلافاصله بعد از سلام و احترام اولیه، مشاوره تخصصی ${p.name} را شروع کنید و سوالات زیر را به ترتیب جهت محاسبه قیمت بپرسید:
${questionsList || '  - دریافت مشخصات دقیق پروژه/ساختمان/خودرو جهت استعلام قیمت.'}

📚 دانش تخصصی مصوب محصول:
- معرفی: ${p.introduction || p.description}
- پوشش‌ها: ${p.coverage || 'کامل'}
- استثنائات: ${p.exclusions || 'طبق شرایط عمومی بیمه‌نامه'}
- مدارک لازم: ${p.requiredDocuments || 'تصویر کارت شناسایی'}
`;
}
