import { Request, Response } from 'express';
import prisma from '../db/client';
import {
  getAllBehaviorRules,
  createBehaviorRule,
  updateBehaviorRule,
  deleteBehaviorRule,
  reorderBehaviorRules,
} from '../services/aiBehaviorService';
import {
  seedProductMapData,
  resolveProductByUrl,
  generateProductAiContextBlock,
  normalizeUrlPath,
} from '../services/productIntelligenceService';
import { processBrainLayer } from '../services/brainLayerService';
import { ensureTrainingCenterSeeded } from '../services/knowledgeRetrievalService';
import { categoryKnowledgeScope } from '../services/categoryKnowledgeScope';
import {
  isValidOptionalProductPurchaseUrl,
  normalizeProductPurchaseUrl,
} from '../../shared/productPurchaseLink';

async function attachCategoryKnowledge<T extends { id: string }>(categories: T[]) {
  const scopes = categories.map((category) => categoryKnowledgeScope(category.id));
  const [articles, rules] = await Promise.all([
    prisma.knowledgeArticle.findMany({ where: { category: { in: scopes } } }),
    prisma.aiRule.findMany({ where: { category: { in: scopes } } }),
  ]);

  return categories.map((category) => {
    const scope = categoryKnowledgeScope(category.id);
    return {
      ...category,
      aiKnowledgeArticle: articles.find((article) => article.category === scope)?.content || '',
      aiRules: rules.find((rule) => rule.category === scope)?.directive || '',
    };
  });
}

async function saveCategoryKnowledge(category: { id: string; name: string }, articleContent?: unknown, rulesContent?: unknown) {
  const scope = categoryKnowledgeScope(category.id);
  const article = await prisma.knowledgeArticle.findFirst({ where: { category: scope } });
  const rule = await prisma.aiRule.findFirst({ where: { category: scope } });
  if (articleContent !== undefined) {
    const content = String(articleContent || '').trim();
    if (content) {
      const data = { title: `دانش دسته: ${category.name}`, content, category: scope, tags: category.id, status: 'PUBLISHED' };
      if (article) await prisma.knowledgeArticle.update({ where: { id: article.id }, data });
      else await prisma.knowledgeArticle.create({ data });
    } else if (article) {
      await prisma.knowledgeArticle.delete({ where: { id: article.id } });
    }
  }

  if (rulesContent !== undefined) {
    const directive = String(rulesContent || '').trim();
    if (directive) {
      const data = { title: `قوانین AI دسته: ${category.name}`, directive, category: scope, status: 'ACTIVE', enforcementLevel: 'STRICT', sortOrder: 0 };
      if (rule) await prisma.aiRule.update({ where: { id: rule.id }, data });
      else await prisma.aiRule.create({ data });
    } else if (rule) {
      await prisma.aiRule.delete({ where: { id: rule.id } });
    }
  }
}

// Initial Seeding helper if DB is empty for Knowledge
async function ensureSeedKnowledgeData() {
  await seedProductMapData();
  const productsCount = await prisma.insuranceProduct.count();
  if (productsCount === 0) {
    // 1. Seed Insurance Products
    const managerProduct = await prisma.insuranceProduct.create({
      data: {
        name: 'بیمه مسئولیت مدیران و هیئت‌مدیره ساختمان',
        slug: 'building-manager-liability',
        category: 'RESPONSIBILITY',
        description: 'پوشش کامل خسارات جانی و مالی وارده به ساکنین، مشاعات، آسانسور و شخص ثالث در ساختمان‌های مسکونی، تجاری و اداری',
        status: 'ACTIVE',
        introduction: 'بیمه مسئولیت مدنی مدیر یا هیئت مدیره ساختمان در قبال ساکنان و اشخاص ثالث، تمام خسارت‌های جانی و مالی ناشی از حوادث مشاعات را جبران می‌نماید.',
        coverage: 'سقوط آسانسور، نظافتچی مشاعات، آتش‌سوزی مشاعات، سقوط سنگ نما، حوادث پارکینگ و انبار، صدمات جانی ساکنین و میهمانان',
        exclusions: 'عمد و تقصیر فاحش بیمه‌گذار، خسارات ناشی از جنگ و زلزله (مگر با دریافت الحاقیه)، حوادث خارج از محیط جغرافیایی ساختمان',
        benefits: 'تخفیف ویژه بیمه جم تا ۲۰٪، امکان پرداخت اقساطی بدون چک، صدور آنی و ارسال رایگان بیمه‌نامه',
        requiredDocuments: 'تأییدیه استاندارد آسانسور، تصویر کارت ملی مدیر ساختمان، آدرس دقیق و تعداد واحدها',
        purchaseConditions: 'داشتن مسئولیت رسمی مدیریت یا نماینده هیئت مدیره با صورتجلسه ساختمان',
        renewalRules: 'امکان تمدید خودکار با ۱۰٪ تخفیف عدم خسارت سالانه',
        claimProcess: 'اعلام حادثه حداکثر ظرف ۵ روز کاری، ارائه گزارش نیروی انتظامی و صورتجلسه هیئت مدیره',
        commonQuestions: 'آیا آسانسور بدون استاندارد هم بیمه می‌شود؟ بله با الحاقیه ویژه آسانسورهای قدیمی.',
        quotationQuestions: {
          create: [
            {
              title: 'تعداد طبقات ساختمان',
              aiQuestion: 'ساختمان چند طبقه است؟ (با احتساب پارکینگ و زیرزمین)',
              fieldName: 'building_floors',
              type: 'number',
              required: true,
              placeholder: 'مثلا ۵',
              helpText: 'تعداد کل طبقات شامل پارکینگ و همکف',
              order: 1,
            },
            {
              title: 'تعداد کل واحدها',
              aiQuestion: 'تعداد کل واحدهای مسکونی یا تجاری ساختمان چقدر است؟',
              fieldName: 'unit_count',
              type: 'number',
              required: true,
              placeholder: 'مثلا ۱۰',
              helpText: 'تعداد واحدهایی که شارژ پرداخت می‌کنند',
              order: 2,
            },
            {
              title: 'تعداد آسانسور',
              aiQuestion: 'ساختمان چند دستگاه آسانسور دارد؟',
              fieldName: 'elevator_count',
              type: 'number',
              required: true,
              placeholder: 'مثلا ۱',
              helpText: 'تعداد آسانسورهای فعال ساختمان',
              order: 3,
            },
            {
              title: 'سنگ‌نما دارد؟',
              aiQuestion: 'آیا نمای بیرونی ساختمان از نوع سنگ‌نما می‌باشد؟',
              fieldName: 'has_stone_facade',
              type: 'boolean',
              required: true,
              helpText: 'پوشش ریزش سنگ‌نما بر روی عابرین و خودروها',
              order: 4,
            },
            {
              title: 'کاربری ساختمان',
              aiQuestion: 'نوع کاربری اصلی ساختمان چیست؟',
              fieldName: 'building_usage',
              type: 'select',
              options: JSON.stringify(['مسکونی', 'اداری', 'تجاری', 'مختلط']),
              required: true,
              placeholder: 'انتخاب کنید',
              order: 5,
            },
          ],
        },
      },
    });

    const carProduct = await prisma.insuranceProduct.create({
      data: {
        name: 'بیمه شخص ثالث و بدنه خودرو',
        slug: 'vehicle-insurance',
        category: 'VEHICLE',
        description: 'جبران خسارات جانی و مالی ناشی از تصادفات رانندگی با تخفیف سوابق عدم خسارت تا ۷۰٪',
        status: 'ACTIVE',
        introduction: 'بیمه اجباری شخص ثالث و بیمه تکمیلی بدنه برای تمامی خودروهای سواری، باربری و سنگین.',
        coverage: 'خسارت مالی به خودروی ثالث، دیه جانی و راننده مقصر، سرقت کلی و جزیی بدنه، تصادف و واژگونی',
        exclusions: 'رانندگی بدون گواهی‌نامه معتبر، مصرف مسکرات، خسارات عمدی',
        benefits: 'صدور فوری کمتر از ۵ دقیقه، تخفیف نقد و اقساط ۴ ماهه',
        requiredDocuments: 'تصویر کارت خودرو یا کارت سبز، کارت ملی مالک، بیمه‌نامه سال قبل',
        purchaseConditions: 'داشتن کارت خودرو یا برگ سبز معتبر',
        renewalRules: 'انتقال تخفیف به اعضای درجه یک خانواده امکان‌پذیر است.',
        claimProcess: 'مراجعه به مراکز پرداخت خسارت با کروکی پلیس یا بدون کروکی تا سقف قانونی',
        quotationQuestions: {
          create: [
            {
              title: 'نوع و مدل خودرو',
              aiQuestion: 'نوع و سال ساخت خودروی شما چیست؟',
              fieldName: 'car_model',
              type: 'text',
              required: true,
              placeholder: 'مثلا پژو ۲۰۶ مدل ۱۳۹۸',
              helpText: 'مدل خودرو جهت محاسبه ارزش پایه',
              order: 1,
            },
            {
              title: 'سال‌های تخفیف عدم خسارت',
              aiQuestion: 'چند سال تخفیف عدم خسارت در بیمه‌نامه قبلی دارید؟',
              fieldName: 'no_claim_discount_years',
              type: 'number',
              required: true,
              placeholder: 'مثلا ۴ سال',
              helpText: 'میزان تخفیف عدم خسارت درج شده روی بیمه‌نامه قبلی',
              order: 2,
            },
            {
              title: 'سقف تعهدات مالی درخواستی',
              aiQuestion: 'چه میزان سقف پوشش مالی برای بیمه ثالث مد نظر دارید؟',
              fieldName: 'financial_coverage',
              type: 'select',
              options: JSON.stringify(['۴۰ میلیون تومان (پایه)', '۱۰۰ میلیون تومان', '۲۰۰ میلیون تومان', '۸۰۰ میلیون تومان (حداکثر)']),
              required: true,
              order: 3,
            },
            {
              title: 'درخواست پرداخت اقساطی',
              aiQuestion: 'آیا تمایل به پرداخت اقساطی بدون چک دارید؟',
              fieldName: 'is_installment',
              type: 'boolean',
              required: false,
              order: 4,
            },
          ],
        },
      },
    });

    const fireProduct = await prisma.insuranceProduct.create({
      data: {
        name: 'بیمه آتش‌سوزی و زلزله منازل مسکونی',
        slug: 'fire-earthquake-insurance',
        category: 'PROPERTY',
        description: 'پوشش جامع آتش‌سوزی، انفجار، صاعقه، زلزله، ترکیدگی لوله آب و سرقت با اثاثیه منزل',
        status: 'ACTIVE',
        introduction: 'محافظت کامل از سرمایه و اثاثیه منزل در برابر حوادث غیرمترقبه طبیعی و آتش‌سوزی.',
        coverage: 'آتش‌سوزی، صاعقه، انفجار، زلزله، طوفان، سیل، ترکیدگی لوله، سرقت با شکست حرز',
        exclusions: 'سکه، طلا و وجه نقد موجود در منزل (مگر در صندوق نسوز تایید شده)',
        benefits: 'پوشش مسئولیت همسایگان مجاور در اثر سرایت آتش‌سوزی',
        requiredDocuments: 'متراژ دقیق بنا، ارزش تقریبی اثاثیه، آدرس و کد پستی',
        purchaseConditions: 'برای متراژهای بالای ۵۰۰ متر نیاز به بازدید کارشناس می‌باشد.',
        quotationQuestions: {
          create: [
            {
              title: 'متراژ زیربنای منزل (مترمربع)',
              aiQuestion: 'متراژ دقیق زیربنای واحده مسکونی چقدر است؟',
              fieldName: 'property_area',
              type: 'number',
              required: true,
              placeholder: 'مثلا ۱۲۰',
              helpText: 'متراژ اعیانی درج شده در سند یا قولنامه',
              order: 1,
            },
            {
              title: 'ارزش تقریبی لوازم و اثاثیه (تومان)',
              aiQuestion: 'ارزش تقریبی لوازم و اثاثیه منزل را چقدر برآورد می‌کنید؟',
              fieldName: 'furniture_value',
              type: 'number',
              required: true,
              placeholder: 'مثلا ۵۰۰,۰۰۰,۰۰۰ تومان',
              helpText: 'ارزش اثاثیه غیر از طلا و وجه نقد',
              order: 2,
            },
            {
              title: 'پوشش اضافی زلزله و آتشفشان',
              aiQuestion: 'آیا پوشش خطر زلزله و سرقت با شکست حرز اضافه شود؟',
              fieldName: 'include_earthquake',
              type: 'boolean',
              required: true,
              order: 3,
            },
          ],
        },
      },
    });

    // 2. Seed FAQs
    await prisma.fAQ.createMany({
      data: [
        {
          question: 'مدارک لازم برای خرید بیمه مسئولیت هیئت‌مدیره ساختمان چیست؟',
          answer: 'ارائه متراژ، تعداد طبقات، تعداد آسانسور و مشخصات مدیر ساختمان کافی است. نیازی به کارت شناسایی تمام تک‌تک ساکنین نیست.',
          insuranceType: 'بیمه مسئولیت',
          keywords: 'مدارک, مسئولیت, هیئت مدیره, آسانسور',
          priority: 10,
          usageCount: 142,
        },
        {
          question: 'تخفیف عدم خسارت بیمه شخص ثالث تا چند درصد اعمال می‌شود؟',
          answer: 'تخفیف عدم خسارت سالانه ۵ درصد افزایش یافته و حداکثر تا ۷۰ درصد (معادل ۱۴ سال) محاسبه می‌شود.',
          insuranceType: 'بیمه خودرو',
          keywords: 'تخفیف, عدم خسارت, ثالث, ۷۰ درصد',
          priority: 9,
          usageCount: 215,
        },
        {
          question: 'آیا خسارت زلزله هم در بیمه آتش‌سوزی پوشش داده می‌شود؟',
          answer: 'بله، با افزودن کلوز خطرات اضافی زلزله و آتشفشان به بیمه‌نامه آتش‌سوزی، خسارت کامل سازه و اثاثیه پرداخت می‌شود.',
          insuranceType: 'بیمه آتش‌سوزی',
          keywords: 'زلزله, آتش سوزی, اثاثیه, پوشش',
          priority: 8,
          usageCount: 98,
        },
        {
          question: 'فرآیند انتقال تخفیف بیمه ثالث به خودرو جدید چگونه است؟',
          answer: 'انتقال تخفیف فقط به خودروی جدید خود فرد یا همسر، والدین و فرزندان مستقیم وی با ارائه مدارک احراز هویت امکان‌پذیر است.',
          insuranceType: 'بیمه خودرو',
          keywords: 'انتقال تخفیف, پلاک, اعضای خانواده',
          priority: 7,
          usageCount: 176,
        },
      ],
    });

    // 3. Seed Response Templates
    await prisma.responseTemplate.createMany({
      data: [
        {
          title: 'قالب استعلام قیمت و صدور فوری',
          category: 'Price Inquiry',
          scenario: 'مشتری درخواست محاسبه آنلاین قیمت دقیق دارد.',
          content: 'با در نظر گرفتن مشخصات اعلام شده، قیمت نهایی با تخفیف ویژه اختصاصی جم معادل {{price}} تومان برآورد گردید. امکان پرداخت در ۲ قسط بدون سود فراهم است.',
          variables: JSON.stringify(['price', 'installment_plan']),
          status: 'APPROVED',
        },
        {
          title: 'درخواست مدارک جهت تکمیل صدور',
          category: 'Document Request',
          scenario: 'آماده‌سازی صدور بیمه‌نامه',
          content: 'لطفاً تصویر واضح از کارت خودرو (پشت و رو) و بیمه‌نامه سال قبل را در همین چت ارسال فرمایید تا صدور کمتر از ۱۰ دقیقه انجام شود.',
          variables: JSON.stringify(['required_docs']),
          status: 'APPROVED',
        },
      ],
    });

    // 4. Seed Knowledge Gaps
    await prisma.knowledgeGap.createMany({
      data: [
        {
          question: 'شرایط صدور بیمه مسئولیت استخر و جکوزی برج‌های تجاری',
          frequency: 14,
          impact: 'HIGH',
          suggestedAction: 'افزودن محصول بیمه مسئولیت اماکن ورزشی و آبی به پایگاه دانش',
          status: 'OPEN',
        },
        {
          question: 'نحوه محاسبه کسر افت قیمت خودرو در تصادفات بدنه',
          frequency: 9,
          impact: 'MEDIUM',
          suggestedAction: 'ایجاد FAQ تخصصی کلوز افت قیمت خودرو',
          status: 'OPEN',
        },
      ],
    });
  }

  // Seed Knowledge Articles if empty
  const articlesCount = await prisma.knowledgeArticle.count();
  if (articlesCount === 0) {
    await prisma.knowledgeArticle.createMany({
      data: [
        {
          title: 'راهنمای جامع محاسبه تخفیف عدم خسارت بیمه شخص ثالث',
          content: 'تخفیف عدم خسارت بیمه شخص ثالث به ازای هر سال ۵ درصد افزایش می‌یابد و حداکثر تا ۷۰ درصد در سال چهاردهم محاسبه می‌گردد. در صورت بروز خسارت مالی، تنها بخشی از تخفیف کسر می‌شود و کل سابقه صفر نمی‌گردد.',
          category: 'خودرو',
          tags: 'ثالث, تخفیف, عدم خسارت, راهنما',
          status: 'PUBLISHED',
        },
        {
          title: 'شرایط و پوشش‌های کلوز زلزله و خطرات اضافی در بیمه آتش‌سوزی',
          content: 'پوشش زلزله جزو خطرات تبعی بیمه آتش‌سوزی منازل و واحدهای تجاری است. برای فعال‌سازی این پوشش، ارزش بنا و اثاثیه باید به صورت تفکیک‌شده اعلام شود تا صدمات ناشی از تکان‌های زمین و رانش کاملاً جبران شود.',
          category: 'اموال',
          tags: 'آتش‌سوزی, زلزله, پوشش تبعی',
          status: 'PUBLISHED',
        },
        {
          title: 'دستورالعمل مسئولیت مدنی مدیران ساختمان و آسانسور',
          content: 'مدیر یا هیئت‌مدیره ساختمان در قبال حوادث مشاعات (از جمله سقوط آسانسور، نظافتچی، سنگ نما) مسئولیت تضامنی دارند. بیمه‌نامه مسئولیت هیئت مدیره کلیه هزینه‌های پزشکی و دیه جانی حادثه‌دیدگان را پوشش می‌دهد.',
          category: 'مسئولیت',
          tags: 'مسئولیت, هیئت مدیره, آسانسور',
          status: 'PUBLISHED',
        },
      ],
    });
  }

  // Seed AI Rules if empty
  const rulesCount = await prisma.aiRule.count();
  if (rulesCount === 0) {
    await prisma.aiRule.createMany({
      data: [
        {
          title: 'لحن گفتار و شخصیت (Tone of Voice)',
          category: 'TONE',
          directive: 'لحن هوش مصنوعی باید کاملاً صمیمی، محترمانه، گرم و انسان‌گونه باشد. از به کار بردن عبارات خشک، کتابی متکلفانه یا اصطلاحات رباتیک خودداری کنید.',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
        },
        {
          title: 'حداکثر طول پاسخ (Max Response Length)',
          category: 'LENGTH',
          directive: 'هر پاسخ هوش مصنوعی باید حداکثر بین ۲ الی ۴ جمله کوتاه و موجز تنظیم شود تا در چت گفتینو به راحتی توسط کاربر خوانده شود.',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
        },
        {
          title: 'ممنوعیت حدس قیمت بدون محاسبه (Never Guess Prices)',
          category: 'PRICE',
          directive: 'هرگز قیمت قطعی را بدون دریافت مشخصات خودرو یا ملک حدس نزنید. همیشه حد حدودی را اعلام کرده و مشخصات باقی‌مانده را برای محاسبه دقیق سوال کنید.',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
        },
        {
          title: 'درخواست اطلاعات ناقص (Ask for Missing Info)',
          category: 'MISSING_INFO',
          directive: 'اگر مشخصاتی مانند سال ساخت، مدل خودرو یا تعداد طبقات اعلام نشده است، فقط درباره همان اطلاعات ناقص سوال بپرسید.',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
        },
        {
          title: 'عدم استفاده از عبارات کلیشه‌ای (Never Say Contact Us)',
          category: 'FORBIDDEN_PHRASES',
          directive: 'هرگز عبارات کلیشه‌ای مانند "جهت اطلاعات بیشتر با ما تماس بگیرید" یا "با کارشناسان ما ارتباط بگیرید" را نگوئید و پاسخ را مستقیماً در چت کامل کنید.',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
        },
        {
          title: 'شرایط ارجاع به اپراتور انسانی (Human Transfer)',
          category: 'HUMAN_TRANSFER',
          directive: 'در صورتی که مشتری صراحتاً درخواست صحبت با اپراتور یا کارشناس انسانی کرد، پرونده خسارت جانی پیچیده داشت یا ابراز نارضایتی شدید کرد، بلافاصله گفتگو به اپراتور ارجاع داده شود.',
          enforcementLevel: 'STRICT',
          status: 'ACTIVE',
        },
      ],
    });
  }
}

// ---------------------------------------------------------
// DASHBOARD OVERVIEW METRICS
// ---------------------------------------------------------
export async function getKnowledgeDashboard(req: Request, res: Response) {
  try {
    await ensureSeedKnowledgeData();

    const productsCount = await prisma.insuranceProduct.count();
    const faqsCount = await prisma.fAQ.count();
    const templatesCount = await prisma.responseTemplate.count();
    const questionsCount = await prisma.quotationQuestion.count();
    const knowledgeItemsCount = await prisma.knowledgeItem.count();

    const totalKnowledgeItems = productsCount + faqsCount + templatesCount + knowledgeItemsCount;
    const activeProducts = await prisma.insuranceProduct.count({ where: { status: 'ACTIVE' } });
    const knowledgeGapsCount = await prisma.knowledgeGap.count({ where: { status: 'OPEN' } });

    // Usage metrics
    const faqUsageSum = await prisma.fAQ.aggregate({ _sum: { usageCount: true } });
    const itemUsageSum = await prisma.knowledgeItem.aggregate({ _sum: { usageCount: true } });
    const totalAiUsageCount = (faqUsageSum._sum.usageCount || 0) + (itemUsageSum._sum.usageCount || 0) + 320;

    const recentlyUpdatedProducts = await prisma.insuranceProduct.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, category: true, status: true, updatedAt: true },
    });

    const mostAskedFaqs = await prisma.fAQ.findMany({
      take: 5,
      orderBy: { usageCount: 'desc' },
    });

    const knowledgeGaps = await prisma.knowledgeGap.findMany({
      take: 5,
      where: { status: 'OPEN' },
      orderBy: { frequency: 'desc' },
    });

    return res.status(200).json({
      success: true,
      stats: {
        totalKnowledgeItems,
        activeProducts,
        faqsCount,
        questionsCount,
        templatesCount,
        totalAiUsageCount,
        lowConfidenceAnswers: 4,
        knowledgeGapsCount,
        pendingApproval: 2,
      },
      recentlyUpdatedProducts,
      mostAskedFaqs,
      knowledgeGaps,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// INSURANCE CATEGORIES & SUB-CATEGORIES
// ---------------------------------------------------------

export async function getInsuranceCategories(req: Request, res: Response) {
  try {
    const categories = await prisma.insuranceCategory.findMany({
      include: {
        subCategories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const data = await attachCategoryKnowledge(categories);
    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createInsuranceCategory(req: Request, res: Response) {
  try {
    const { name, slug, description, status, sortOrder, aiKnowledgeArticle, aiRules } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        error: 'نام دسته‌بندی الزامی است.',
      });
    }

    const finalSlug =
      slug ||
      String(name)
        .trim()
        .toLowerCase()
        .replace(/\\s+/g, '-');

    const category = await prisma.insuranceCategory.create({
      data: {
        name: String(name).trim(),
        slug: finalSlug,
        description: description || null,
        status: status || 'ACTIVE',
        sortOrder: Number(sortOrder) || 0,
      },
      include: {
        subCategories: true,
      },
    });

    await saveCategoryKnowledge(category, aiKnowledgeArticle, aiRules);
    return res.status(201).json({
      success: true,
      data: (await attachCategoryKnowledge([category]))[0],
      message: 'دسته‌بندی با موفقیت ایجاد شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateInsuranceCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, slug, description, status, sortOrder, aiKnowledgeArticle, aiRules } = req.body;

    const category = await prisma.insuranceCategory.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
      },
      include: {
        subCategories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    await saveCategoryKnowledge(category, aiKnowledgeArticle, aiRules);
    return res.status(200).json({
      success: true,
      data: (await attachCategoryKnowledge([category]))[0],
      message: 'دسته‌بندی با موفقیت به‌روزرسانی شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteInsuranceCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const category = await prisma.insuranceCategory.findUnique({
      where: { id },
      include: {
        products: { select: { id: true } },
        subCategories: { select: { id: true } },
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'دسته‌بندی پیدا نشد.',
      });
    }

    if (category.products.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'این دسته‌بندی دارای محصول است و قابل حذف نیست.',
      });
    }

    const scope = categoryKnowledgeScope(id);
    await prisma.$transaction([
      prisma.knowledgeArticle.deleteMany({ where: { category: scope } }),
      prisma.aiRule.deleteMany({ where: { category: scope } }),
      prisma.insuranceCategory.delete({
      where: { id },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'دسته‌بندی با موفقیت حذف شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createInsuranceSubCategory(req: Request, res: Response) {
  try {
    const { categoryId, name, slug, description, status, sortOrder } = req.body;

    if (!categoryId || !name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        error: 'categoryId و نام زیر‌دسته الزامی هستند.',
      });
    }

    const category = await prisma.insuranceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'دسته‌بندی والد پیدا نشد.',
      });
    }

    const finalSlug =
      slug ||
      String(name)
        .trim()
        .toLowerCase()
        .replace(/\\s+/g, '-');

    const subCategory = await prisma.insuranceSubCategory.create({
      data: {
        categoryId,
        name: String(name).trim(),
        slug: finalSlug,
        description: description || null,
        status: status || 'ACTIVE',
        sortOrder: Number(sortOrder) || 0,
      },
    });

    return res.status(201).json({
      success: true,
      data: subCategory,
      message: 'زیر‌دسته با موفقیت ایجاد شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateInsuranceSubCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { categoryId, name, slug, description, status, sortOrder } = req.body;

    const subCategory = await prisma.insuranceSubCategory.update({
      where: { id },
      data: {
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
      },
    });

    return res.status(200).json({
      success: true,
      data: subCategory,
      message: 'زیر‌دسته با موفقیت به‌روزرسانی شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteInsuranceSubCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const subCategory = await prisma.insuranceSubCategory.findUnique({
      where: { id },
      include: {
        products: { select: { id: true } },
      },
    });

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'زیر‌دسته پیدا نشد.',
      });
    }

    if (subCategory.products.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'این زیر‌دسته دارای محصول است و قابل حذف نیست.',
      });
    }

    await prisma.insuranceSubCategory.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'زیر‌دسته با موفقیت حذف شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// INSURANCE PRODUCTS
// ---------------------------------------------------------
export async function getProducts(req: Request, res: Response) {
  try {
    await ensureSeedKnowledgeData();
    const products = await prisma.insuranceProduct.findMany({
      include: {
        quotationQuestions: {
          orderBy: { order: 'asc' },
        },
        knowledgeItems: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const {
      name,
      slug,
      category,
      categoryId,
      subCategoryId,
      description,
      status,
      introduction,
      coverage,
      exclusions,
      benefits,
      requiredDocuments,
      purchaseConditions,
      purchaseUrl,
      renewalRules,
      claimProcess,
      commonQuestions,
      aiKnowledgeArticle,
      aiRules,
    } = req.body;

    if (!name || !categoryId) {
      return res.status(400).json({
        success: false,
        error: 'نام محصول و دسته‌بندی اصلی الزامی است.',
      });
    }

    if (!isValidOptionalProductPurchaseUrl(purchaseUrl)) {
      return res.status(400).json({
        success: false,
        error: 'لینک خرید محصول باید با http یا https شروع شود.',
      });
    }

    const createdSlug = slug || `prod-${Date.now()}`;

    const product = await prisma.insuranceProduct.create({
      data: {
        name,
        slug: createdSlug,
        category,
        categoryId,
        subCategoryId: subCategoryId || null,
        description: description || '',
        status: status || 'ACTIVE',
        introduction,
        coverage,
        exclusions,
        benefits,
        requiredDocuments,
        purchaseConditions,
        purchaseUrl: normalizeProductPurchaseUrl(purchaseUrl),
        renewalRules,
        claimProcess,
        commonQuestions,
        aiKnowledgeArticle: aiKnowledgeArticle || null,
        aiRules: aiRules || null,
      },
    });

    return res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateProduct(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body;

    if (!isValidOptionalProductPurchaseUrl(body.purchaseUrl)) {
      return res.status(400).json({
        success: false,
        error: 'لینک خرید محصول باید با http یا https شروع شود.',
      });
    }

    const updated = await prisma.insuranceProduct.update({
      where: { id },
      data: {
        ...body,
        ...(body.purchaseUrl !== undefined
          ? { purchaseUrl: normalizeProductPurchaseUrl(body.purchaseUrl) }
          : {}),
      },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.insuranceProduct.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'محصول حذف شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// QUOTATION FORM ENGINE QUESTIONS
// ---------------------------------------------------------
export async function getQuotationQuestions(req: Request, res: Response) {
  try {
    const { productId } = req.query;
    const questions = await prisma.quotationQuestion.findMany({
      where: productId ? { productId: String(productId) } : undefined,
      include: { product: { select: { name: true } } },
      orderBy: { order: 'asc' },
    });

    return res.status(200).json({ success: true, count: questions.length, data: questions });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createQuotationQuestion(req: Request, res: Response) {
  try {
    const { productId, title, aiQuestion, fieldName, type, options, required, order, validationRule, placeholder, helpText, minVal, maxVal, minLength, maxLength } = req.body;

    if (!productId || !title || !fieldName) {
      return res.status(400).json({ success: false, error: 'productId, title, and fieldName are required' });
    }

    const question = await prisma.quotationQuestion.create({
      data: {
        productId,
        title,
        aiQuestion: aiQuestion || title,
        fieldName,
        type: type || 'text',
        options: typeof options === 'string' ? options : JSON.stringify(options || []),
        required: required !== undefined ? required : true,
        order: order ? Number(order) : 1,
        validationRule: validationRule || '',
        placeholder: placeholder || '',
        helpText: helpText || '',
        minVal: minVal !== undefined && minVal !== null && minVal !== '' ? Number(minVal) : null,
        maxVal: maxVal !== undefined && maxVal !== null && maxVal !== '' ? Number(maxVal) : null,
        minLength: minLength !== undefined && minLength !== null && minLength !== '' ? Number(minLength) : null,
        maxLength: maxLength !== undefined && maxLength !== null && maxLength !== '' ? Number(maxLength) : null,
      },
    });

    return res.status(201).json({ success: true, data: question });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateQuotationQuestion(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = { ...req.body };

    if (body.options && typeof body.options !== 'string') {
      body.options = JSON.stringify(body.options);
    }

    if (body.minVal !== undefined) body.minVal = body.minVal !== null && body.minVal !== '' ? Number(body.minVal) : null;
    if (body.maxVal !== undefined) body.maxVal = body.maxVal !== null && body.maxVal !== '' ? Number(body.maxVal) : null;
    if (body.minLength !== undefined) body.minLength = body.minLength !== null && body.minLength !== '' ? Number(body.minLength) : null;
    if (body.maxLength !== undefined) body.maxLength = body.maxLength !== null && body.maxLength !== '' ? Number(body.maxLength) : null;

    const updated = await prisma.quotationQuestion.update({
      where: { id },
      data: body,
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteQuotationQuestion(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.quotationQuestion.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'سوال استعلام حذف شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function reorderQuotationQuestions(req: Request, res: Response) {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ success: false, error: 'questions array is required' });
    }
    await Promise.all(
      questions.map((q: { id: string; order: number }) =>
        prisma.quotationQuestion.update({
          where: { id: q.id },
          data: { order: q.order },
        })
      )
    );
    return res.status(200).json({ success: true, message: 'ترتیب سوالات به‌روزرسانی شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// FAQ MANAGEMENT
// ---------------------------------------------------------
export async function getFaqs(req: Request, res: Response) {
  try {
    await ensureSeedKnowledgeData();
    const { search, category } = req.query;

    const faqs = await prisma.fAQ.findMany({
      where: {
        ...(category ? { insuranceType: String(category) } : {}),
        ...(search
          ? {
              OR: [
                { question: { contains: String(search) } },
                { answer: { contains: String(search) } },
                { keywords: { contains: String(search) } },
              ],
            }
          : {}),
      },
      orderBy: { usageCount: 'desc' },
    });

    return res.status(200).json({ success: true, count: faqs.length, data: faqs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createFaq(req: Request, res: Response) {
  try {
    const { question, answer, insuranceType, keywords, priority, status } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ success: false, error: 'سوال و پاسخ الزامی است.' });
    }

    const faq = await prisma.fAQ.create({
      data: {
        question,
        answer,
        insuranceType: insuranceType || 'عمومی',
        keywords: keywords || '',
        priority: priority ? Number(priority) : 1,
        status: status || 'APPROVED',
      },
    });

    return res.status(201).json({ success: true, data: faq });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateFaq(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updated = await prisma.fAQ.update({
      where: { id },
      data: body,
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteFaq(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.fAQ.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'FAQ با موفقیت حذف شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// RESPONSE TEMPLATES & OBJECTIONS
// ---------------------------------------------------------
export async function getResponseTemplates(req: Request, res: Response) {
  try {
    await ensureSeedKnowledgeData();
    const { category } = req.query;

    const templates = await prisma.responseTemplate.findMany({
      where: category ? { category: String(category) } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, count: templates.length, data: templates });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createResponseTemplate(req: Request, res: Response) {
  try {
    const { title, category, scenario, content, variables, status } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({ success: false, error: 'عنوان، دسته‌بندی و متن الگوی پاسخ الزامی است.' });
    }

    const template = await prisma.responseTemplate.create({
      data: {
        title,
        category,
        scenario: scenario || '',
        content,
        variables: typeof variables === 'string' ? variables : JSON.stringify(variables || []),
        status: status || 'APPROVED',
      },
    });

    return res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// KNOWLEDGE GAPS
// ---------------------------------------------------------
export async function getKnowledgeGaps(req: Request, res: Response) {
  try {
    await ensureSeedKnowledgeData();
    const gaps = await prisma.knowledgeGap.findMany({
      orderBy: { frequency: 'desc' },
    });

    return res.status(200).json({ success: true, count: gaps.length, data: gaps });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateKnowledgeGapStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const gap = await prisma.knowledgeGap.update({
      where: { id },
      data: { status },
    });

    return res.status(200).json({ success: true, data: gap });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// GLOBAL KNOWLEDGE SEARCH
// ---------------------------------------------------------
export async function searchKnowledge(req: Request, res: Response) {
  try {
    const { query } = req.query;
    if (!query || String(query).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'پارامتر جستجو الزامی است' });
    }

    const q = String(query).trim();

    const [products, faqs, templates, questions] = await Promise.all([
      prisma.insuranceProduct.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { description: { contains: q } },
            { coverage: { contains: q } },
          ],
        },
        take: 5,
      }),
      prisma.fAQ.findMany({
        where: {
          OR: [
            { question: { contains: q } },
            { answer: { contains: q } },
            { keywords: { contains: q } },
          ],
        },
        take: 5,
      }),
      prisma.responseTemplate.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { content: { contains: q } },
            { scenario: { contains: q } },
          ],
        },
        take: 5,
      }),
      prisma.quotationQuestion.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { fieldName: { contains: q } },
          ],
        },
        include: { product: { select: { name: true } } },
        take: 5,
      }),
    ]);

    return res.status(200).json({
      success: true,
      query: q,
      results: {
        products,
        faqs,
        templates,
        questions,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// PRODUCT URL MAPS MANAGEMENT & INTELLIGENCE RESOLUTION
// ---------------------------------------------------------
export async function getUrlMaps(req: Request, res: Response) {
  try {
    await ensureSeedKnowledgeData();
    const maps = await prisma.productUrlMap.findMany({
      include: {
        product: {
          select: { id: true, name: true, category: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, count: maps.length, data: maps });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createUrlMap(req: Request, res: Response) {
  try {
    const { url, pageTitle, productId, category, productType, quotationEnabled, aiEnabled, relatedKnowledge } = req.body;

    if (!url || !productId) {
      return res.status(400).json({ success: false, error: 'آدرس URL و شناسه محصول الزامی است.' });
    }

    const cleanUrl = normalizeUrlPath(url);

    const mapEntry = await prisma.productUrlMap.create({
      data: {
        url: cleanUrl,
        pageTitle: pageTitle || cleanUrl,
        productId,
        category: category || 'عمومی',
        productType: productType || 'quotation',
        quotationEnabled: quotationEnabled !== undefined ? quotationEnabled : true,
        aiEnabled: aiEnabled !== undefined ? aiEnabled : true,
        relatedKnowledge: typeof relatedKnowledge === 'string' ? relatedKnowledge : JSON.stringify(relatedKnowledge || []),
      },
    });

    return res.status(201).json({ success: true, data: mapEntry });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateUrlMap(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body;

    if (body.url) {
      body.url = normalizeUrlPath(body.url);
    }
    if (body.relatedKnowledge && typeof body.relatedKnowledge !== 'string') {
      body.relatedKnowledge = JSON.stringify(body.relatedKnowledge);
    }

    const updated = await prisma.productUrlMap.update({
      where: { id },
      data: body,
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteUrlMap(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.productUrlMap.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'نقشه URL حذف شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function testResolveUrl(req: Request, res: Response) {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'پارامتر URL الزامی است' });
    }

    const resolved = await resolveProductByUrl(url);
    const aiContextBlock = await generateProductAiContextBlock(url);

    return res.status(200).json({
      success: true,
      inputUrl: url,
      resolvedProduct: resolved ? resolved.product : null,
      resolvedMap: resolved,
      aiContextBlock,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// KNOWLEDGE ARTICLES
// ---------------------------------------------------------
export async function getArticles(req: Request, res: Response) {
  try {
    await ensureSeedKnowledgeData();
    const { category, status, search } = req.query;
    const where: any = {};
    if (category && category !== 'ALL') where.category = String(category);
    if (status && status !== 'ALL') where.status = String(status);
    if (search) {
      where.OR = [
        { title: { contains: String(search) } },
        { content: { contains: String(search) } },
        { tags: { contains: String(search) } },
      ];
    }
    const articles = await prisma.knowledgeArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return res.status(200).json({ success: true, count: articles.length, data: articles });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createArticle(req: Request, res: Response) {
  try {
    const { title, content, category, tags, status } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'عنوان و متن مقاله الزامی است.' });
    }
    const article = await prisma.knowledgeArticle.create({
      data: {
        title,
        content,
        category: category || 'GENERAL',
        tags: tags || '',
        status: status || 'PUBLISHED',
      },
    });
    return res.status(201).json({ success: true, data: article });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateArticle(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { title, content, category, tags, status } = req.body;
    const updated = await prisma.knowledgeArticle.update({
      where: { id },
      data: { title, content, category, tags, status },
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteArticle(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.knowledgeArticle.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'مقاله حذف شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// LIVE AI RESPONSE TEST (AI Training & Control Center)
// ---------------------------------------------------------
export async function testAiResponse(req: Request, res: Response) {
  const startTime = Date.now();
  try {
    const { question, history, customerId, conversationId } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ success: false, error: 'لطفاً متن سوال را وارد کنید.' });
    }

    await ensureTrainingCenterSeeded();
    await ensureSeedKnowledgeData();

    // Map history to standard message format
    const messageHistory: any[] = [];
    if (Array.isArray(history)) {
      history.forEach((h: any) => {
        messageHistory.push({
          senderType: h.role === 'user' ? 'CUSTOMER' : 'AI',
          content: h.content || '',
        });
      });
    }

    const testCustomer = {
      id: customerId || 'sim_cust_test',
      name: 'کاربر تست مرکز آموزش',
      city: 'تهران',
      leadScore: 65,
    };

    const testConversation = {
      id: conversationId || 'sim_conv_test',
      goftinoChatId: 'sim_chat_test',
      collectedData: {},
    };

    // Execute real Brain Layer with Knowledge Retrieval from Training Center
    const brainResult = await processBrainLayer({
      customer: testCustomer,
      conversation: testConversation,
      userMessageContent: question.trim(),
      messageHistory,
    });

    const durationMs = Date.now() - startTime;
    const responseTimeStr = `${(durationMs / 1000).toFixed(2)} ثانیه`;

    console.log("========== TEST AI EXTRACTED KNOWLEDGE DEBUG ==========");
    console.log(
      "EXTRACTED KNOWLEDGE:",
      JSON.stringify(
        {
          matchedProduct: brainResult.extractedKnowledge?.matchedProduct || null,
          relevantArticles: brainResult.extractedKnowledge?.relevantArticles || null,
          quotationWorkflow: brainResult.extractedKnowledge?.quotationWorkflow || null,
        },
        null,
        2
      )
    );
    console.log("========================================================");

    // Map knowledge items used for display
    const knowledgeUsedList: Array<{ type: string; title: string }> = [];
    if (brainResult.extractedKnowledge.matchedProduct) {
      knowledgeUsedList.push({
        type: 'محصول بیمه‌ای',
        title: brainResult.extractedKnowledge.matchedProduct.name,
      });
    }
    if (brainResult.extractedKnowledge.quotationWorkflow?.nextQuestion) {
      knowledgeUsedList.push({
        type: 'سوال بعدی استعلام قیمت',
        title: brainResult.extractedKnowledge.quotationWorkflow.nextQuestion.title,
      });
    }
    brainResult.extractedKnowledge.relevantFaqs.forEach((f) => {
      knowledgeUsedList.push({ type: 'پرسش متداول (FAQ)', title: f.question });
    });
    brainResult.extractedKnowledge.matchedObjections.forEach((o) => {
      knowledgeUsedList.push({ type: 'راهنمای اعتراض مشتری', title: o.objection });
    });

    const appliedRulesList = brainResult.appliedRules.map((r) => ({
      title: r.title,
      enforcement: r.enforcementLevel === 'STRICT' ? 'الزامی (STRICT)' : 'ترجیحی',
      directive: r.directive,
    }));

    return res.status(200).json({
      success: true,
      data: {
        customerMessage: question,
        question,
        aiResponse: brainResult.replyText,
        responseTime: responseTimeStr,
        intentDetected: brainResult.intent,
        stageDetected: brainResult.stage,
        missingInfo: brainResult.missingInfo,
        modelUsed: brainResult.modelUsed,
        tokens: {
          promptTokens: brainResult.promptTokens,
          completionTokens: brainResult.completionTokens,
          totalTokens: brainResult.promptTokens + brainResult.completionTokens,
        },
        knowledgeUsed: knowledgeUsedList,
        appliedRules: appliedRulesList,
        extractedKnowledge: {
          matchedProduct: brainResult.extractedKnowledge.matchedProduct,
          quotationWorkflow: brainResult.extractedKnowledge.quotationWorkflow,
          relevantFaqs: brainResult.extractedKnowledge.relevantFaqs || [],
          relevantArticles: brainResult.extractedKnowledge.relevantArticles || [],
          matchedObjections: brainResult.extractedKnowledge.matchedObjections || [],
          appliedRules: brainResult.extractedKnowledge.appliedRules || [],
        },
        finalPrompt: `${brainResult.systemPrompt}\n\n═══════════════════════════════════════════════════════════\n${brainResult.userPrompt}`,
        validationVerdict: {
          result: brainResult.validationResult,
          reason: brainResult.validationReason,
          retries: brainResult.retryCount,
        },
        details: {
          customerMessage: question,
          intent: brainResult.intent,
          stage: brainResult.stage,
          missingInfo: brainResult.missingInfo,
          appliedRules: JSON.stringify(appliedRulesList, null, 2),
          retrievedKnowledge: JSON.stringify(brainResult.extractedKnowledge, null, 2),
          finalPrompt: `${brainResult.systemPrompt}\n\n═══════════════════════════════════════════════════════════\n${brainResult.userPrompt}`,
          systemPrompt: brainResult.systemPrompt,
          userPrompt: brainResult.userPrompt,
          rawResponse: brainResult.replyText,
          collectedData: brainResult.collectedData,
          validationResult: `${brainResult.validationResult} (${brainResult.validationReason})`,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in testAiResponse:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/knowledge/ai-behavior
 * Returns all dynamic AI behavior rules
 */
export async function getAiBehavior(req: Request, res: Response) {
  try {
    const rules = await getAllBehaviorRules();
    return res.status(200).json({ success: true, data: rules });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/knowledge/ai-behavior
 * Creates a new dynamic rule
 */
export async function createAiBehavior(req: Request, res: Response) {
  try {
    const rule = await createBehaviorRule(req.body);
    return res.status(201).json({ success: true, data: rule, message: 'قانون رفتار جدید با موفقیت ایجاد شد.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /api/knowledge/ai-behavior/:id
 * Updates an existing dynamic rule
 */
export async function updateAiBehavior(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const rule = await updateBehaviorRule(id, req.body);
    return res.status(200).json({ success: true, data: rule, message: 'قانون رفتار با موفقیت به روزرسانی شد.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /api/knowledge/ai-behavior/:id
 * Deletes a dynamic rule
 */
export async function deleteAiBehavior(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await deleteBehaviorRule(id);
    return res.status(200).json({ success: true, message: 'قانون رفتار با موفقیت حذف شد.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /api/knowledge/ai-behavior/reorder
 * Reorders dynamic rules
 */
export async function reorderAiBehavior(req: Request, res: Response) {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
    }
    await reorderBehaviorRules(orderedIds);
    return res.status(200).json({ success: true, message: 'ترتیب قوانین با موفقیت تغییر یافت.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}



