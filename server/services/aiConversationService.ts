import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import prisma from '../db/client';
import { STATIC_SYSTEM_PROMPT } from '../config/systemPrompt';
import { getFormattedAiBehaviorPrompt } from './aiBehaviorService';
import { sendMessage as prepareGoftinoReply } from './goftinoReplyService';
import { resolveProductByUrl } from './productIntelligenceService';
import { getOrCreateQuotationSession, processSessionAnswers, extractQuotationAnswersWithGemini } from './quotationWorkflowService';
import { quotationQuestionReply } from './quotationConversationFlow';
import { createTimelineEvent } from './timelineService';
import { getAiConfig } from './settingService';
import { dispatchTaskCreatedSms } from './fastNotifySmsService';
import { assertActiveTaskType } from './taskTypeCatalogService';


// Initialize Gemini Client with User-Agent
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || 'DUMMY_KEY_FOR_LOCAL',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface AiProcessOptions {
  conversationId: string;
  messageId?: string;
}

export interface AiOutputSchema {
  answer: string;
  lead_score: number;
  lead_status: 'cold' | 'warm' | 'hot' | string;
  need_human: boolean;
  handoff_to_operator: boolean;
  collected_data: Record<string, any>;
  customer_data: {
    name?: string;
    phone?: string;
    city?: string;
  };
  tags: string[];
  summary: string;
}

/**
 * Returns the static system prompt as per architecture.
 */
export async function getActiveSystemPrompt(): Promise<string> {
  return STATIC_SYSTEM_PROMPT;
}

/**
 * Main AI Conversation Engine service adhering strictly to backend architecture:
 * - AI only converses and collects quotation inquiry data.
 * - AI never generates quotations, prices, or policies.
 * - Backend manages workflow, state, collected data, remaining questions, tasks, and timeline.
 */
export async function processAiConversation({ conversationId, messageId }: AiProcessOptions) {
  // 1. Load Conversation and Customer
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 30,
      },
    },
  });

  if (!conversation) {
    throw new Error(`Conversation not found for ID: ${conversationId}`);
  }

  // HUMAN HANDOFF RULE: If human operator is active or conversation is paused/closed, skip AI
  if (
    conversation.status === 'WAITING_FOR_EXPERT' ||
    conversation.status === 'PRICE_SENT_TO_CUSTOMER' ||
    conversation.status === 'NEGOTIATION' ||
    conversation.status === 'PURCHASE_REQUEST' ||
    conversation.status === 'POLICY_ISSUED' ||
    conversation.status === 'CLOSED' ||
    conversation.aiStatus === 'PAUSED' ||
    conversation.aiStatus === 'HANDED_OFF' ||
    conversation.aiStatus === 'DISABLED'
  ) {
    console.log(`⏹️ AI skipped for conversation ${conversationId}: status is ${conversation.status}`);
    return {
      skipped: true,
      reason: `Conversation is currently handled by human operator (status: ${conversation.status}).`,
      conversationStatus: conversation.status,
    };
  }

  const customer = conversation.customer;

  // Extract latest customer message
  const latestCustomerMessage =
    [...conversation.messages].reverse().find((m) => m.sender === 'customer' || m.senderType === 'CUSTOMER')?.content ||
    conversation.lastMessage ||
    'سلام';

  // Record Customer Replied Timeline Event if message exists
  if (latestCustomerMessage && latestCustomerMessage !== 'سلام') {
    await createTimelineEvent({
      customerId: customer.id,
      conversationId: conversation.id,
      type: 'CUSTOMER_REPLIED',
      title: 'پیام جدید مشتری دریافت شد',
      description: latestCustomerMessage.length > 80 ? `${latestCustomerMessage.substring(0, 80)}...` : latestCustomerMessage,
      actor: 'CUSTOMER',
    });
  }

  // Parse existing collected data memory directly from conversation or customer metadata
  let existingCollectedData: Record<string, any> = {};
  try {
    if (conversation.collectedData && conversation.collectedData !== '{}') {
      existingCollectedData = JSON.parse(conversation.collectedData);
    } else if (customer.metadata) {
      existingCollectedData = JSON.parse(customer.metadata);
    }
  } catch (e) {
    existingCollectedData = {};
  }

  // Sync customer profile data into collectedData
  // Prevent asking questions for information already available.
  if (customer.phone && !existingCollectedData.phone) {
    existingCollectedData.phone = customer.phone;
  }

  if (customer.name && !existingCollectedData.name) {
    existingCollectedData.name = customer.name;
  }

  // Sync customer profile aliases
  // Prevent asking for data already available in customer record.
  if (customer.name && !existingCollectedData.customerName) {
    existingCollectedData.customerName = customer.name;
  }

  if (customer.phone && !existingCollectedData.phoneNumber) {
    existingCollectedData.phoneNumber = customer.phone;
  }

  // Normalize common phone field names from previous sources
  if (
    existingCollectedData.phoneNumber &&
    !existingCollectedData.phone
  ) {
    existingCollectedData.phone = existingCollectedData.phoneNumber;
  }

  // Normalize common quotation fields
  // Prevent asking customer for data already collected.
  const fieldAliases: Record<string, string[]> = {
    phone: ['phone', 'phoneNumber', 'mobile', 'mobileNumber', 'contactPhone'],
    name: ['name', 'fullName', 'customerName'],
  };

  for (const [target, aliases] of Object.entries(fieldAliases)) {
    if (!existingCollectedData[target]) {
      const found = aliases.find(
        (key) => existingCollectedData[key]
      );

      if (found) {
        existingCollectedData[target] = existingCollectedData[found];
      }
    }
  }

  const customerPageUrl =
    existingCollectedData.pageUrl ||
    existingCollectedData.currentPage ||
    existingCollectedData.url ||
    existingCollectedData.page ||
    '';

  // BACKEND WORKFLOW CONTROL:
  // 1. Resolve product by URL or message content
  let resolvedMap = customerPageUrl ? await resolveProductByUrl(customerPageUrl) : null;
  let activeProduct = resolvedMap?.product || null;

  if (!activeProduct) {
    const products = await prisma.insuranceProduct.findMany({
      where: { status: 'ACTIVE' },
      include: {
        quotationQuestions: { orderBy: { order: 'asc' } },
        knowledgeItems: true,
      },
    });
    const msgLower = latestCustomerMessage.toLowerCase();
    activeProduct = products.find((p) =>
      p.name.toLowerCase().includes(msgLower) ||
      (msgLower.includes('ثالث') && p.category === 'VEHICLE') ||
      (msgLower.includes('آتش') && p.category === 'PROPERTY') ||
      (msgLower.includes('مدیر') && p.category === 'RESPONSIBILITY') ||
      (msgLower.includes('آسانسور') && p.category === 'RESPONSIBILITY')
    ) || products[0] || null;
  }

  // 2. Process quotation session answers via backend logic
  let quotationSession = null;
  let remainingQuestionObj = null;
  let remainingQuestionTitles: string[] = [];
  let quotationCompleted = false;
  let quotationStarted = false;
  let newFieldsExtractedCount = 0;

  if (activeProduct) {
    quotationSession = await getOrCreateQuotationSession({
      conversationId: conversation.id,
      productId: activeProduct.id,
    });
    quotationStarted = true;

    // Extract any new answers present in customer message using Gemini extraction
    const qQuestions = quotationSession.workflow?.questions || [];
    if (qQuestions.length > 0 && latestCustomerMessage.trim()) {
      const extracted = await extractQuotationAnswersWithGemini(latestCustomerMessage, qQuestions);
      if (Object.keys(extracted).length > 0) {
        newFieldsExtractedCount = Object.keys(extracted).length;
        existingCollectedData = { ...existingCollectedData, ...extracted };
        await processSessionAnswers(quotationSession.id, extracted, 'ai_extracted');

        // Log Timeline Event for Collected Data Updated
        await createTimelineEvent({
          customerId: customer.id,
          conversationId: conversation.id,
          type: 'COLLECTED_DATA_UPDATED',
          title: 'اطلاعات استعلام قیمت به روزرسانی شد',
          description: `فیلدهای استخراج شده: ${Object.keys(extracted).join('، ')}`,
          actor: 'AI',
          metadata: extracted,
        });
      }
    }

    const evaluation = await processSessionAnswers(quotationSession.id, {}, 'customer');
    existingCollectedData = { ...existingCollectedData, ...evaluation.collectedData };
    quotationCompleted = evaluation.isCompleted;
    remainingQuestionObj = evaluation.nextQuestion;

    if (quotationSession.workflow?.questions) {
      remainingQuestionTitles = quotationSession.workflow.questions
        .filter((q) => !existingCollectedData[q.fieldName])
        .map((q) => q.title);
    }
  }

  // 3. Backend determines conversation state & human handoff
  const lowerMsg = latestCustomerMessage.toLowerCase();
  const customerRequestedOperator =
    lowerMsg.includes('اپراتور') ||
    lowerMsg.includes('کارشناس') ||
    lowerMsg.includes('انسان') ||
    lowerMsg.includes('تماس تلفنی') ||
    lowerMsg.includes('ارتباط با کارشناس');

  console.log('HANDOFF DEBUG:', {
    latestCustomerMessage,
    customerPhone: customer.phone,
    customerRequestedOperator,
    collectedData: existingCollectedData
  });

  const needHuman = quotationCompleted || customerRequestedOperator;

  // If customer requested human contact and phone already exists,
  // do not ask quotation workflow questions again.
  if (customerRequestedOperator && customer.phone) {
    existingCollectedData.phone = customer.phone;
    existingCollectedData.phoneNumber = customer.phone;
    remainingQuestionObj = null;
  }

  // Determine conversation status based on core backend specification
  let newConversationStatus = 'AI_CONVERSATION';
  let newAiStatus = 'ACTIVE';

  if (quotationCompleted) {
    newConversationStatus = 'READY_FOR_PRICE_REQUEST';
    newAiStatus = 'HANDED_OFF';
  } else if (quotationStarted && remainingQuestionObj) {
    newConversationStatus = 'COLLECTING_QUOTATION_INFORMATION';
    newAiStatus = 'ACTIVE';
  } else if (customerRequestedOperator) {
    newConversationStatus = 'WAITING_FOR_EXPERT';
    newAiStatus = 'HANDED_OFF';
  }

  // BUILD 10-LAYER PROMPT PAYLOAD (EXACT ORDER):
  const layer2_AiBehavior = await getFormattedAiBehaviorPrompt();

  const layer3_CurrentPage = `=== صفحه جاری مشتری ===
• آدرس صفحه: ${customerPageUrl || 'صفحه اصلی / چت پشتیبانی آنلاین بیمه جم'}
• موضوع محصول: ${activeProduct ? activeProduct.name : 'مشاوره عمومی بیمه'}`;

  const productsFromDb = await prisma.insuranceProduct.findMany({
    where: { status: 'ACTIVE' },
    select: { name: true, category: true, description: true, coverage: true, purchaseConditions: true },
  });
  const layer4_ProductKnowledge = `=== دانش محصولات بیمه‌ای (بیمه جم) ===
${productsFromDb
  .map(
    (p) =>
      `• ${p.name} (${p.category}): ${p.description || ''} | پوشش: ${p.coverage || 'کامل'} | شرایط: ${p.purchaseConditions || 'عادی'}`
  )
  .join('\n')}`;

  const faqsFromDb = await prisma.fAQ.findMany({ where: { status: 'APPROVED' }, take: 8 });
  const layer5_FAQ = `=== سوالات متداول ===
${faqsFromDb.map((f) => `• سوال: ${f.question}\n  پاسخ: ${f.answer}`).join('\n')}`;

  const layer7_ConversationState = `=== وضعیت گفتگو (محاسبه شده توسط بک‌اند) ===
• وضعیت جاری (status): ${newConversationStatus}
• محصول بیمه‌ای: ${activeProduct ? activeProduct.name : 'نامشخص'}
• استعلام خودکار تکمیل شده: ${quotationCompleted ? 'بله' : 'خیر'}
• درخواست کارشناس انسانی: ${customerRequestedOperator ? 'بله' : 'خیر'}`;

  const layer6_CustomerProfile = `=== اطلاعات پرونده مشتری ===

اطلاعات زیر از پرونده مشتری در سیستم دریافت شده است.
این اطلاعات معتبر است و نباید دوباره از مشتری درخواست شود.

• نام مشتری: ${customer.name || 'ثبت نشده'}
• شماره تماس: ${customer.phone || 'ثبت نشده'}`;

  // Layer 8: Collected Data (Stored independently from chat messages)
  const layer8_CollectedData = `=== اطلاعات استعلام دریافت شده تا این لحظه (ثبت شده در دیتابیس بک‌اند) ===

این اطلاعات قبلاً دریافت یا استخراج شده است.
به هیچ عنوان اطلاعات موجود در این بخش را دوباره از مشتری درخواست نکنید.

${Object.keys(existingCollectedData).length > 0
  ? Object.entries(existingCollectedData).map(([k, v]) => `• ${k}: ${v}`).join('\n')
  : '(هنوز فیلدی دریافت نشده است)'}`;

  // Layer 9: Remaining Questions (Backend Determined ONLY - AI receives next question)
  const layer9_RemainingQuestions = remainingQuestionObj
    ? `=== سوال بعدی جهت استعلام (تعیین شده توسط بک‌اند) ===
فقط این یک سوال را به زبان محترمانه و صمیمی مطرح بفرمایید: "${remainingQuestionObj.title}" ${remainingQuestionObj.options && remainingQuestionObj.options !== '[]' ? `( گزینه‌ها: ${remainingQuestionObj.options} )` : ''}`
    : quotationCompleted
    ? `=== وضعیت استعلام ===
تمامی پاسخ‌های بیمه‌ای دریافت شده‌اند، اما درخواست هنوز ثبت یا ارجاع نشده است. از ادعای ثبت، صدور، قیمت قطعی یا زمان تضمینی خودداری کنید.`
    : `=== وضعیت استعلام ===
در حال حاضر سوالی در انتظار پاسخ نیست.`;

  const recentMessages = conversation.messages.slice(-8);
  const layer10_History = `=== تاریخچه گفتگوهای اخیر ===
${recentMessages
  .map((m) => {
    const sender = m.sender === 'customer' || m.senderType === 'CUSTOMER' ? 'خریدار' : 'دستیار AI';
    return `[${sender}]: ${m.content}`;
  })
  .join('\n')}`;

  const layer11_LatestMessage = `=== آخرین پیام مشتری ===
"${latestCustomerMessage}"`;

  const fullPayloadPrompt = [
    layer2_AiBehavior,
    layer3_CurrentPage,
    layer6_CustomerProfile,
    layer4_ProductKnowledge,
    layer5_FAQ,
    layer7_ConversationState,
    layer8_CollectedData,
    layer9_RemainingQuestions,
    layer10_History,
    layer11_LatestMessage,
  ].join('\n\n');

  // Request OpenAI (GPT-5 or configured model) to produce natural response text & internal summary for operators
  let aiAnswerText = '';
  let internalOperatorSummary = '';

  const aiConfig = await getAiConfig();
  const openAiKey = aiConfig.openaiApiKey || process.env.OPENAI_API_KEY;

  // Backend controlled human handoff:
  // If customer requested operator and phone exists, do not call GPT.
  if (!aiAnswerText && openAiKey) {
    try {
      const openai = new OpenAI({ apiKey: openAiKey });
      const targetModel = aiConfig.openaiModel || 'gpt-5';
      let jsonResponse = '{}';

      try {
        const completion = await openai.chat.completions.create({
          model: targetModel,
          messages: [
            {
              role: 'system',
              content: `${STATIC_SYSTEM_PROMPT}\n\nپاسخ را حتماً در قالب JSON با کلیدهای answer (متن پاسخ فارسی به مشتری) و operator_summary (خلاصه برای کارشناس بیمه) ارائه کنید.`
            },
            {
              role: 'user',
              content: fullPayloadPrompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: aiConfig.temperature || 0.6,
        });
        jsonResponse = completion.choices[0]?.message?.content || '{}';
      } catch (gptErr: any) {
        console.warn(`${targetModel} in conversation service error, falling back to gpt-4o:`, gptErr.message);
        const fallbackCompletion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${STATIC_SYSTEM_PROMPT}\n\nپاسخ را حتماً در قالب JSON با کلیدهای answer (متن پاسخ فارسی به مشتری) و operator_summary (خلاصه برای کارشناس بیمه) ارائه کنید.`
            },
            {
              role: 'user',
              content: fullPayloadPrompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.6,
        });
        jsonResponse = fallbackCompletion.choices[0]?.message?.content || '{}';
      }

      const json = JSON.parse(jsonResponse);
      aiAnswerText = json.answer || '';
      internalOperatorSummary = json.operator_summary || `استعلام ${activeProduct ? activeProduct.name : 'بیمه'} توسط مشتری`;
    } catch (openaiErr) {
      console.warn('OpenAI error in conversation service:', openaiErr);
    }
  }

  if (customerRequestedOperator && customer.phone) {
    aiAnswerText =
      `چشم ${customer.name || ''} جان 🌹 درخواست تماس شما ثبت شد. کارشناس بیمه جم با شماره ثبت‌شده در اولین فرصت با شما تماس می‌گیرد.`;

    internalOperatorSummary =
      `مشتری درخواست تماس با کارشناس دارد. شماره تماس موجود در پرونده: ${customer.phone}`;
  }

  if (!aiAnswerText) {
    aiAnswerText = generateFallbackAnswer(latestCustomerMessage, remainingQuestionObj, quotationCompleted);
    internalOperatorSummary = `کسب اطلاعات استعلام بیمه ${activeProduct ? activeProduct.name : ''}. فیلدها: ${JSON.stringify(existingCollectedData)}`;
  }

  // Legacy/manual AI processing must obey the same deterministic quotation
  // guard as the real Goftino pipeline. The model may provide surrounding
  // conversation elsewhere, but it can never author or rewrite this question.
  if (remainingQuestionObj) {
    aiAnswerText = quotationQuestionReply(remainingQuestionObj);
  }


  // Calculate Lead Score & Lead Status
  const leadScore = quotationCompleted ? 95 : customerRequestedOperator ? 90 : Object.keys(existingCollectedData).length > 0 ? 75 : 50;
  const leadStatus = quotationCompleted || customerRequestedOperator ? 'Hot' : Object.keys(existingCollectedData).length > 0 ? 'Warm' : 'Cold';

  // Sync Lead Pipeline
  // Lead فقط زمانی ساخته می‌شود که مشتری Intent خرید/استعلام داشته باشد.
  try {
    const isSalesIntent =
      intent === 'Insurance Quotation' ||
      customerRequestedOperator ||
      quotationCompleted;

    if (isSalesIntent) {
      const productName = activeProduct?.name || '';

      let insuranceType = 'GENERAL';

      if (productName.includes('ثالث')) {
        insuranceType = 'THIRD_PARTY';
      } else if (productName.includes('بدنه')) {
        insuranceType = 'BODY';
      } else if (productName.includes('درمان')) {
        insuranceType = 'HEALTH';
      } else if (productName.includes('آتش')) {
        insuranceType = 'FIRE';
      } else if (productName.includes('عمر')) {
        insuranceType = 'LIFE';
      } else if (productName.includes('مسئولیت')) {
        insuranceType = 'LIABILITY';
      }

      const existingLead = await prisma.lead.findFirst({
        where: {
          customerId: customer.id,
          conversationId: conversation.id,
        },
      });

      const leadData = {
        insuranceType,
        score: leadScore,
        status:
          quotationCompleted
            ? 'QUALIFIED'
            : customerRequestedOperator
            ? 'IN_PROGRESS'
            : 'NEW',
        intent,
        notes: internalOperatorSummary,
      };

      if (existingLead) {
        await prisma.lead.update({
          where: {
            id: existingLead.id,
          },
          data: leadData,
        });
      } else {
        await prisma.lead.create({
          data: {
            customerId: customer.id,
            conversationId: conversation.id,
            ...leadData,
          },
        });
      }
    }
  } catch (leadError) {
    console.warn('Lead pipeline sync failed:', leadError);
  }

  const aiOutput: AiOutputSchema = {
    answer: aiAnswerText,
    lead_score: leadScore,
    lead_status: leadStatus,
    need_human: needHuman,
    handoff_to_operator: needHuman,
    collected_data: existingCollectedData,
    customer_data: {
      name: customer.name,
      phone: customer.phone,
      city: customer.city,
    },
    tags: ['گفتینو', activeProduct ? activeProduct.name : 'عمومی'],
    summary: internalOperatorSummary,
  };

  // If quotation completed or operator requested, create operator task & log timeline event
  if (needHuman) {
    try {
      const taskTitle = quotationCompleted
        ? `محاسبه و اعلام قیمت بیمه ${activeProduct ? activeProduct.name : ''} - ${customer.name || 'مشتری'}`
        : `درخواست صحبت با کارشناس بیمه - ${customer.name || 'مشتری'}`;

      const task = await prisma.task.create({
        data: {
          title: taskTitle,
          description: `اطلاعات گردآوری شده: ${JSON.stringify(existingCollectedData)}`,
          status: 'Pending',
          priority: 'HIGH',
          type: await assertActiveTaskType(quotationCompleted ? 'Prepare Quotation' : 'Call Customer'),
          source: 'AI',
          assignedUser: customer.assignedOperator || 'کارشناس فروش',
          assignedUserId: conversation.assignedUserId || null,
          customerId: customer.id,
          conversationId: conversation.id,
        },
      });
      await dispatchTaskCreatedSms(task);

      await createTimelineEvent({
        customerId: customer.id,
        conversationId: conversation.id,
        type: 'PRICE_REQUEST_COMPLETED',
        title: 'اطلاعات استعلام قیمت تکمیل و به کارشناس ارجاع شد',
        description: `محصول: ${activeProduct ? activeProduct.name : 'بیمه'}. فیلدهای تکمیل شده: ${Object.keys(existingCollectedData).join('، ')}`,
        actor: 'AI',
        metadata: existingCollectedData,
      });
    } catch (taskErr) {
      console.warn('Could not auto-create quotation task or timeline event:', taskErr);
    }
  } else if (remainingQuestionObj) {
    // Log AI Asked Question Timeline event
    await createTimelineEvent({
      customerId: customer.id,
      conversationId: conversation.id,
      type: 'AI_ASKED_QUESTION',
      title: `طرح سوال استعلام: ${remainingQuestionObj.title}`,
      description: aiAnswerText,
      actor: 'AI',
    });
  }

  // Save AI Response Message
  const aiMessageId = `ai_msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const savedAiMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sender: 'ai',
      senderType: 'AI',
      content: aiOutput.answer,
      messageId: aiMessageId,
      channel: 'goftino',
      messageType: 'TEXT',
    },
  });

  // Prepare outgoing message for Goftino
  if (conversation.goftinoChatId) {
    await prepareGoftinoReply(conversation.goftinoChatId, aiOutput.answer);
  }

  // Update Conversation State in DB
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessage: aiOutput.answer,
      lastMessageAt: new Date(),
      status: newConversationStatus,
      aiStatus: newAiStatus,
      currentProductId: activeProduct ? activeProduct.id : conversation.currentProductId,
      currentProductName: activeProduct ? activeProduct.name : conversation.currentProductName,
      collectedData: JSON.stringify(existingCollectedData),
      remainingQuestions: JSON.stringify(remainingQuestionTitles),
      aiSummary: internalOperatorSummary,
    },
  });

  // Update Customer Record in DB
  let updatedInterestedTypes: string[] = [];
  try {
    if (customer.interestedInsuranceTypes && customer.interestedInsuranceTypes !== '[]') {
      updatedInterestedTypes = JSON.parse(customer.interestedInsuranceTypes);
    }
  } catch (e) {
    updatedInterestedTypes = [];
  }
  if (activeProduct && !updatedInterestedTypes.includes(activeProduct.name)) {
    updatedInterestedTypes.push(activeProduct.name);
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      leadScore: aiOutput.lead_score,
      leadStatus: aiOutput.lead_status,
      interestedInsuranceTypes: JSON.stringify(updatedInterestedTypes),
      metadata: JSON.stringify(existingCollectedData),
      lastActivity: new Date(),
    },
  });

  return {
    success: true,
    conversationId: conversation.id,
    aiMessageId: savedAiMessage.id,
    aiResponse: aiOutput,
    status: newConversationStatus,
  };
}

/**
 * Helper to generate fallback text when Gemini API is unavailable
 */
function generateFallbackAnswer(
  message: string,
  nextQuestion: any | null,
  quotationCompleted: boolean
): string {
  if (quotationCompleted) {
    return 'پاسخ سؤال‌های استعلام کامل شد، اما درخواست هنوز ثبت نشده و به تأیید نهایی مشتری نیاز دارد.';
  }
  if (nextQuestion) {
    return `ممنون از شما. جهت استعلام دقیق، لطفاً مشخص فرمایید: ${nextQuestion.title}؟`;
  }
  return 'سلام! وقت بخیر. من دستیار هوشمند بیمه جم هستم. برای استعلام قیمت بیمه‌نامه، چه نوع بیمه‌ای مد نظر شماست؟';
}
