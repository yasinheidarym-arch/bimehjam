import prisma from '../db/client';
import { categoryKnowledgeScope, composeScopedKnowledge } from './categoryKnowledgeScope';

export function stripUnverifiedOperationalClaims(value: string): string {
  return String(value || '')
    .replace(/[^\n.؟!]*(?:کد\s*یکتا|کمتر از\s*[۰-۹0-9]+\s*دقیقه|زمان\s*تضمینی)[^\n.؟!]*[.؟!]?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CATEGORY_DB_MAP: Record<string, string> = {
  VEHICLE: 'خودرو',
  HEALTH: 'درمان',
  PROPERTY: 'اموال',
  RESPONSIBILITY: 'مسئولیت',
};


export interface ExtractedKnowledgePayload {
  matchedProduct: {
    id: string;
    name: string;
    category: string;
    purchaseUrl: string | null;
    description: string;
    coverage: string;
    purchaseConditions: string;
    exclusions: string;
    benefits: string;
  } | null;
  quotationWorkflow: {
    totalQuestions: number;
    allQuestions: Array<{
      order: number;
      title: string;
      fieldName: string;
      aiQuestion: string;
      required: boolean;
      type: string;
      options?: string[];
    }>;
    answeredFields: Record<string, any>;
    nextQuestion: {
      order: number;
      title: string;
      fieldName: string;
      aiQuestion: string;
      options?: string[];
    } | null;
    isCompleted: boolean;
  } | null;
  relevantFaqs: Array<{
    id: string;
    question: string;
    answer: string;
    insuranceType: string;
  }>;
  matchedObjections: Array<{
    id: string;
    objection: string;
    recommendedResponse: string;
    responseGoal: string;
  }>;
  appliedRules: Array<{
    id: string;
    title: string;
    directive: string;
    enforcementLevel: string;
    category: string;
  }>;
  promptFormattedKnowledge: string;
  promptFormattedRules: string;
  productKnowledgeAvailable: boolean;
  productSelectionRequired: boolean;
  noRelevantKnowledge: boolean;
  matchedCategory: string | null;
  matchedCategoryId: string | null;
  matchedSubCategory: string | null;
  relevantArticles: Array<{ id: string; title: string; content: string }>;
}

/**
 * Ensure database is properly seeded with rich initial AI Training Center data
 */
export async function ensureTrainingCenterSeeded() {
  // Seed disabled: AI Training Center is fully managed from UI panel.
  return;

  // 1. Check & Seed AI Behavior Rules
  const rulesCount = await prisma.aiRule.count();
  if (rulesCount === 0) {
    await prisma.aiRule.createMany({
      data: [
        {
          title: 'ممنوعیت حدس و اعلام قیمت قطعی بدون مشخصات (Never Guess Prices)',
          directive: 'هرگز قیمت قطعی یا تخمینی را بدون دریافت کامل مشخصات خودرو/ملک (مانند سال ساخت، تخفیف عدم خسارت، پوشش درخواستی) حدس نزنید. همیشه به مشتری توضیح دهید که برای محاسبه دقیق نرخ مصوب بیمه مرکزی، نیاز به مشخصات دارید و سوالات مربوطه را بپرسید.',
          category: 'PRICE_SAFETY',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
          sortOrder: 1,
        },
        {
          title: 'الزام به پرسیدن سوالات استعلام قیمت به ترتیب (Ask Quotation Questions)',
          directive: 'هنگام استعلام قیمت بیمه، اطلاعات ناقص را از طریق سوالات مرحله‌ای (مدل، سال ساخت، درصد تخفیف عدم خسارت، سوابق خسارت) به صورت محترمانه و کوتاه استخراج کنید.',
          category: 'QUOTATION_WORKFLOW',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
          sortOrder: 2,
        },
        {
          title: 'لحن صمیمی، گرم، محترمانه و انسانی (Tone of Voice)',
          directive: 'لحن شما باید کاملاً انسان‌گونه، صمیمی، متخصص و با احترام ایرانی باشد. از کلمات کلیشه‌ای رباتیک مانند "امیدوارم حالتون عالی باشه"، "به عنوان یک هوش مصنوعی" یا "من یک مدل زبانی هستم" اکیداً خودداری کنید.',
          category: 'TONE',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
          sortOrder: 3,
        },
        {
          title: 'ممنوعیت ارجاع کلیشه‌ای "با ما تماس بگیرید" (Avoid Evasive Responses)',
          directive: 'هرگز پاسخ‌های طفره‌آمیز و کلیشه‌ای مانند "جهت کسب اطلاعات بیشتر با شرکت تماس بگیرید" ندهید. به تمامی سوالات به صورت مستقیم و کامل در چت پاسخ دهید.',
          category: 'FORBIDDEN_PHRASES',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
          sortOrder: 4,
        },
        {
          title: 'پاسخگویی هوشمندانه به اعتراض قیمت و رقبا (Objection Handling)',
          directive: 'در مواجهه با اعتراض به قیمت یا مقایسه با سایر شرکت‌ها، فقط مزایای ثبت‌شده و قابل‌اثبات بیمه جم را بیان کنید و دربارهٔ زمان صدور یا نتیجهٔ ثبت تضمین ندهید.',
          category: 'OBJECTION_HANDLING',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
          sortOrder: 5,
        },
        {
          title: 'ارجاع پرونده به کارشناس پس از تکمیل استعلام (Human Hand-off)',
          directive: 'پس از دریافت تمامی مشخصات لازم برای استعلام، به مشتری اطمینان دهید که اطلاعات ثبت شده و کارشناس رسمی بیمه جم نرخ دقیق را محاسبه کرده و در سریع‌ترین زمان ارسال می‌نماید.',
          category: 'HUMAN_TRANSFER',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
          sortOrder: 6,
        },
      ],
    });
  }

  // 2. Check & Seed Insurance Products & Quotation Questions
  const productsCount = await prisma.insuranceProduct.count();
  if (productsCount === 0) {
    await prisma.insuranceProduct.create({
      data: {
        name: 'بیمه شخص ثالث خودرو',
        slug: 'third-party-car-insurance',
        category: 'VEHICLE',
        description: 'بیمه اجباری شخص ثالث کلیه خودروهای سواری (پژو، پراید، سمند، تارا، دنا و انواع خودروهای خارجی) با پوشش دیه جانی و خسارات مالی به اشخاص ثالث.',
        status: 'ACTIVE',
        introduction: 'بیمه شخص ثالث خسارات مالی و جانی وارد شده به اشخاص ثالث در حوادث رانندگی و همچنین خسارت جانی راننده مقصر حادثه را طبق دیه قانونی جبران می‌نماید.',
        coverage: 'دیه فوت و نقص عضو تا سقف قانونی سال ۱۴۰۴/۱۴۰۵ (۱.۶ میلیارد تومان)، خسارت مالی اشخاص ثالث از ۴۰ میلیون تا ۸۰۰ میلیون تومان، حوادث راننده مقصر.',
        exclusions: 'خسارت وارده به خودروی راننده مقصر، خسارات ناشی از عمد و تبانی، حوادث ناشی از مسکرات یا بدون گواهینامه معتبر.',
        benefits: 'امکان پرداخت اقساطی و انتقال سوابق تخفیف عدم خسارت مطابق شرایط تأییدشده محصول.',
        purchaseConditions: 'ارائه تصویر کارت خودرو یا برگ سبز، کارت ملی مالک و بیمه‌نامه سال قبل.',
        renewalRules: 'تخفیف عدم خسارت سالانه ۵٪ محاسبه شده و حداکثر تا ۷۰٪ (۱۴ سال) اعمال می‌گردد.',
        claimProcess: 'اعلام حادثه ظرف ۵ روز، دریافت خسارت مالی بدون کروکی تا سقف ۴۰ میلیون تومان در مراکز پرداخت خسارت بیمه جم.',
        quotationQuestions: {
          create: [
            {
              title: 'نوع و مدل خودرو',
              aiQuestion: 'مدل خودروی شما چیست؟ (مثلاً پژو ۲۰۶، پژو پارس، پراید یا...)',
              fieldName: 'car_model',
              type: 'text',
              required: true,
              order: 1,
              placeholder: 'مثلاً پژو ۲۰۶ تیپ ۲',
            },
            {
              title: 'سال ساخت خودرو',
              aiQuestion: 'سال ساخت خودرو چه سالی است؟ (شمسی یا میلادی)',
              fieldName: 'manufacturing_year',
              type: 'number',
              required: true,
              order: 2,
              placeholder: 'مثلاً ۱۳۹۹ یا ۱۴۰۱',
            },
            {
              title: 'درصد یا سال‌های تخفیف عدم خسارت',
              aiQuestion: 'روی بیمه‌نامه قبلی چند سال یا چند درصد تخفیف عدم خسارت دارید؟',
              fieldName: 'no_claim_discount',
              type: 'text',
              required: true,
              order: 3,
              placeholder: 'مثلاً ۳ سال (۱۵٪) یا صفر برای سال اول',
            },
            {
              title: 'سابقه دریافت خسارت مالی یا جانی',
              aiQuestion: 'آیا در سال گذشته از بیمه شخص ثالث قبلی خسارت دریافت کرده‌اید؟',
              fieldName: 'claim_history',
              type: 'select',
              options: JSON.stringify(['خیر، بدون دریافت خسارت', 'بله، یک بار خسارت مالی', 'بله، خسارت جانی']),
              required: false,
              order: 4,
            },
            {
              title: 'سقف تعهدات مالی مورد نظر',
              aiQuestion: 'چه سقف پوشش مالی برای جبران خسارت به خودروهای دیگر مد نظر دارید؟',
              fieldName: 'financial_coverage_limit',
              type: 'select',
              options: JSON.stringify(['۴۰ میلیون تومان (پایه اجباری)', '۱۰۰ میلیون تومان', '۲۰۰ میلیون تومان', '۸۰۰ میلیون تومان (حداکثر)']),
              required: false,
              order: 5,
            },
          ],
        },
      },
    });

    await prisma.insuranceProduct.create({
      data: {
        name: 'بیمه بدنه خودرو',
        slug: 'body-car-insurance',
        category: 'VEHICLE',
        description: 'جبران خسارات وارده به خودروی بیمه‌گذار در اثر تصادف، واژگونی، آتش‌سوزی، صاعقه، انفجار و سرقت کلی و جزئی قطعات.',
        status: 'ACTIVE',
        coverage: 'تصادف و برخورد با اجسام ثابت یا متحرک، سرقت کلی و جزئی رینگ، لاستیک و سیستم صوتی، بلایای طبیعی، شکست شیشه، پاشیدن اسید و رنگ.',
        benefits: 'کارشناسی و بازدید رایگان در محل مشتری در سراسر تهران و مراکز استان‌ها، تخفیف عدم خسارت تا ۷۰٪، پرداخت اقساطی در ۴ قسط.',
        purchaseConditions: 'ارائه کارت خودرو و بازدید سلامت بدنه توسط کارشناس بیمه جم.',
        quotationQuestions: {
          create: [
            {
              title: 'مدل و سال ساخت خودرو',
              aiQuestion: 'مدل و سال ساخت خودرو را بفرمایید:',
              fieldName: 'car_model_year',
              type: 'text',
              required: true,
              order: 1,
            },
            {
              title: 'ارزش روز خودرو (تومان)',
              aiQuestion: 'ارزش تقریبی روز خودروی شما چقدر است؟',
              fieldName: 'vehicle_market_value',
              type: 'number',
              required: true,
              order: 2,
            },
            {
              title: 'سابقه تخفیف بیمه بدنه یا ثالث',
              aiQuestion: 'آیا تخفیف عدم خسارت بیمه بدنه یا ثالث برای اعمال روی بیمه‌نامه دارید؟',
              fieldName: 'body_discount_years',
              type: 'text',
              required: false,
              order: 3,
            },
          ],
        },
      },
    });

    await prisma.insuranceProduct.create({
      data: {
        name: 'بیمه درمان تکمیلی انفرادی و خانواده',
        slug: 'supplementary-health-insurance',
        category: 'HEALTH',
        description: 'جبران هزینه‌های درمانی بیمارستانی، جراحی، زایمان، دندانپزشکی، دارو، ویزیت و پاراکلینیکی بدون نیاز به بیمه پایه.',
        status: 'ACTIVE',
        coverage: 'بستری و جراحی عمومی و تخصصی، زایمان و نازایی، دندانپزشکی، خدمات پاراکلینیکی (ام‌آر‌آی، سونوگرافی)، ویزیت و دارو.',
        benefits: 'معرفی‌نامه آنلاین با بیش از ۳۵۰۰ مرکز درمانی و بیمارستانی طرف قرارداد، پرداخت خسارت آنلاین ظرف ۴۸ ساعت.',
        purchaseConditions: 'تکمیل پرسشنامه سلامت و حداکثر سن ۶۵ سال برای طرح‌های انفرادی.',
      },
    });

    await prisma.insuranceProduct.create({
      data: {
        name: 'بیمه آتش‌سوزی و زلزله منازل و کارگاه‌ها',
        slug: 'fire-property-insurance',
        category: 'PROPERTY',
        description: 'پوشش آتش‌سوزی، انفجار، صاعقه، زلزله، سیل، ترکیدگی لوله و سرقت با اثاثیه منازل مسکونی، اداری و صنعتی.',
        status: 'ACTIVE',
        coverage: 'سازه بنا، تأسیسات و اثاثیه منزل در برابر آتش‌سوزی، صاعقه، انفجار، زلزله و سرقت با شکست حرز.',
        benefits: 'پوشش غرامت فوت و نقص عضو ساکنین ناشی از حوادث تحت پوشش، پوشش مسئولیت سرایت حریق به همسایگان.',
      },
    });
  }

  // 3. Check & Seed FAQs
  const faqCount = await prisma.fAQ.count();
  if (faqCount === 0) {
    await prisma.fAQ.createMany({
      data: [
        {
          question: 'قیمت بیمه شخص ثالث چگونه محاسبه می‌شود و چرا قیمت دقیق به سال ساخت بستگی دارد؟',
          answer: 'نرخ پایه بیمه شخص ثالث بر اساس جدول مصوب بیمه مرکزی و تعداد سیلندر خودرو تعیین می‌شود؛ سپس بر اساس سال ساخت (جریمه کهنگی برای خودروهای بالای ۱۵ سال)، درصد تخفیف عدم خسارت (سالانه ۵٪ تا سقف ۷۰٪)، سوابق خسارت و سقف تعهد مالی انتخابی، قیمت دقیق محاسبه می‌گردد.',
          insuranceType: 'بیمه خودرو',
          keywords: 'قیمت, محاسبه, ثالث, سال ساخت, تخفیف',
          priority: 10,
        },
        {
          question: 'شرایط خرید اقساطی بیمه شخص ثالث در بیمه جم چگونه است؟',
          answer: 'در بیمه جم می‌توانید بیمه‌نامه شخص ثالث را با پرداخت ۳۰٪ تا ۵۰٪ به صورت پیش‌پرداخت نقدی و مابقی را در ۲ الی ۴ قسط ماهانه بدون نیاز به چک و سفته و بدون کارمزد اضافی دریافت کنید. صدور و فعال‌سازی بیمه‌نامه آنی است.',
          insuranceType: 'بیمه خودرو',
          keywords: 'اقساط, بدون چک, پیش پرداخت, شخص ثالث',
          priority: 9,
        },
        {
          question: 'چگونه سوابق تخفیف عدم خسارت بیمه شخص ثالث را انتقال دهیم؟',
          answer: 'سوابق تخفیف عدم خسارت متعلق به راننده/مالک است و می‌توان آن را به خودروی جدید شخص یا همسر، والدین و فرزندان انتقال داد. انتقال تخفیف با مدارک هویتی در نمایندگی‌های بیمه جم به صورت آنلاین انجام می‌شود.',
          insuranceType: 'بیمه خودرو',
          keywords: 'انتقال تخفیف, سابقه عدم خسارت, تعویض پلاک',
          priority: 8,
        },
        {
          question: 'حداکثر سقف تعهدات مالی بیمه شخص ثالث چقدر است؟',
          answer: 'حداقل تعهد مالی قانونی اجباری ۴۰ میلیون تومان است؛ اما بیمه‌گذاران محترم می‌توانند برای جلوگیری از خسارات خودروهای گران‌قیمت، سقف تعهدات را تا ۱۰۰، ۲۰۰، ۴۰۰ یا ۸۰۰ میلیون تومان افزایش دهند.',
          insuranceType: 'بیمه خودرو',
          keywords: 'سقف تعهدات, پوشش مالی, خسارت ثالث',
          priority: 7,
        },
      ],
    });
  }

  // 4. Check & Seed Customer Objections
  const objectionCount = await prisma.customerObjection.count();
  if (objectionCount === 0) {
    await prisma.customerObjection.createMany({
      data: [
        {
          objection: 'چرا قیمت قطعی را در پیام اول نمی‌گویید و سوال می‌پرسید؟',
          recommendedResponse: 'به دلیل اینکه نرخ مصوب بیمه مرکزی وابسته به سال ساخت، سال‌های تخفیف عدم خسارت قبلی و نوع کاربری خودروی شماست؛ با دریافت این ۳ مورد مشخص، دقیق‌ترین نرخ قانونی با بیشترین تخفیف مجاز برای شما محاسبه و ارسال می‌شود.',
          responseGoal: 'شفاف‌سازی وابستگی نرخ به متغیرها و جلب همکاری مشتری برای تکمیل اطلاعات',
          category: 'قیمت',
          status: 'ACTIVE',
        },
        {
          objection: 'قیمت شما از سایر سامانه‌ها گران‌تر است / شرکت دیگر تخفیف بیشتری می‌دهد',
          recommendedResponse: 'نرخ و شرایط نهایی فقط پس از استعلام واقعی مشخص می‌شود؛ مزایای قابل‌اثبات و شرایط پرداخت ثبت‌شدهٔ محصول را توضیح دهید.',
          responseGoal: 'تاکید بر ارزش افزوده و خدمات پس از فروش و اقساط بدون بهره',
          category: 'رقابت و قیمت',
          status: 'ACTIVE',
        },
        {
          objection: 'آیا برای خرید اقساطی چک یا سفته و ضامن نیاز است؟',
          recommendedResponse: 'خیر! در بیمه جم خرید اقساطی شخص ثالث و بدنه کاملاً بدون نیاز به چک، سفته یا ضامن انجام می‌شود و صرفاً با پیش‌پرداخت اولیه، بیمه‌نامه شما معتبر و در سامانه سنهاب بیمه مرکزی ثبت می‌گردد.',
          responseGoal: 'رفع تردید اعتباری و تسهیل خرید',
          category: 'اقساط',
          status: 'ACTIVE',
        },
      ],
    });
  }

  // 5. Check & Seed Knowledge Articles
  const articleCount = await prisma.knowledgeArticle.count();
  if (articleCount === 0) {
    await prisma.knowledgeArticle.createMany({
      data: [
        {
          title: 'جدول رسمی تخفیف عدم خسارت بیمه شخص ثالث',
          content: 'سال اول: ۵٪ تخفیف | سال دوم: ۱۰٪ تخفیف | سال سوم: ۱۵٪ تخفیف | سال چهارم: ۲۰٪ تخفیف | سال پنجم: ۲۵٪ تخفیف | سال دهم: ۵۰٪ تخفیف | سال چهاردهم به بعد: ۷۰٪ تخفیف حداکثر. در صورت بروز یک حادثه مالی، تنها ۲۰٪ تا ۳۰٪ از تخفیف کسر می‌شود و کل سابقه صفر نمی‌گردد.',
          category: 'خودرو',
          tags: 'ثالث, تخفیف, جدول تخفیف, عدم خسارت',
          status: 'PUBLISHED',
        },
        {
          title: 'راهنمای استعلام و صدور فوری بیمه شخص ثالث پژو ۲۰۶',
          content: 'پژو ۲۰۶ در تیپ‌های ۲، ۳، ۵، ۶ و صندوق‌دار (SD) جزو خودروهای ۴ سیلندر دسته سواری متوسط قرار دارد. برای استعلام دقیق نرخ، سال ساخت خودرو و درصد تخفیف عدم خسارت مندرج بر روی بیمه‌نامه سال قبل ضروری است.',
          category: 'خودرو',
          tags: 'پژو 206, ثالث پژو, استعلام شخص ثالث',
          status: 'PUBLISHED',
        },
      ],
    });
  }
}

/**
 * Intelligent Retrieval Engine:
 * Fetches strictly relevant knowledge from AI Training Center based on user message and context
 */
export async function retrieveRelevantKnowledgeFromTrainingCenter(params: {
  userMessage: string;
  conversationHistoryText?: string;
  customerContext?: { name?: string; city?: string; pageUrl?: string; interestedInsuranceTypes?: string; categoryId?: string | null; productId?: string | null; restrictToCategory?: boolean };
  existingCollectedData?: Record<string, any>;
}): Promise<ExtractedKnowledgePayload> {
  // Ensure database has seed data
  await ensureTrainingCenterSeeded();

  const userMsgLower = params.userMessage.toLowerCase();

  const fullContextText = `
${params.userMessage}
${params.conversationHistoryText || ''}
${params.customerContext?.pageUrl || ''}
${params.customerContext?.interestedInsuranceTypes || ''}
`.toLowerCase();

  console.log("========== RETRIEVAL DEBUG ==========");
  console.log("USER MESSAGE:", params.userMessage);
  console.log("TOPIC:", params.customerContext?.interestedInsuranceTypes);
  console.log("PAGE:", params.customerContext?.pageUrl);
  console.log("FULL CONTEXT:", fullContextText);
  console.log("====================================");

  // 1. Fetch AI Behavior Rules
  const activeRules = await prisma.aiRule.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { sortOrder: 'asc' },
  });

  // Filter or prioritize rules based on context
  let appliedRules = activeRules.map((r) => ({
    id: r.id,
    title: r.title,
    directive: stripUnverifiedOperationalClaims(r.directive),
    enforcementLevel: r.enforcementLevel,
    category: r.category,
  }));

  // 2. Identify Insurance Category, Sub-Category and Product
  //
  // Category detection keeps the existing business logic for now.
  // Sub-category detection is fully dynamic and comes from the database.

  let categoryFilter: string | null = null;
  let matchedCategoryRaw: any = null;
  let matchedSubCategoryRaw: any = null;

  const normalizedContext = fullContextText
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .toLowerCase();
  const normalizedConversationContext = `${params.userMessage}\n${params.conversationHistoryText || ''}`
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .toLowerCase();
  const normalizedLatestMessage = params.userMessage
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .toLowerCase();

  // ---------------------------------------------------------
  // 2.2 Load dynamic categories and sub-categories
  // ---------------------------------------------------------
  const activeCategories = await prisma.insuranceCategory.findMany({
    where: { status: 'ACTIVE' },
    include: {
      subCategories: {
        where: { status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const normalizeForMatch = (value: string) =>
    String(value || '')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/ۀ/g, 'ه')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/إ/g, 'ا')
      .replace(/أ/g, 'ا')
      .replace(/‌/g, ' ')
      .toLowerCase()
      .trim();

  const tokenize = (value: string) =>
    normalizeForMatch(value)
      .split(/[\s،,؛:()\-_/|]+/)
      .filter((word: string) => word.length >= 2);

  const scoreTextAgainstContext = (value: string, context = normalizedContext) => {
    const normalizedValue = normalizeForMatch(value);

    if (!normalizedValue) return 0;

    let score = 0;

    if (context.includes(normalizedValue)) {
      score += 10;
    }

    const words = tokenize(normalizedValue);

    for (const word of words) {
      if (context.includes(word)) {
        score += word.length >= 5 ? 2 : 1;
      }
    }

    return score;
  };

  // ---------------------------------------------------------
  // 2.3 Match dynamic category
  //
  // Categories are resolved entirely from the database.
  // No hard-coded category names are used here.
  // ---------------------------------------------------------
  if (params.customerContext?.categoryId) {
    matchedCategoryRaw = activeCategories.find(
      (category) => category.id === params.customerContext?.categoryId,
    ) || null;
  }

  if (!matchedCategoryRaw && !params.customerContext?.restrictToCategory && activeCategories.length > 0) {
    const scoredCategories = activeCategories
      .map((category) => ({
        category,
        score: scoreTextAgainstContext(
          `${category.name} ${category.description || ''}`
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredCategories.length > 0) {
      matchedCategoryRaw = scoredCategories[0].category;
    }
  }

  const categoryScope = matchedCategoryRaw
    ? categoryKnowledgeScope(matchedCategoryRaw.id)
    : null;
  const relevantArticles = categoryScope
    ? await prisma.knowledgeArticle.findMany({
        where: { status: 'PUBLISHED', category: categoryScope },
        orderBy: { updatedAt: 'desc' },
      })
    : [];

  // Global rules always apply. Category rules are appended after them so they
  // can provide more specific direction for the selected category.
  appliedRules = appliedRules.filter((rule) =>
    !rule.category.startsWith('CATEGORY_KNOWLEDGE:'),
  );
  const categoryRules = categoryScope
    ? activeRules
        .filter((rule) => rule.category === categoryScope)
        .map((rule) => ({
          id: rule.id,
          title: rule.title,
          directive: stripUnverifiedOperationalClaims(rule.directive),
          enforcementLevel: rule.enforcementLevel,
          category: rule.category,
        }))
    : [];
  appliedRules.push(...categoryRules);

  // ---------------------------------------------------------
  // 2.4 Match dynamic sub-category
  //
  // A direct sub-category match is stronger than a category match.
  // This allows specific insurance topics to resolve precisely.
  // ---------------------------------------------------------
  if (matchedCategoryRaw?.subCategories?.length > 0) {
    const scoredSubCategories = matchedCategoryRaw.subCategories
      .map((subCategory: any) => {
        const subCategoryText = `${subCategory.name} ${subCategory.description || ''}`;
        let score = scoreTextAgainstContext(subCategoryText, normalizedConversationContext);

        const normalizedSubCategoryName = normalizeForMatch(subCategory.name);

        if (
          normalizedSubCategoryName &&
          normalizedConversationContext.includes(normalizedSubCategoryName)
        ) {
          score += 20;
        }

        return {
          subCategory,
          score,
        };
      })
      .filter((item: any) => item.score > 0)
      .sort((a: any, b: any) => b.score - a.score);

    if (scoredSubCategories.length > 0) {
      matchedSubCategoryRaw = scoredSubCategories[0].subCategory;
    }
  }

  console.log("========== CATEGORY / SUBCATEGORY DEBUG ==========");
  console.log("CATEGORY FILTER:", categoryFilter);
  console.log(
    "MATCHED CATEGORY:",
    matchedCategoryRaw
      ? `${matchedCategoryRaw.name} (${matchedCategoryRaw.id})`
      : null
  );
  console.log(
    "MATCHED SUBCATEGORY:",
    matchedSubCategoryRaw
      ? `${matchedSubCategoryRaw.name} (${matchedSubCategoryRaw.id})`
      : null
  );
  console.log("===============================================");

  // ---------------------------------------------------------
  // 2.5 Fetch products
  //
  // Prefer categoryId/subCategoryId.
  // Keep legacy category fallback for existing seeded data.
  // ---------------------------------------------------------
  let productWhere: any = {
    status: 'ACTIVE',
  };

  if (params.customerContext?.productId) {
    productWhere.id = params.customerContext.productId;
  }

  if (matchedSubCategoryRaw) {
    productWhere.categoryId = matchedSubCategoryRaw.categoryId;

    productWhere.subCategoryId = matchedSubCategoryRaw.id;
  } else if (matchedCategoryRaw) {
    productWhere.categoryId = matchedCategoryRaw.id;
  } else if (categoryFilter) {
    // Temporary backward compatibility for legacy products.
    productWhere.category = categoryFilter;
  }

  const products = await prisma.insuranceProduct.findMany({
    where: productWhere,
    include: {
      quotationQuestions: {
        orderBy: { order: 'asc' },
      },
      categoryRef: true,
      subCategoryRef: true,
    },
  });

  let matchedProductRaw: any = null;

  if (products.length > 0) {
    const scoredProducts = products.map((product) => {
      const productName = normalizeForMatch(product.name);

      const productWords = tokenize(productName);

      let score = 0;

      // Exact product name match is strongest.
      if (normalizedLatestMessage.includes(productName)) {
        score += 60;
      } else if (normalizedConversationContext.includes(productName)) {
        score += 20;
      }

      for (const word of productWords) {
        if (normalizedLatestMessage.includes(word)) {
          score += word.length >= 5 ? 4 : 2;
        } else if (normalizedConversationContext.includes(word)) {
          score += word.length >= 5 ? 2 : 1;
        }
      }

      // Dynamic category/sub-category agreement.
      if (
        matchedCategoryRaw &&
        product.categoryId === matchedCategoryRaw.id
      ) {
        score += 3;
      }

      if (
        matchedSubCategoryRaw &&
        product.subCategoryId === matchedSubCategoryRaw.id
      ) {
        score += 5;
      }

      return { product, score };
    });

    console.log("========== PRODUCT MATCH DEBUG ==========");
    console.log("NORMALIZED CONTEXT:", normalizedContext);
    console.log(
      "PRODUCT SCORES:",
      JSON.stringify(
        scoredProducts.map((item: any) => ({
          id: item.product.id,
          name: item.product.name,
          categoryId: item.product.categoryId,
          subCategoryId: item.product.subCategoryId,
          score: item.score,
        })),
        null,
        2
      )
    );
    console.log("=========================================");

    const best = scoredProducts
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    // Product is activated only when subcategory is identified.
    // Category alone is not enough to load product knowledge or quotation workflow.
    if (best && params.customerContext?.productId && best.product.id === params.customerContext.productId) {
      matchedProductRaw = best.product;
    } else if (best && matchedSubCategoryRaw) {
      matchedProductRaw = best.product;
    } else if (best && !matchedSubCategoryRaw) {
      console.log("PRODUCT MATCH BLOCKED: category detected but subcategory is missing");
      console.log("Candidate product:", best.product.name);
      matchedProductRaw = null;
    }
  }

  let matchedProduct = null;
  let quotationWorkflow = null;

  if (matchedProductRaw) {
    matchedProduct = {
      id: matchedProductRaw.id,
      name: matchedProductRaw.name,
      category: matchedProductRaw.category,
      purchaseUrl: matchedProductRaw.purchaseUrl || null,
      aiKnowledgeArticle: matchedProductRaw.aiKnowledgeArticle || '',
      aiRules: matchedProductRaw.aiRules || '',
    };

    // Calculate quotation workflow & next question
    const questions = matchedProductRaw.quotationQuestions || [];
    const collectedData = { ...(params.existingCollectedData || {}) };

    // Extract basic clues from user message directly (e.g. "پژو 206", "1399", "بدون تخفیف")
    if (fullContextText.match(/پژو\s*(۲۰۶|206|پارس|۴۰۵|405|۲۰۷|207)|پراید|سمند|دنا|تارا|کوییک|شاهین|تیبا/)) {
      const match = fullContextText.match(/پژو\s*(۲۰۶|206|پارس|۴۰۵|405|۲۰۷|207)|پراید|سمند|دنا|تارا|کوییک|شاهین|تیبا/);
      if (match && !collectedData.car_model) {
        collectedData.car_model = match[0];
      }
    }
    const yearMatch = fullContextText.match(/۱۳\d\d|۱۴\d\d|13\d\d|14\d\d/);
    if (yearMatch && !collectedData.manufacturing_year) {
      collectedData.manufacturing_year = yearMatch[0];
    }
    const discountMatch = fullContextText.match(/(\d+)\s*(سال|درصد|%)\s*تخفیف|صفر|بدون تخفیف|تخفیف کامل|۷۰\s*درصد/);
    if (discountMatch && !collectedData.no_claim_discount) {
      collectedData.no_claim_discount = discountMatch[0];
    }

    const allQuestions = questions.map((q) => ({
      order: q.order,
      title: q.title,
      fieldName: q.fieldName,
      aiQuestion: q.aiQuestion || q.title,
      required: q.required,
      type: q.type,
      options: q.options && q.options !== '[]' ? JSON.parse(q.options) : undefined,
    }));

    // Find next unanswered required question
    const nextUnanswered = allQuestions.find((q) => !collectedData[q.fieldName] && q.required) || null;
    const isCompleted = questions.length > 0 && !nextUnanswered;

    quotationWorkflow = {
      totalQuestions: questions.length,
      allQuestions,
      answeredFields: collectedData,
      nextQuestion: nextUnanswered,
      isCompleted,
    };
  }

  console.log("========== CATEGORY DEBUG ==========");
  console.log("CATEGORY FILTER:", categoryFilter);
  console.log("====================================");

  // 3. Fetch Strictly Relevant FAQs (Top 2 max)
  const allFaqs = params.customerContext?.restrictToCategory
    ? []
    : await prisma.fAQ.findMany({ where: { status: 'APPROVED' }, orderBy: { priority: 'desc' } });

  const relevantFaqs = allFaqs
    .filter((f) => {
      const combined = `${f.question} ${f.answer} ${f.keywords} ${f.insuranceType}`.toLowerCase();
      if (categoryFilter === 'خودرو' && (combined.includes('خودرو') || combined.includes('ثالث') || combined.includes('تخفیف') || combined.includes('اقساط'))) {
        return true;
      }
      if (categoryFilter === 'درمان' && (combined.includes('درمان') || combined.includes('تکمیلی') || combined.includes('زایمان'))) {
        return true;
      }
      if (categoryFilter === 'اموال' && (combined.includes('آتش') || combined.includes('زلزله') || combined.includes('اثاثیه'))) {
        return true;
      }

      if (
        categoryFilter === 'مسئولیت' &&
        (
          combined.includes('مسئولیت') ||
          combined.includes('مدیر') ||
          combined.includes('کارفرما') ||
          combined.includes('مهندسی')
        )
      ) {
        return true;
      }

      return false;
    })
    .slice(0, 2)
    .map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      insuranceType: f.insuranceType,
    }));

  // 5. Fetch Matched Customer Objections (if customer is hesitating / objecting)
  const allObjections = params.customerContext?.restrictToCategory
    ? []
    : await prisma.customerObjection.findMany({ where: { status: 'ACTIVE' } });

  const isPriceObjection = fullContextText.includes('گران') || fullContextText.includes('تخفیف بیشتر') || fullContextText.includes('چرا قیمت نمیدید') || fullContextText.includes('چرا سوال میپرسید');
  const isInstallmentObjection = fullContextText.includes('چک') || fullContextText.includes('سفته') || fullContextText.includes('ضامن');

  const matchedObjections = allObjections
    .filter((obj) => {
      if (isPriceObjection && (obj.category.includes('قیمت') || obj.objection.includes('قیمت'))) return true;
      if (isInstallmentObjection && (obj.category.includes('اقساط') || obj.objection.includes('چک'))) return true;
      return false;
    })
    .slice(0, 2)
    .map((o) => ({
      id: o.id,
      objection: o.objection,
      recommendedResponse: o.recommendedResponse,
      responseGoal: o.responseGoal,
    }));

  // 6. Build Formatted Knowledge Context String
  const knowledgeParts: string[] = [];
  const scopedKnowledge = composeScopedKnowledge(
    relevantArticles.map((article) => `📚 دانش دسته اصلی «${matchedCategoryRaw?.name}»:\n• ${article.title}\n${article.content}`),
    matchedProduct?.aiKnowledgeArticle || '',
  );

  if (relevantArticles.length > 0) knowledgeParts.push(...scopedKnowledge.sections.slice(0, relevantArticles.length));

  if (matchedProduct) {
    knowledgeParts.push(
      `📌 محصول بیمه‌ای منتخب:
• نام: ${matchedProduct.name}
• دسته: ${matchedProduct.category}`
    );

    if (matchedProduct.aiKnowledgeArticle?.trim()) {
      knowledgeParts.push(
        `📚 دانش تخصصی زیرمجموعه/محصول (در تعارض با دانش دسته اصلی، این بخش اولویت دارد):
${matchedProduct.aiKnowledgeArticle.trim()}`
      );
    }

    if (matchedProduct.aiRules?.trim()) {
      knowledgeParts.push(
        `📜 قوانین اختصاصی همین محصول:
${matchedProduct.aiRules.trim()}`
      );
    }
  }

  if (quotationWorkflow && quotationWorkflow.nextQuestion) {
    knowledgeParts.push(`📋 سوالات استعلام قیمت (Quotation Workflow):\n• اطلاعات دریافت شده تا کنون: ${JSON.stringify(quotationWorkflow.answeredFields)}\n• سوال بعدی که باید از مشتری بپرسید: "${quotationWorkflow.nextQuestion.aiQuestion || quotationWorkflow.nextQuestion.title}" ${quotationWorkflow.nextQuestion.options ? `(گزینه‌ها: ${quotationWorkflow.nextQuestion.options.join(' / ')})` : ''}`);
  } else if (quotationWorkflow && quotationWorkflow.isCompleted) {
    knowledgeParts.push(`📋 وضعیت استعلام قیمت: کلیه اطلاعات مورد نیاز (فیلدها: ${Object.keys(quotationWorkflow.answeredFields).join('، ')}) دریافت شد. اعلام فرمایید که اطلاعات ثبت شده و جهت محاسبه قیمت نهایی به کارشناس ارجاع شد.`);
  }

  if (relevantFaqs.length > 0) {
    knowledgeParts.push(`❓ سوالات متداول مرتبط (FAQ):\n${relevantFaqs.map((f) => `• سوال: ${f.question}\n  پاسخ: ${f.answer}`).join('\n')}`);
  }

  if (matchedObjections.length > 0) {
    knowledgeParts.push(`🛡️ راهنمای پاسخ به دغدغه و اعتراض مشتری:\n${matchedObjections.map((o) => `• موضوع: ${o.objection}\n  پاسخ پیشنهادی: ${o.recommendedResponse}`).join('\n')}`);
  }

  const promptFormattedKnowledge = knowledgeParts.join('\n\n');
  const noRelevantKnowledge =
    !scopedKnowledge.hasRelevantKnowledge &&
    relevantFaqs.length === 0;

  // Format rules block
  const promptFormattedRules = appliedRules
    .map((r, i) => `${i + 1}. [${r.title}] (${r.enforcementLevel}): ${r.directive}`)
    .join('\n');

  return {
    matchedProduct,
    quotationWorkflow,

    // Product context is only available after subcategory/product identification.
    productKnowledgeAvailable: !!matchedProduct,
    noRelevantKnowledge,

    // If category is known but subcategory is missing,
    // AI should clarify the user's requested insurance type first.
    productSelectionRequired:
      !!matchedCategoryRaw && !matchedSubCategoryRaw && !matchedProduct,

    matchedCategory: matchedCategoryRaw?.name || null,
    matchedCategoryId: matchedCategoryRaw?.id || null,
    matchedSubCategory: matchedSubCategoryRaw?.name || null,

    relevantFaqs,
    relevantArticles: relevantArticles.map((article) => ({
      id: article.id,
      title: article.title,
      content: article.content,
    })),
    matchedObjections,
    appliedRules,
    promptFormattedKnowledge,
    promptFormattedRules,
  };
}
