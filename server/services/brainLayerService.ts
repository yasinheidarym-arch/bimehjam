import OpenAI from 'openai';
import prisma from '../db/client';
import { getAiConfig } from './settingService';
import {
  retrieveRelevantKnowledgeFromTrainingCenter,
  ExtractedKnowledgePayload,
} from './knowledgeRetrievalService';


export interface BrainResult {
  intent: string;
  stage: string;
  missingInfo: string;
  loadedKnowledgeSummary: string;
  extractedKnowledge: ExtractedKnowledgePayload;
  appliedRules: Array<{ id: string; title: string; directive: string; enforcementLevel: string; category: string }>;
  systemPrompt: string;
  userPrompt: string;
  finalPromptSnippet: string;
  replyText: string;
  collectedData: Record<string, any>;
  promptTokens: number;
  completionTokens: number;
  validationResult: 'PASSED' | 'REJECTED' | 'REGENERATED';
  validationReason: string;
  retryCount: number;
  modelUsed: string;

  task?: {
    create: boolean;
    title: string;
    type: string;
    priority: string;
    description: string;
  };

  operatorSummary?: string;
}

// 1. Detect Intent
export function detectIntent(message: string, historyText: string): string {
  // فقط پیام واقعی مشتری بررسی شود؛ تاریخچه شامل پاسخ‌های AI است و باعث تشخیص اشتباه می‌شود
  const text = message.toLowerCase();

  if (text.includes('اپراتور') || text.includes('انسان') || text.includes('مشاور تلفنی') || text.includes('وصل کن') || text.includes('کارشناس انسانی')) {
    return 'Human Operator Request';
  }
  if (text.includes('خسارت') || text.includes('تصادف') || text.includes('غرامت') || text.includes('اعلام خسارت') || text.includes('کروکی')) {
    return 'Claim Support';
  }
  if (text.includes('اقساط') || text.includes('چک') || text.includes('پیش پرداخت') || text.includes('ماهانه') || text.includes('سفته') || text.includes('قسط')) {
    return 'Installment Payment';
  }
  if (text.includes('گران') || text.includes('چرا قیمت نمیدید') || text.includes('تخفیف بیشتر') || text.includes('شرکت دیگر')) {
    return 'Customer Objection';
  }
  if (text.includes('مقایسه') || text.includes('کدام شرکت') || text.includes('تفاوت بیمه') || text.includes('کدام بهتره')) {
    return 'Policy Comparison';
  }
  if (text.includes('تمدید') || text.includes('انقضا') || text.includes('سال قبل') || text.includes('بیمه قبلی') || text.includes('اتمام بیمه')) {
    return 'Policy Renewal';
  }
  if (text.includes('قیمت') || text.includes('استعلام') || text.includes('چقدر میشه') || text.includes('هزینه') || text.includes('نرخ') || text.includes('محاسبه')) {
    return 'Insurance Quotation';
  }
  if (text.includes('شکایت') || text.includes('ناراضی') || text.includes('چرا دیر') || text.includes('کاهش کیفیت')) {
    return 'Complaint';
  }
  return 'General Inquiry';
}

// 2. Detect Missing Information for Quotation
export function detectMissingInfo(intent: string, message: string, historyText: string, quotationWorkflow?: any): string {
  if (quotationWorkflow && quotationWorkflow.nextQuestion) {
    return `نیازمند فیلد: "${quotationWorkflow.nextQuestion.title}" (${quotationWorkflow.nextQuestion.aiQuestion})`;
  }

  return 'اطلاعات استعلام کامل است یا استعلام نیازی ندارد';
}

// 3. Detect Customer Funnel Stage
export function detectCustomerStage(msgCount: number, intent: string, leadScore: number, historyText: string): string {
  // historyText ممکن است شامل پیام‌های تولیدشده توسط AI باشد؛ فقط برای fallback استفاده می‌شود
  const customerOnlyHistory = historyText
    .split('\n')
    .filter((line) => line.startsWith('مشتری:'))
    .join(' ');
  if (intent === 'Claim Support' || intent === 'Policy Renewal') {
    return 'مشتری دارای بیمه‌نامه قبلی (Existing Customer)';
  }
  if (leadScore >= 80 || customerOnlyHistory.includes('صدور') || customerOnlyHistory.includes('خرید قطعی') || customerOnlyHistory.includes('شماره کارت') || customerOnlyHistory.includes('پرداخت')) {
    return 'آماده خرید و صدور (Ready to Buy)';
  }
  if (intent === 'Customer Objection' || intent === 'Policy Comparison' || historyText.includes('تخفیف')) {
    return 'در حال بررسی و مقایسه (Comparing / Objections)';
  }
  if (msgCount > 2) {
    return 'در حال استعلام و گفتگو (Exploring)';
  }
  return 'لید جدید (New Lead)';
}

// 4. Response Policy Validator
export function validateResponse(replyText: string, previousReplies: string[], missingInfo: string): { valid: boolean; reason: string } {
  if (!replyText || replyText.trim().length < 15) {
    return { valid: false, reason: 'پاسخ خیلی کوتاه یا خالی است.' };
  }

  // Check for forbidden evasive phrases
  const evasiveRegex = /با ما تماس بگیرید|به شعبه مراجعه کنید|به وبسایت مراجعه کنید|تماس حاصل فرمایید|جهت کسب اطلاعات بیشتر با شماره|با تلفن.*تماس/i;
  if (evasiveRegex.test(replyText)) {
    return { valid: false, reason: 'پاسخ شامل ارجاع کلیشه‌ای "با ما تماس بگیرید" است و سوال کاربر را در چت حل نکرده است.' };
  }

  // Check for robotic AI cliches
  const roboticRegex = /به عنوان یک مدل زبانی|به عنوان هوش مصنوعی|من یک ربات هستم|امیدوارم حال شما عالی باشد|امیدوارم حالتون عالی باشه/i;
  if (roboticRegex.test(replyText)) {
    return { valid: false, reason: 'لحن رباتیک یا عبارات کلیشه‌ای چت‌جی‌پاتی دیده می‌شود.' };
  }

  // Check for repeated answers
  if (previousReplies.some((p) => p.trim() === replyText.trim())) {
    return { valid: false, reason: 'پاسخ عیناً تکرار پیام قبلی است.' };
  }



  const wordCount = replyText.split(/\s+/).length;
  if (wordCount > 250) {
    return { valid: false, reason: `پاسخ بیش از حد طولانی است (${wordCount} کلمه).` };
  }

  return { valid: true, reason: 'تایید کیفیت و مطابقت با قوانین مرکز آموزش هوش مصنوعی (روان، صمیمی، دقیق و تخصصی)' };
}

// 5. Main Brain Layer Processing
export async function processBrainLayer(params: {
  customer: any;
  conversation: any;
  userMessageContent: string;
  messageHistory: any[];
  allowedCategoryId?: string;
  goftinoPolicyTitle?: string;
}): Promise<BrainResult> {
  const { customer, conversation, userMessageContent, messageHistory, allowedCategoryId, goftinoPolicyTitle } = params;

  const historyText = messageHistory
    .map((m) => `${m.senderType === 'CUSTOMER' ? 'مشتری' : 'مشاور بیمه جم'}: ${m.content}`)
    .join('\n');

  const previousAiReplies = messageHistory
    .filter((m) => m.senderType === 'AI')
    .map((m) => m.content);

  // Parse Existing Collected Data from Conversation
  let existingCollectedData: Record<string, any> = {};
  if (typeof conversation?.collectedData === 'string') {
    try {
      existingCollectedData = JSON.parse(conversation.collectedData);
    } catch {}
  } else if (typeof conversation?.collectedData === 'object' && conversation?.collectedData !== null) {
    existingCollectedData = conversation.collectedData;
  }

  console.log("========== CUSTOMER CONTEXT DEBUG ==========");
  console.log({
    name: customer.name,
    interestedInsuranceTypes: customer.interestedInsuranceTypes,
    metadata: customer.metadata
  });
  console.log("============================================");

  let customerMetadata: Record<string, unknown> = {};
  try {
    customerMetadata = customer.metadata ? JSON.parse(customer.metadata) : {};
  } catch {
    customerMetadata = {};
  }

  // Step 1: Intelligent Knowledge Retrieval from AI Training Center (5 Sources)
  const extractedKnowledge = await retrieveRelevantKnowledgeFromTrainingCenter({
    userMessage: userMessageContent,
    conversationHistoryText: historyText,
    customerContext: {
      name: customer.name,
      city: customer.city,
      pageUrl: typeof customerMetadata.lastUrl === 'string' ? customerMetadata.lastUrl : undefined,
      interestedInsuranceTypes: customer.interestedInsuranceTypes,
      categoryId: allowedCategoryId || null,
      restrictToCategory: Boolean(allowedCategoryId),
    },
    existingCollectedData,
  });

  console.log("========== AI KNOWLEDGE DEBUG ==========");
  console.log(JSON.stringify({
    matchedProduct: extractedKnowledge.matchedProduct,
    appliedRulesCount: extractedKnowledge.appliedRules?.length,
    loadedKnowledgeSummary: extractedKnowledge.loadedKnowledgeSummary,
    promptFormattedKnowledge: extractedKnowledge.promptFormattedKnowledge?.slice(0, 1000),
    quotationWorkflow: extractedKnowledge.quotationWorkflow
  }, null, 2));
  console.log("========== END AI KNOWLEDGE DEBUG ==========");

  // Step 2: Intent & Stage Detection
  const intent = detectIntent(userMessageContent, historyText);
  const stage = detectCustomerStage(messageHistory.length, intent, customer.leadScore || 50, historyText);
  const missingInfo = detectMissingInfo(intent, userMessageContent, historyText, extractedKnowledge.quotationWorkflow);

  const productSelectionRequired =
    extractedKnowledge.productSelectionRequired === true;

  // Step 3: Build Final Dynamic System Prompt with AI Training Center Knowledge Injected
  const systemPrompt = `
شما مشاور حرفه‌ای بیمه جم هستید.

نقش شما پاسخگویی طبیعی و انسانی در چت است.
مانند یک کارشناس واقعی بیمه گفتگو کنید، نه مانند ربات، فرم یا سیستم خودکار.

تصمیم‌های زیر قبلاً توسط سیستم انجام شده‌اند:
- تشخیص نیت مشتری
- مرحله مشتری
- اطلاعات ناقص مورد نیاز
- قوانین رفتاری
- دانش تخصصی مرتبط

شما نباید این موارد را دوباره تحلیل یا تغییر دهید.
وظیفه شما فقط تولید بهترین پاسخ ممکن بر اساس Context ارائه شده است.

${allowedCategoryId ? `رشتهٔ مجاز گفتینو: «${goftinoPolicyTitle || 'ثبت‌شده'}»
فقط دانش و قوانین دستهٔ بیمهٔ مجازِ همین رشته و زیرمجموعه‌های آن را استفاده کن.` : ''}


==============================
قوانین اصلی گفتگو
==============================

1. همیشه فقط به آخرین پیام مشتری پاسخ بده.

تاریخچه گفتگو فقط برای درک شرایط قبلی استفاده می‌شود.

هرگز به پیام‌های قدیمی پاسخ نده.


2. هرگز اطلاعاتی که مشتری نگفته است را حدس نزن.

شامل:
- قیمت بیمه
- مشخصات ساختمان یا غیره
- تخفیف
- شرایط شخصی مشتری
- اطلاعات تماس


3. هرگز قیمت قطعی یا تخمینی ارائه نکن.

اگر سیستم مشخص کرده اطلاعات لازم وجود ندارد:
به شکل طبیعی اطلاعات مورد نیاز را دریافت کن.


4. هرگز به مشتری نگو:
- چه فیلدهایی تکمیل شده
- چه فیلدهایی ناقص است
- سیستم چه اطلاعاتی نیاز دارد

به جای آن مانند یک مشاور واقعی سوال مناسب بپرس.


5. هرگز مکالمه را شبیه فرم یا پرسشنامه نکن.

ممنوع:
«لطفاً اطلاعات زیر را وارد کنید»
«فیلدهای ناقص را تکمیل کنید»
«اطلاعات مورد نیاز شامل...»

مجاز:
«مدل خودروتون رو می‌فرمایید؟»


==============================
سلام و شروع گفتگو
==============================

اگر مشتری فقط سلام کرد:

یک پاسخ کوتاه و انسانی بده.

مثال:
سلام وقت بخیر 🌹
در خدمتتون هستم.

در این مرحله:
- بیمه پیشنهاد نده
- قیمت پیشنهاد نده
- سوال فروش نپرس

منتظر نیاز مشتری بمان.


==============================
پاسخ به سوال مستقیم
==============================

اگر مشتری سوال مشخصی پرسید:

ابتدا پاسخ همان سوال را بده.

سپس فقط اگر واقعاً لازم بود سوال تکمیلی بپرس.


==============================
فرآیند استعلام
==============================

وقتی سیستم اعلام کرده مشتری در فرآیند استعلام است:

اطلاعات لازم را مرحله‌ای دریافت کن.

هر بار فقط مهم‌ترین سوال بعدی را بپرس.

چند سوال را همزمان مطرح نکن.


اگر مشتری چند اطلاعات را در یک پیام ارائه کرد:

آن‌ها را استفاده کن و دوباره همان سوال‌ها را نپرس.


==============================
دانش و محتوا
==============================

از دانش ارائه شده توسط سیستم استفاده کن.

اگر محصول بیمه‌ای مشخص شده است:
- دانش تخصصی همان محصول، مرجع اصلی پاسخ درباره آن محصول است.
- قوانین اختصاصی همان محصول الزام‌آور هستند.
- اطلاعات محصولات دیگر را به این محصول نسبت نده.
- اگر پاسخ سوال در دانش اختصاصی محصول وجود ندارد، حدس نزن.
- دانش عمومی و FAQها فقط در صورتی استفاده شوند که با دانش محصول انتخاب‌شده تناقض نداشته باشند.

اما:
- متن طولانی مقاله را کپی نکن.
- توضیحات اضافی نده.
- فقط اطلاعات مرتبط با سوال مشتری را ارائه کن.


==============================
دانش بازیابی‌شده از مرکز آموزش
==============================

${extractedKnowledge.productSelectionRequired
  ? `
⚠️ وضعیت انتخاب محصول:
هنوز نوع بیمه دقیق مشتری مشخص نشده است.
در این مرحله فقط باید به کمک قوانین عمومی، FAQ و اطلاعات دسته‌بندی شده گفتگو را هدایت کنید.
به هیچ عنوان دانش محصول، قوانین محصول یا سوالات استعلام قیمت را استفاده نکنید.

هدف:
تشخیص نوع بیمه مورد نیاز مشتری.

`
  : extractedKnowledge.promptFormattedKnowledge || 'اطلاعات تخصصی مرتبطی در مرکز آموزش ثبت نشده است.'
}

${extractedKnowledge.noRelevantKnowledge
  ? `
⚠️ محتوای معتبر مرتبطی برای این دسته ثبت نشده است.
هیچ ویژگی، پوشش، قیمت، شرط یا استثنای بیمه‌ای را حدس نزن.
فقط یک سؤال روشن‌کننده و کوتاه برای مشخص‌شدن زیرمجموعه یا نیاز دقیق مشتری بپرس.
`
  : ''}


==============================
قوانین بازیابی‌شده
==============================

${extractedKnowledge.promptFormattedRules || 'قانون اختصاصی مرتبطی برای این سوال ثبت نشده است.'}


==============================
لحن پاسخ
==============================

پاسخ‌ها باید:
- مختصر و مفید باشند.
- فارسی روان باشند.
- کوتاه باشند.
- دوستانه و حرفه‌ای باشند.
- شبیه مکالمه واتساپی باشند.


استفاده نکن:

«به عنوان هوش مصنوعی»
«کاربر گرامی»
«لطفاً موارد زیر را ارسال کنید»
«جهت کسب اطلاعات بیشتر تماس بگیرید»


==============================
ارجاع به کارشناس
==============================

اگر سیستم اعلام کرد handoff فعال است:

فقط یک پاسخ کوتاه و مطمئن‌کننده بده.

مثال:

ممنون از اطلاعاتی که ارائه کردید 🌹
کارشناس تا 5 دقیقه دیگه باهاتون تماس میگیره



==============================
مدیریت اقدام انسانی و ساخت Task
==============================

Task فقط زمانی ایجاد شود که گفتگو به مرحله‌ای رسیده باشد که نیاز به اقدام کارشناس انسانی وجود دارد.

قبل از ایجاد Task:
- ابتدا نیاز مشتری را کامل متوجه شو.
- اطلاعات لازم برای اقدام را از مشتری دریافت کن.
- اطلاعات دریافت شده را در collectedData ذخیره کن.

برای موارد زیر Task ایجاد کن:

1) استعلام قیمت یا خرید بیمه

اگر مشتری درخواست قیمت یا خرید دارد:
- ابتدا سوالات لازم را مرحله‌ای دریافت کن.
- تا زمانی که اطلاعات لازم کامل نشده است Task نساز.
- بعد از تکمیل اطلاعات:

type:
Prepare Quotation


2) پیگیری صدور بیمه‌نامه

اگر مشتری اعلام کرد صدور بیمه انجام نشده یا نیاز به بررسی دارد:

ابتدا اطلاعات لازم را دریافت کن:
- نام ثبت شده در سیستم
- شماره موبایل ثبت درخواست (در صورت نیاز)
- توضیح مشکل

بعد از دریافت اطلاعات:

type:
Follow Up Quote


3) تمدید بیمه

اگر مشتری درخواست تمدید دارد:

اطلاعات لازم را دریافت کن:
- نوع بیمه
- اطلاعات شناسایی لازم

بعد از تکمیل:

type:
Renewal Reminder


4) درخواست تماس با کارشناس

اگر مشتری مستقیماً درخواست ارتباط انسانی داشت:

type:
Call Customer


قوانین مهم:
- برای سلام، تشکر، سوال عمومی یا گفتگوهای آموزشی Task نساز.
- Task با اطلاعات حدسی ساخته نشود.
- عنوان Task باید کوتاه و عملیاتی باشد.
- description باید خلاصه وضعیت مشتری و اطلاعات جمع‌آوری شده باشد.


==============================
خروجی
==============================

خروجی فقط JSON معتبر باشد.

ساختار:

{
  "replyText": "متن پاسخ مشتری",
  "collectedData": {},
  "recommendedNextAction": "",
  "leadScoreUpdate": 0,
  "task": {
    "create": false,
    "title": "",
    "type": "",
    "priority": "",
    "description": ""
  },
  "operatorSummary": ""
}


قوانین task:

- مقدار create فقط زمانی true باشد که اطلاعات لازم برای اقدام انسانی جمع شده باشد.
- اگر هنوز سوالی از مشتری باقی مانده است، create=false باشد.
- title باید یک اقدام مشخص برای کارشناس باشد.
- description باید شامل خلاصه درخواست مشتری و اطلاعات جمع‌آوری‌شده باشد.
- اطلاعاتی که مشتری نگفته است در Task قرار نده.


قوانین collectedData:

- فقط اطلاعاتی را ذخیره کن که مشتری در پیام خودش گفته است.
- پیام‌های قبلی مشتری قابل استفاده هستند.
- پیام‌های تولیدشده توسط مشاور یا سیستم منبع اطلاعات محسوب نمی‌شوند.
- هیچ مقدار پیش‌فرض، نمونه یا حدس ذخیره نکن.
- اگر اطلاعات جدیدی وجود ندارد، مقدار قبلی را تغییر نده.
`;

  const userPrompt = `سابقه گفتگوهای پیشین:\n${historyText || 'این اولین پیام ارسالی مشتری است.'}\n\nپیام جدید مشتری:\n"${userMessageContent}"`;

  const aiConfig = await getAiConfig();
  const apiKey = aiConfig.openaiApiKey || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const openai = new OpenAI({ apiKey });

  let promptTokens = 0;
  let completionTokens = 0;
  let finalReplyText = '';
  let newlyExtractedData: Record<string, any> = {};
  let generatedTask: any = undefined;
  let generatedOperatorSummary = '';
  let validation = { valid: false, reason: '' };
  let retryCount = 0;
  let validationStatus: 'PASSED' | 'REJECTED' | 'REGENERATED' = 'PASSED';
  const targetModel = aiConfig.openaiModel || 'gpt-5';
  let modelUsed = targetModel;

  // Execution & Self-Correction Loop
  while (retryCount <= 2) {
    const currentMessages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    if (retryCount > 0) {
      currentMessages.push({
        role: 'user',
        content: `پاسخ قبلی شما به این دلیل رد شد: "${validation.reason}". لطفاً مجدداً با رعایت دقیق قوانین مرکز آموزش، بدون هیچ ارجاع کلیشه‌ای یا حدس قیمت، سوالات استعلام را به صورت صمیمی، کوتاه و مرحله‌ای بپرسید.`,
      });
    }

    let completionText = '';
    try {
      console.log("========== GPT REQUEST DEBUG ==========");
      console.log("MODEL:", targetModel);
      console.log("MESSAGES:", JSON.stringify(currentMessages, null, 2));
      console.log("======================================");

      const response = await openai.chat.completions.create({
        model: targetModel,
        messages: currentMessages,
        response_format: { type: 'json_object' },
        
      });

      modelUsed = targetModel;
      promptTokens += response.usage?.prompt_tokens || 0;
      completionTokens += response.usage?.completion_tokens || 0;
      completionText = response.choices[0]?.message?.content || '{}';

      console.log("========== GPT RAW RESPONSE ==========");
      console.log(completionText);
      console.log("======================================");
    } catch (err: any) {
      console.error('🔥 BRAIN LAYER PRIMARY ERROR:', {
        message: err.message,
        code: err.code,
        status: err.status,
        type: err.type,
      });
      console.warn(`${targetModel} error in brain layer, attempting gpt-4o fallback:`, err.message);
      modelUsed = 'gpt-4o';
      try {
        const fallbackResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: currentMessages,
          response_format: { type: 'json_object' },
          
        });

        promptTokens += fallbackResponse.usage?.prompt_tokens || 0;
        completionTokens += fallbackResponse.usage?.completion_tokens || 0;
        completionText = fallbackResponse.choices[0]?.message?.content || '{}';
      } catch (fallbackErr: any) {
        console.error('🔥 BRAIN LAYER GPT4 FALLBACK ERROR:', {
          message: fallbackErr.message,
          code: fallbackErr.code,
          status: fallbackErr.status,
          type: fallbackErr.type,
        });
        console.warn('gpt-4o error, attempting gpt-4o-mini fallback:', fallbackErr.message);
        modelUsed = 'gpt-4o-mini';
        const miniFallback = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: currentMessages,
          response_format: { type: 'json_object' },
          
        });
        promptTokens += miniFallback.usage?.prompt_tokens || 0;
        completionTokens += miniFallback.usage?.completion_tokens || 0;
        completionText = miniFallback.choices[0]?.message?.content || '{}';
      }
    }


    console.log("========== BRAIN POST-GPT DEBUG: BEFORE JSON PARSE ==========");

    try {
      const parsed = JSON.parse(completionText);

      console.log("========== BRAIN POST-GPT DEBUG: JSON PARSE SUCCESS ==========");

      finalReplyText = parsed.replyText || '';

      generatedTask = parsed.task || undefined;
      generatedOperatorSummary = parsed.operatorSummary || '';
      if (parsed.collectedData && typeof parsed.collectedData === 'object') {
        const filteredData = Object.fromEntries(
          Object.entries(parsed.collectedData)
            .filter(([_, value]) => value !== '' && value !== null && value !== undefined)
        );

        newlyExtractedData = filteredData;
      }
    } catch (pErr) {
      finalReplyText = completionText;
    }

    console.log("========== BRAIN POST-GPT DEBUG: BEFORE VALIDATION ==========");
    console.log("FINAL REPLY:", finalReplyText);

    // Validate Response against Training Center Policies
    validation = validateResponse(finalReplyText, previousAiReplies, missingInfo);

    console.log("========== BRAIN POST-GPT DEBUG: AFTER VALIDATION ==========");
    console.log("VALIDATION:", JSON.stringify(validation));

    if (validation.valid) {
      if (retryCount > 0) {
        validationStatus = 'REGENERATED';
      }
      break;
    } else {
      validationStatus = 'REJECTED';
      retryCount++;
    }
  }

  // Fallback if still invalid
  if (!validation.valid && !finalReplyText) {
    finalReplyText = `سلام، خوش آمدید. لطفاً بفرمایید در چه زمینه‌ای از خدمات بیمه‌ای نیاز به راهنمایی دارید تا دقیق‌تر راهنمایی‌تان کنم.`;
  }

  const loadedKnowledgeSummary = `[محصول]: ${extractedKnowledge.matchedProduct?.name || 'عمومی'} | [سوال بعدی]: ${extractedKnowledge.quotationWorkflow?.nextQuestion?.title || 'تکمیل'} | [تعداد قوانین فعال]: ${extractedKnowledge.appliedRules.length}`;

  // Record BrainLog in Database
  console.log("========== BRAINLOG DEBUG: BEFORE CREATE ==========");
  console.log(JSON.stringify({
    conversationId: conversation.id,
    customerId: customer.id,
    intent,
    stage,
    validationResult: validationStatus,
  }, null, 2));

  try {
    await prisma.brainLog.create({
      data: {
      conversationId: conversation.id,
      customerId: customer.id,
      intent,
      stage,
      missingInfo,
      loadedKnowledge: loadedKnowledgeSummary,
      promptTokens,
      completionTokens,
      rawPrompt: systemPrompt.substring(0, 1500),
      generatedReply: finalReplyText,
      validationResult: validationStatus,
      validationReason: validation.reason,
      retryCount,
      },
    });

    console.log("========== BRAINLOG DEBUG: CREATE SUCCESS ==========");
  } catch (brainLogError: any) {
    console.error("🔥 BRAINLOG CREATE ERROR:", {
      message: brainLogError?.message,
      code: brainLogError?.code,
      meta: brainLogError?.meta,
      stack: brainLogError?.stack,
    });

    // BrainLog failure must NOT stop the AI response pipeline.
  }

  console.log("========== BRAINLOG DEBUG: CONTINUING TO RETURN ==========");

  const mergedCollectedData = {
    ...existingCollectedData,
    ...(extractedKnowledge.quotationWorkflow?.answeredFields || {}),
    ...newlyExtractedData,
  };

  return {
    intent,
    stage,
    missingInfo,
    loadedKnowledgeSummary,
    extractedKnowledge,
    appliedRules: extractedKnowledge.appliedRules,
    systemPrompt,
    userPrompt,
    finalPromptSnippet: systemPrompt.substring(0, 500),
    replyText: finalReplyText,
    collectedData: mergedCollectedData,
    promptTokens,
    completionTokens,
    validationResult: validationStatus,
    validationReason: validation.reason,
    retryCount,
    modelUsed,
    task: generatedTask,
    operatorSummary: generatedOperatorSummary,
  };
}
