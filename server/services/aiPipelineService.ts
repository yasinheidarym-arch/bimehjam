import OpenAI from 'openai';
import prisma from '../db/client';
import axios from 'axios';
import { processBrainLayer } from './brainLayerService';
import { getAiMode } from './settingService';
import { createSystemTask } from './taskService';
import { resolveGoftinoAiPolicy } from './goftinoAiPolicyService';

const DEFAULT_GOFTINO_HANDOFF_MESSAGE = 'برای بررسی دقیق درخواست شما، همکاران متخصص بیمه جم ادامهٔ گفتگو را پیگیری می‌کنند. 🌹';

function customerGoftinoTopicId(metadata?: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    return typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).goftinoTopicId === 'string'
      ? (parsed as Record<string, unknown>).goftinoTopicId as string
      : null;
  } catch {
    return null;
  }
}

function policyHandoffResult(message: string, reason: string) {
  return {
    intent: 'Goftino Policy Handoff',
    stage: 'Human Handoff',
    missingInfo: '',
    loadedKnowledgeSummary: 'Goftino policy blocked specialized retrieval.',
    extractedKnowledge: { matchedProduct: null, relevantFaqs: [], relevantArticles: [], matchedObjections: [], quotationWorkflow: null },
    appliedRules: [],
    systemPrompt: '',
    userPrompt: '',
    finalPromptSnippet: '',
    replyText: message,
    collectedData: {},
    promptTokens: 0,
    completionTokens: 0,
    validationResult: 'PASSED' as const,
    validationReason: reason,
    retryCount: 0,
    modelUsed: 'Goftino Policy Allowlist',
    policyHandoff: true,
  };
}

// Helper to log steps to DB
export async function createAiLog(data: {
  conversationId?: string;
  customerId?: string;
  messageId?: string;
  step: string;
  status: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  details?: string;
  durationMs?: number;
}) {
  try {
    return await prisma.aiLog.create({
      data: {
        conversationId: data.conversationId,
        customerId: data.customerId,
        messageId: data.messageId,
        step: data.step,
        status: data.status,
        details: data.details,
        durationMs: data.durationMs || 0,
      },
    });
  } catch (err) {
    console.error('Failed to save AiLog:', err);
  }
}

// Helper to parse Goftino API error codes according to official docs
function parseGoftinoError(resData: any): string {
  if (!resData) return 'پاسخی از سرور گفتینو دریافت نشد';
  const code = String(resData.code || '');
  const codeDescriptions: Record<string, string> = {
    '1': 'پارامتر goftino-key ارسالی نامعتبر است (کلید API اشتباه است)',
    '2': 'پارامترهای ارسالی نامعتبر است (شناسه chat_id یا operator_id در سیستم گفتینو وجود ندارد)',
    '3': 'امکان اجرای درخواست با توجه به عدم دسترسی وجود ندارد',
    '4': 'خطای داخلی در انجام درخواست گفتینو رخ داده است',
    '5': 'متد مورد نظر نامعتبر است',
  };
  const desc = codeDescriptions[code] || 'خطای نامشخص در API گفتینو';
  return `Goftino Error Code ${code}: ${desc} (${JSON.stringify(resData)})`;
}

// Function to send message back to Goftino official REST API
export async function sendGoftinoMessage(chatId: string, messageText: string): Promise<{ success: boolean; goftinoMsgId?: string; error?: string }> {
  const apiKey = process.env.GOFTINO_API_KEY;
  const operatorId = process.env.GOFTINO_OPERATOR_ID || '69f9cd36cd6b29dd82c328d0';

  // 1. Pre-flight checks before attempting send_message
  if (!chatId || typeof chatId !== 'string' || chatId.trim() === '') {
    const errStr = '❌ [Goftino API] Aborted send_message: chat_id is missing or empty.';
    console.error(errStr, { chatId });
    return { success: false, error: 'chat_id is missing or empty' };
  }

  if (!operatorId || typeof operatorId !== 'string' || operatorId.trim() === '') {
    const errStr = '❌ [Goftino API] Aborted send_message: operator_id is missing or empty.';
    console.error(errStr, { operatorId });
    return { success: false, error: 'operator_id is missing or empty' };
  }

  if (!messageText || typeof messageText !== 'string' || messageText.trim() === '') {
    const errStr = '❌ [Goftino API] Aborted send_message: message content is empty.';
    console.error(errStr);
    return { success: false, error: 'message text is empty' };
  }

  if (!apiKey) {
    console.warn('⚠️ GOFTINO_API_KEY environment variable is missing.');
    return { success: false, error: 'GOFTINO_API_KEY environment variable is not defined.' };
  }

  const requestBody = {
    chat_id: chatId,
    operator_id: operatorId,
    message: messageText,
  };

  try {
    console.log('==================================================');
    console.log('📤 [Goftino API] OUTGOING POST https://api.goftino.com/v1/send_message');
    console.log('Target chat_id:', chatId);
    console.log('Target operator_id:', operatorId);
    console.log('Request Payload:', JSON.stringify(requestBody, null, 2));
    console.log('==================================================');

    // Official Goftino REST API endpoint
    const response = await axios.post(
      'https://api.goftino.com/v1/send_message',
      requestBody,
      {
        headers: {
          'goftino-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('📥 [Goftino API] HTTP Response Code:', response.status);
    console.log('📥 [Goftino API] Response Body:', JSON.stringify(response.data, null, 2));

    if (response.data && (response.data.status === 'success' || response.data.data?.message_id)) {
      const msgId = response.data.data?.message_id || `goftino_${Date.now()}`;
      return { success: true, goftinoMsgId: msgId };
    } else {
      const formattedErr = parseGoftinoError(response.data);
      console.warn(`⚠️ Goftino API response warning: ${formattedErr}`);
      return { success: false, error: formattedErr, goftinoMsgId: `local_fallback_${Date.now()}` };
    }
  } catch (err: any) {
    const resData = err.response?.data;
    const statusCode = err.response?.status;
    const errorMsg = resData ? parseGoftinoError(resData) : err.message;
    console.error('❌ [Goftino API] Request Failed:', {
      statusCode,
      requestBody,
      responseBody: resData,
      errorMessage: errorMsg,
    });
    return { success: false, error: errorMsg, goftinoMsgId: `local_fallback_${Date.now()}` };
  }
}

// Main AI Pipeline implementation with Brain Layer Engine

// Control Goftino operator typing indicator
export async function setGoftinoTyping(
  chatId: string,
  typingStatus: boolean
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.GOFTINO_API_KEY;
  const operatorId =
    process.env.GOFTINO_OPERATOR_ID || '69f9cd36cd6b29dd82c328d0';

  if (!chatId || typeof chatId !== 'string' || chatId.trim() === '') {
    console.error('❌ [Goftino Typing] chat_id is missing or empty.');
    return { success: false, error: 'chat_id is missing or empty' };
  }

  if (!operatorId || typeof operatorId !== 'string' || operatorId.trim() === '') {
    console.error('❌ [Goftino Typing] operator_id is missing or empty.');
    return { success: false, error: 'operator_id is missing or empty' };
  }

  if (!apiKey) {
    console.error('❌ [Goftino Typing] GOFTINO_API_KEY is not defined.');
    return {
      success: false,
      error: 'GOFTINO_API_KEY environment variable is not defined.',
    };
  }

  const requestBody = {
    chat_id: chatId,
    operator_id: operatorId,
    typing_status: typingStatus ? 'true' : 'false',
  };

  try {
    console.log('==================================================');
    console.log(
      '📤 [Goftino API] OUTGOING POST https://api.goftino.com/v1/operator_typing'
    );
    console.log('Target chat_id:', chatId);
    console.log('Target operator_id:', operatorId);
    console.log('Typing status:', typingStatus);
    console.log('Request Payload:', JSON.stringify(requestBody, null, 2));
    console.log('==================================================');

    const response = await axios.post(
      'https://api.goftino.com/v1/operator_typing',
      requestBody,
      {
        headers: {
          'goftino-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('📥 [Goftino Typing] HTTP Response Code:', response.status);
    console.log(
      '📥 [Goftino Typing] Response Body:',
      JSON.stringify(response.data, null, 2)
    );

    if (response.data?.status === 'success') {
      return { success: true };
    }

    const formattedErr = parseGoftinoError(response.data);
    console.warn(`⚠️ [Goftino Typing] API warning: ${formattedErr}`);

    return {
      success: false,
      error: formattedErr,
    };
  } catch (err: any) {
    console.error('🔥 [Goftino Typing] API ERROR:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });

    return {
      success: false,
      error: err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message,
    };
  }
}

export async function runAiPipelineForMessage(params: {
  conversationId: string;
  customerId: string;
  messageId: string;
  userMessageContent: string;
  aiCategory?: string;
}) {
  const startTime = Date.now();
  const {
    conversationId,
    customerId,
    messageId,
    userMessageContent,
    aiCategory = 'OTHER',
  } = params;

  // 0. Check AI Mode (OFF, TEST_MODE, ACTIVE)
  const aiMode = await getAiMode();
  if (aiMode === 'OFF') {
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'AI Mode Check',
      status: 'INFO',
      details: 'وضعیت هوش مصنوعی در حالت "خاموش (OFF)" قرار دارد. اجرای پایپ‌لاین متوقف گردید.',
      durationMs: Date.now() - startTime,
    });
    return;
  }

  // =========================================================
  // Goftino Typing Indicator
  // Typing فقط اگر پردازش AI بیشتر از 2.5 ثانیه طول بکشد فعال می‌شود.
  // =========================================================
  let typingTimer: NodeJS.Timeout | null = null;
  let typingStarted = false;

  const conversationForTyping = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { goftinoChatId: true },
  });

  const goftinoChatIdForTyping =
    conversationForTyping?.goftinoChatId || '';

  // Centralized safe STOP for every exit path
  const stopGoftinoTyping = async () => {
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }

    if (!typingStarted || !goftinoChatIdForTyping) {
      return;
    }

    try {
      const result = await setGoftinoTyping(
        goftinoChatIdForTyping,
        false
      );

      if (result.success) {
        console.log(
          `⌨️ [Goftino Typing] STOPPED for chat_id=${goftinoChatIdForTyping}`
        );

        await createAiLog({
          conversationId,
          customerId,
          messageId,
          step: 'Goftino Typing Stopped',
          status: 'SUCCESS',
          details: 'Typing به صورت امن متوقف شد.',
        });
      } else {
        console.warn(
          '⚠️ [Goftino Typing] Failed to stop:',
          result.error
        );
      }
    } catch (err: any) {
      console.error(
        '🔥 [Goftino Typing] Stop error:',
        err.message
      );
    }

    typingStarted = false;
  };

  if (goftinoChatIdForTyping) {
    typingTimer = setTimeout(async () => {
      try {
        const result = await setGoftinoTyping(
          goftinoChatIdForTyping,
          true
        );

        if (result.success) {
          typingStarted = true;

          console.log(
            `⌨️ [Goftino Typing] STARTED for chat_id=${goftinoChatIdForTyping}`
          );

          await createAiLog({
            conversationId,
            customerId,
            messageId,
            step: 'Goftino Typing Started',
            status: 'SUCCESS',
            details: 'Typing پس از تأخیر ۲.۵ ثانیه فعال شد.',
          });
        } else {
          console.warn(
            '⚠️ [Goftino Typing] Failed to start:',
            result.error
          );
        }
      } catch (err: any) {
        console.error(
          '🔥 [Goftino Typing] Start error:',
          err.message
        );
      }
    }, 2500);
  }

  try {
  // 1. Webhook Received
  await createAiLog({
    conversationId,
    customerId,
    messageId,
    step: 'Webhook Received',
    status: 'SUCCESS',
    details: `پیام جدید مشتری دریافت شد: "${userMessageContent}" [وضعیت AI: ${aiMode === 'TEST_MODE' ? 'تست مود (TEST_MODE)' : 'فعال (ACTIVE)'}]`,
    durationMs: Date.now() - startTime,
  });

  // 2. Load Customer Profile
  const customerStepStart = Date.now();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) {
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'Customer Loaded',
      status: 'ERROR',
      details: `مشتری با شناسه ${customerId} یافت نشد.`,
      durationMs: Date.now() - customerStepStart,
    });
    return;
  }

  await createAiLog({
    conversationId,
    customerId,
    messageId,
    step: 'Customer Loaded',
    status: 'SUCCESS',
    details: JSON.stringify({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      city: customer.city,
      leadScore: customer.leadScore,
      source: customer.source,
    }, null, 2),
    durationMs: Date.now() - customerStepStart,
  });

  // 3. Load Conversation & Messages
  const convStepStart = Date.now();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        take: 15,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!conversation) {
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'Conversation Loaded',
      status: 'ERROR',
      details: `گفتگو با شناسه ${conversationId} یافت نشد.`,
      durationMs: Date.now() - convStepStart,
    });
    return;
  }

  // Pre-condition Check: Human Operator Active
  if (conversation.status === 'OPERATOR_ACTIVE' || conversation.status === 'WAITING_OPERATOR') {
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'Human Handoff Check',
      status: 'WARNING',
      details: `گفتگو در وضعیت ${conversation.status} است (اپراتور انسانی). پاسخ هوش مصنوعی متوقف شد.`,
      durationMs: Date.now() - convStepStart,
    });
    return;
  }

  // 4. Brain Layer Execution (Intent, Missing Info, Stage, RAG, Prompt, Validation)
  const brainStart = Date.now();
  await createAiLog({
    conversationId,
    customerId,
    messageId,
    step: 'Brain Layer Started',
    status: 'INFO',
    details: 'شروع تحلیل لایه مغز هوش مصنوعی (تشخیص نیت، پارامترهای ناقص، مرحله لید، دانش مرتبط)...',
    durationMs: Date.now() - brainStart,
  });

  const messagesReversed = [...conversation.messages].reverse();

  let brainResult;
  try {

    // Specialized insurance responses are allowed only for an active policy
    // matched by Goftino's stable topic/department identifier.
    const policyDecision = await resolveGoftinoAiPolicy(customerGoftinoTopicId(customer.metadata));

    const handoffRequestRegex = /کارشناس|اپراتور|انسان|تماس|مشاور تلفنی|وصل کن/i;
    const customerRequestedHuman = handoffRequestRegex.test(userMessageContent);

    if (policyDecision.kind === 'HANDOFF') {
      brainResult = policyHandoffResult(
        DEFAULT_GOFTINO_HANDOFF_MESSAGE,
        `Goftino policy decision: ${policyDecision.reason}`,
      );
      await createAiLog({
        conversationId,
        customerId,
        messageId,
        step: 'Goftino AI Policy Check',
        status: 'WARNING',
        details: `پاسخ تخصصی AI متوقف شد: ${policyDecision.reason}`,
      });
    } else if (customerRequestedHuman && customer.phone) {
      console.log("========== HUMAN HANDOFF BY BACKEND RULE ==========");
      console.log({
        customerPhone: customer.phone,
        message: userMessageContent
      });

      brainResult = {
        intent: 'Human Operator Request',
        stage: 'Human Handoff',
        missingInfo: '',
        loadedKnowledgeSummary: '',
        extractedKnowledge: {
          matchedProduct: null,
          relevantFaqs: [],
          relevantArticles: [],
          matchedObjections: [],
          quotationWorkflow: null
        },
        appliedRules: [],
        systemPrompt: '',
        userPrompt: '',
        finalPromptSnippet: '',
        replyText: `چشم ${customer.name || ''} جان 🌹 درخواست تماس شما ثبت شد. کارشناس بیمه جم با شماره ثبت‌شده در اولین فرصت با شما تماس می‌گیرد.`,
        collectedData: {
          phone: customer.phone,
          contactRequest: true
        },
        promptTokens: 0,
        completionTokens: 0,
        validationResult: 'PASSED',
        validationReason: 'Backend human handoff rule',
        retryCount: 0,
        modelUsed: 'Backend Rule Engine',
        task: {
          create: true,
          title: `تماس با مشتری درخواست‌کننده کارشناس - ${customer.name || 'مشتری'}`,
          type: 'Call Customer',
          priority: 'HIGH',
          description: `مشتری درخواست تماس با کارشناس داده است. شماره تماس: ${customer.phone}`
        },
        operatorSummary: `درخواست تماس با کارشناس. شماره موجود در پرونده: ${customer.phone}`
      };

    } else {

      console.log("========== BRAIN CALL DEBUG: BEFORE processBrainLayer ==========");

      brainResult = await processBrainLayer({
        customer,
        conversation,
        userMessageContent,
        messageHistory: messagesReversed,
        allowedCategoryId: policyDecision.policy.insuranceCategoryId,
        goftinoPolicyTitle: policyDecision.policy.goftinoTopicTitle,
      });

    }

    console.log("========== BRAIN CALL DEBUG: AFTER processBrainLayer ==========");
    console.log(JSON.stringify({
      hasBrainResult: !!brainResult,
      replyText: brainResult?.replyText || "",
      modelUsed: brainResult?.modelUsed || "",
    }, null, 2));

    console.log("========== POST-BRAIN DEBUG: NEXT LINE ==========");
    console.log("brainResult.task:", JSON.stringify(brainResult?.task || null, null, 2));
    console.log("brainResult.replyText:", brainResult?.replyText || "");
    console.log("=================================================");

    // Create operator task from AI decision
    if (brainResult.task?.create && brainResult.task.title) {
      try {
        await createSystemTask({
          customerId,
          conversationId,
          title: brainResult.task.title,
          description:
            brainResult.task.description ||
            brainResult.operatorSummary ||
            '',
          type:
            brainResult.task.type ||
            'Call Customer',
          priority:
            brainResult.task.priority ||
            'MEDIUM',
        });

        console.log('========== AI TASK CREATED ==========');
        console.log({
          title: brainResult.task.title,
          type: brainResult.task.type,
          priority: brainResult.task.priority,
        });
        console.log('=====================================');

      } catch (taskError: any) {
        console.error('AI TASK CREATION ERROR:', taskError.message);
      }
    }

    // 4.1 Log Extracted Knowledge from Training Center
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'AI Training Center Knowledge Extracted',
      status: 'SUCCESS',
      details: JSON.stringify({
        matchedProduct: brainResult.extractedKnowledge.matchedProduct?.name || 'عمومی',
        category: brainResult.extractedKnowledge.matchedProduct?.category || 'ALL',
        nextQuestion: brainResult.extractedKnowledge.quotationWorkflow?.nextQuestion?.title || 'تکمیل استعلام',
        relevantFaqsCount: brainResult.extractedKnowledge.relevantFaqs?.length || 0,
        relevantArticlesCount: brainResult.extractedKnowledge.relevantArticles?.length || 0,
        matchedObjectionsCount: brainResult.extractedKnowledge.matchedObjections?.length || 0,
        extractedFields: brainResult.extractedKnowledge.quotationWorkflow?.answeredFields || {},
      }, null, 2),
      durationMs: Date.now() - brainStart,
    });

    // 4.2 Log Applied AI Behavior Rules
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'AI Behavior Rules Applied',
      status: 'SUCCESS',
      details: JSON.stringify({
        totalRulesApplied: brainResult.appliedRules?.length || 0,
        rules: (brainResult.appliedRules || []).map(
          (r) => `[${r.title}] (${r.enforcementLevel}): ${r.directive}`
        ),
      }, null, 2),
      durationMs: Date.now() - brainStart,
    });

    // 4.3 Log Final Prompt Sent to LLM
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'Final Prompt Built',
      status: 'INFO',
      details: JSON.stringify({
        systemPrompt: brainResult.systemPrompt,
        userPrompt: brainResult.userPrompt,
        model: brainResult.modelUsed,
      }, null, 2),
      durationMs: Date.now() - brainStart,
    });

    const tokensCount = (brainResult.promptTokens || 0) + (brainResult.completionTokens || 0);
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'AI Processed',
      status: 'SUCCESS',
      details: JSON.stringify({
        model: brainResult.modelUsed,
        intent: brainResult.intent,
        stage: brainResult.stage,
        aiResponse: brainResult.replyText,
        tokens: {
          promptTokens: brainResult.promptTokens,
          completionTokens: brainResult.completionTokens,
          totalTokens: tokensCount,
        },
        validationResult: brainResult.validationResult,
        validationReason: brainResult.validationReason,
      }, null, 2),
      durationMs: Date.now() - brainStart,
    });
  } catch (err: any) {
    await createAiLog({
      conversationId,
      customerId,
      messageId,
      step: 'Brain Layer Error',
      status: 'ERROR',
      details: `خطا در اجرای لایه مغز: ${err.message}`,
      durationMs: Date.now() - brainStart,
    });

    return;
  }

  console.log("========== AI PIPELINE DEBUG: BEFORE REPLY PROCESSING ==========");

  const aiReplyText = brainResult.replyText;

  const isTestModeActive = aiMode === 'TEST_MODE';

  console.log("AI REPLY:", aiReplyText);
  console.log("AI TEST MODE:", isTestModeActive);

  // Save AI Response Message to Message Table
  const aiMessageId = `ai_msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const savedAiMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sender: 'ai',
      senderType: 'AI',
      content: aiReplyText,
      messageId: aiMessageId,
      channel: 'goftino',
      messageType: 'TEXT',
      isTestMode: isTestModeActive,
      metadata: JSON.stringify({
        isTestMode: isTestModeActive,
        notice: isTestModeActive ? 'این پاسخ فقط برای بررسی مدیر ایجاد شده و برای مشتری ارسال نشده است.' : '',
        modelUsed: brainResult.modelUsed,
        intent: brainResult.intent,
        stage: brainResult.stage,
        validationResult: brainResult.validationResult,
      }),
    },
  });

  // Prepare collectedData JSON string for persistence
  const updatedCollectedDataStr = JSON.stringify(brainResult.collectedData || {});

  // Update Conversation status & collectedData
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: brainResult.policyHandoff ? 'WAITING_OPERATOR' : 'AI_HANDLING',
      lastMessage: aiReplyText,
      lastMessageAt: new Date(),
      collectedData: updatedCollectedDataStr,
    },
  });

  // Also sync extracted customer details (name, city, phone) to Customer if detected
  const cd = brainResult.collectedData || {};
  const extractedName = cd['نام'] || cd['نام کاربر'] || cd['نام مشتری'];
  const extractedCity = cd['شهر'] || cd['محل سکونت'];
  const extractedPhone = cd['تلفن'] || cd['شماره تماس'] || cd['شماره همراه'];

  if (extractedName || extractedCity || extractedPhone) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        ...(extractedName && customer.name === 'مشتری گفتینو' ? { name: String(extractedName) } : {}),
        ...(extractedCity && (!customer.city || customer.city === 'نامشخص') ? { city: String(extractedCity) } : {}),
        ...(extractedPhone && !customer.phone ? { phone: String(extractedPhone) } : {}),
      },
    }).catch((e) => console.warn('Non-blocking customer sync warning:', e));
  }

  // Send AI response back to Goftino ONLY if AI mode is ACTIVE
  if (isTestModeActive) {
    await createAiLog({
      conversationId,
      customerId,
      messageId: savedAiMessage.id,
      step: 'AI Test Mode - Output Stored Locally',
      status: 'INFO',
      details: '[🧪 تست مود فعال] پاسخ هوش مصنوعی فقط در دیتابیس ذخیره شد و در پنل مدیریت گفتگو نمایش داده می‌شود. به دلیل فعال بودن حالت AI Test Mode، هیچ پیامی به گفتینو و کاربر ارسال نگردید.',
      durationMs: 0,
    });
  } else {
    // =========================================================
    // Send final AI response to Goftino
    // =========================================================
    const goftinoStepStart = Date.now();

    const sendResult = await sendGoftinoMessage(
      conversation.goftinoChatId || customer.goftinoChatId || '',
      aiReplyText
    );

    if (sendResult.success) {
      await createAiLog({
        conversationId,
        customerId,
        messageId: savedAiMessage.id,
        step: 'Goftino Response Sent',
        status: 'SUCCESS',
        details: `[Goftino Response Sent] chat_id: ${conversation.goftinoChatId}, API status: SUCCESS, message_id: ${sendResult.goftinoMsgId}`,
        durationMs: Date.now() - goftinoStepStart,
      });
    } else {
      await createAiLog({
        conversationId,
        customerId,
        messageId: savedAiMessage.id,
        step: 'Goftino Response Sent',
        status: 'WARNING',
        details: `[Goftino Response Sent] chat_id: ${conversation.goftinoChatId}, API status: FAILED, error: ${sendResult.error}`,
        durationMs: Date.now() - goftinoStepStart,
      });
    }
  }

  // 7. Pipeline Completed
  await createAiLog({
    conversationId,
    customerId,
    messageId: savedAiMessage.id,
    step: 'Completed',
    status: 'SUCCESS',
    details: `پایپ‌لاین هوش مصنوعی در حالت [${isTestModeActive ? '🧪 AI Test Mode' : 'فعال (ACTIVE)'}] در مدت ${Date.now() - startTime} میلی‌ثانیه با موفقیت انجام شد.`,
    durationMs: Date.now() - startTime,
  });

  } finally {
    // Typing باید در هر شرایطی هنگام پایان Pipeline متوقف شود.
    await stopGoftinoTyping();
  }
}
