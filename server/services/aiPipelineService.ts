import { withConversationTurn } from './conversationTurnQueue';
import prisma from '../db/client';
import axios from 'axios';
import { processBrainLayer } from './brainLayerService';
import { getEffectiveAiMode, getQuoteResponseSlaMinutes } from './settingService';
import { createSystemTask } from './taskService';
import { resolveGoftinoAiPolicy } from './goftinoAiPolicyService';
import { goftinoAiResponseMode } from './goftinoAiPolicyDecision';
import {
  handoffReasonLabel,
  HumanHandoffNameState,
  HumanHandoffReason,
  resolveHumanHandoffNameRule,
} from './humanHandoffNameFlow';
import { getHumanHandoffRuleConfig, getQuotationCompletionConfig, getQuotationFinalizationRuleContext, isFullNameHandoffRuleActive } from './aiBehaviorService';
import { AiMode, shouldExecuteAi } from '../../shared/aiSchedule';
import {
  offeredPurchaseLinkProductIds,
  PURCHASE_LINK_METADATA_KEY,
} from '../../shared/productPurchaseLink';
import {
  advanceQuotationSubmission,
  completeQuotationSubmissionState,
  handleTerminalQuotationSubmission,
  quotationDeliveryChoice,
  QuotationSubmissionState,
  startQuotationSubmission,
} from './quotationSubmissionFlow';
import { classifyQuotationSummaryResponseWithAi, classifyQuotationTerminalIntentWithAi } from './quotationClassifierService';
import { classifyConversationIntentWithRuntime, classifyQuotationDeliveryChoiceWithRuntime, isSimpleGreeting } from './aiBehaviorRuntime';
import { buildQuotationAudit } from './quotationAudit';
import { coalesceConsecutiveGreetingMessages, GREETING_COALESCE_WINDOW_MS } from '../../shared/conversationGreetingCoalescing';
import { advanceConversationOpeningState, readConversationOpeningState } from '../../shared/conversationOpeningState';
import {
  finalizeQuotationCompletion,
} from './quotationCompletionService';
import { renderQuotationCompletionSuccess } from '../../shared/quotationCompletionRule';
import { processSessionAnswers } from './quotationWorkflowService';

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

function parseConversationCollectedData(value: unknown): Record<string, any> {
  if (typeof value !== 'string') return value && typeof value === 'object' ? value as Record<string, any> : {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

function humanHandoffResult(input: {
  replyText: string;
  collectedData: Record<string, any>;
  reason: HumanHandoffReason;
  fullName?: string | null;
  task?: { create: true; title: string; type: string; priority: string; description: string };
  deferHumanHandoff?: boolean;
  handoffCompleted?: boolean;
}) {
  return {
    intent: 'Human Operator Request', stage: 'Human Handoff', missingInfo: '', loadedKnowledgeSummary: '',
    extractedKnowledge: { matchedProduct: null, relevantFaqs: [], relevantArticles: [], matchedObjections: [], quotationWorkflow: null },
    appliedRules: [], systemPrompt: '', userPrompt: '', finalPromptSnippet: '', replyText: input.replyText,
    collectedData: input.collectedData, promptTokens: 0, completionTokens: 0,
    validationResult: 'PASSED' as const, validationReason: 'Deterministic human handoff name workflow', retryCount: 0,
    modelUsed: 'Backend Rule Engine', task: input.task,
    operatorSummary: input.task?.description || '', deferHumanHandoff: input.deferHumanHandoff,
    handoffReason: input.reason, customerFullName: input.fullName,
    handoffCompleted: input.handoffCompleted ?? Boolean(input.task),
  };
}

type QuotationFinalizationAudit = {
  productId: string;
  productName: string;
  sessionId: string;
  phase: string;
  before: { status: string; step: string } | null;
  after: { status: string; step: string };
  behaviorRuntime?: unknown;
};

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

type AiPipelineParams = {
  conversationId: string;
  customerId: string;
  messageId: string;
  userMessageContent: string;
  aiCategory?: string;
  effectiveAiMode?: AiMode;
  coalescedSourceMessageIds?: string[];
  queueWaitMs?: number;
};

async function coalesceGreetingPipelineTurn(params: AiPipelineParams): Promise<AiPipelineParams> {
  if (!isSimpleGreeting(params.userMessageContent)) return params;
  const trigger = await prisma.message.findUnique({ where: { id: params.messageId }, select: { createdAt: true } });
  if (!trigger) return params;

  await new Promise(resolve => setTimeout(resolve, GREETING_COALESCE_WINDOW_MS));
  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      senderType: 'CUSTOMER',
      createdAt: {
        gte: trigger.createdAt,
        lte: new Date(trigger.createdAt.getTime() + GREETING_COALESCE_WINDOW_MS),
      },
    },
    select: { id: true, content: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const coalesced = coalesceConsecutiveGreetingMessages(params.messageId, messages.map(message => ({
    ...message,
    greetingOnly: isSimpleGreeting(message.content),
  })));
  return coalesced ? {
    ...params,
    messageId: coalesced.messageId,
    userMessageContent: coalesced.userMessageContent,
    coalescedSourceMessageIds: coalesced.sourceMessageIds,
  } : params;
}

export async function runAiPipelineForMessage(params: AiPipelineParams) {
  const queuedAt = Date.now();
  return withConversationTurn(params.conversationId, async () => {
    const queueWaitMs = Date.now() - queuedAt;
    const effectiveParams = await coalesceGreetingPipelineTurn(params);
    const alreadyHandled = await prisma.message.findFirst({
      where: { conversationId: params.conversationId, senderType: 'AI', metadata: { contains: effectiveParams.messageId } },
      select: { id: true },
    });
    if (!alreadyHandled) return runAiPipelineTurn({ ...effectiveParams, queueWaitMs });
  });
}
async function runAiPipelineTurn(params: AiPipelineParams) {
  const startTime = Date.now();
  const {
    conversationId,
    customerId,
    messageId,
    userMessageContent,
    aiCategory = 'OTHER',
    effectiveAiMode,
    coalescedSourceMessageIds = [params.messageId],
  } = params;

  // 0. Check AI Mode (OFF, TEST_MODE, ACTIVE)
  const aiMode = effectiveAiMode ?? await getEffectiveAiMode();
  if (!shouldExecuteAi(aiMode)) {
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

  const scheduleGoftinoTyping = () => {
    if (!goftinoChatIdForTyping || typingTimer || typingStarted) return;
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
  };

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
  const sourceMessage = conversation.messages.find(message => message.id === messageId)
    || await prisma.message.findUnique({ where: { id: messageId } });
  const sourceMetadata = parseConversationCollectedData(sourceMessage?.metadata);
  const quotationTurnBinding = sourceMetadata.quotationTurnBinding || null;

  let brainResult;
  let quotationFinalizationAudit: QuotationFinalizationAudit | null = null;
  try {

    // Specialized insurance responses are allowed only for an active policy
    // matched by Goftino's stable topic/department identifier.
    const policyDecision = await resolveGoftinoAiPolicy(customerGoftinoTopicId(customer.metadata));
    const responseMode = goftinoAiResponseMode(policyDecision);

    if (responseMode === 'SILENT') {
      await createAiLog({
        conversationId,
        customerId,
        messageId,
        step: 'Goftino AI Policy Check',
        status: 'INFO',
        details: 'رشتهٔ گفتینو خاموش است؛ بدون typing، تولید پاسخ، ذخیره پیام AI یا ارسال پیام به گفتینو متوقف شد.',
        durationMs: Date.now() - brainStart,
      });
      return;
    }

    scheduleGoftinoTyping();

    const existingCollectedData = parseConversationCollectedData(conversation.collectedData);
    if (isSimpleGreeting(userMessageContent)) {
      const openingTransition = advanceConversationOpeningState(
        readConversationOpeningState(existingCollectedData.conversationOpeningState),
        'GREETING',
      );
      if (openingTransition.duplicateGreeting) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { collectedData: JSON.stringify({ ...existingCollectedData, conversationOpeningState: openingTransition.state }) },
        });
        await createAiLog({
          conversationId, customerId, messageId,
          step: 'Conversation Opening State', status: 'INFO',
          details: 'ادامهٔ کوتاه greeting در مرحلهٔ آغازین ادغام شد؛ مدل فراخوانی نشد و پاسخ تکراری ارسال نشد.',
          durationMs: Date.now() - brainStart,
        });
        return;
      }
    }
    let customerRequestedHuman = false;
    let preclassifiedIntent: Awaited<ReturnType<typeof classifyConversationIntentWithRuntime>> | null = null;
    let intentClassificationDurationMs = 0;
    try {
      if (isSimpleGreeting(userMessageContent)) throw new Error('INTENT_CLASSIFICATION_NOT_APPLICABLE');
      const intentClassificationStartedAt = Date.now();
      const semanticIntent = await classifyConversationIntentWithRuntime({
        message: userMessageContent,
        recentMessages: messagesReversed.map(message => ({ senderType: message.senderType, content: message.content })),
        context: {
          channel: 'GOFTINO', productId: conversation.currentProductId, intent: null,
          conversationState: conversation.currentProductId ? 'QUOTATION' : 'GENERAL',
          quotationState: existingCollectedData.quotationSubmission?.status || null,
          messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
        },
      });
      intentClassificationDurationMs = Date.now() - intentClassificationStartedAt;
      preclassifiedIntent = semanticIntent;
      customerRequestedHuman = semanticIntent.output.intent === 'Human Operator Request' && semanticIntent.output.confidence >= .75;
    } catch {
      // Narrow provider-unavailable safety fallback; semantic handling is primary.
      customerRequestedHuman = /کارشناس|اپراتور|انسان/.test(userMessageContent);
    }
    let pendingQuotationSubmission = existingCollectedData.quotationSubmission?.pending === true
      ? existingCollectedData.quotationSubmission as QuotationSubmissionState
      : null;
    const requestedHelpAfterAmbiguity = existingCollectedData.quotationTurnState?.ambiguity === 'HELP' && /کارشناس|اپراتور/.test(userMessageContent);
    const productQuotationActive = !requestedHelpAfterAmbiguity && Boolean(
      conversation.currentProductId ||
      existingCollectedData.purchaseLinkState?.status === 'AWAITING_CUSTOMER_CHOICE',
    );
    const pendingHandoff = existingCollectedData.humanHandoff?.pending === true
      ? existingCollectedData.humanHandoff as HumanHandoffNameState
      : null;
    const [fullNameHandoffRuleActive, humanHandoffConfig, quotationCompletionConfig, quotationFinalizationRules, quoteResponseSlaMinutes] = await Promise.all([
      isFullNameHandoffRuleActive(),
      getHumanHandoffRuleConfig(),
      getQuotationCompletionConfig(),
      getQuotationFinalizationRuleContext(),
      getQuoteResponseSlaMinutes(),
    ]);
    const quotationCompletionPrompt = quotationCompletionConfig?.choicePrompt || '';

    let terminalSubmission = existingCollectedData.quotationSubmission
      && ['SUBMITTED', 'FAILED'].includes(existingCollectedData.quotationSubmission.status)
      ? existingCollectedData.quotationSubmission as QuotationSubmissionState
      : null;
    const terminalClassification = terminalSubmission
      ? await classifyQuotationTerminalIntentWithAi({
          message: userMessageContent,
          status: terminalSubmission.status as 'SUBMITTED' | 'FAILED',
          deliveryChoice: terminalSubmission.deliveryChoice,
          recentMessages: messagesReversed.map(message => ({ senderType: message.senderType, content: message.content })),
          behaviorContext: {
            channel: 'GOFTINO', productId: terminalSubmission.productId, categoryId: terminalSubmission.categoryId,
            currentPageUrl: terminalSubmission.currentPageUrl, intent: 'Insurance Quotation', conversationState: 'QUOTATION',
            quotationState: terminalSubmission.status, messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
          },
        })
      : null;
    const terminalDecision = terminalSubmission && terminalClassification && quotationCompletionConfig
      ? handleTerminalQuotationSubmission(terminalSubmission, terminalClassification.intent, quotationCompletionConfig)
      : null;
    if (terminalDecision?.action === 'RETRY') pendingQuotationSubmission = terminalDecision.state;
    if (terminalDecision?.action === 'RELEASE') terminalSubmission = null;

    if (terminalSubmission && terminalDecision?.action === 'REPLY') {
      const successful = terminalSubmission.status === 'SUBMITTED';
      brainResult = humanHandoffResult({
        replyText: terminalDecision.replyText,
        reason: 'QUOTATION_COMPLETED',
        fullName: terminalSubmission.profile?.fullName,
        collectedData: existingCollectedData,
        handoffCompleted: successful,
        deferHumanHandoff: !successful,
      });
      quotationFinalizationAudit = {
        productId: terminalSubmission.productId, productName: terminalSubmission.productName,
        sessionId: terminalSubmission.sessionId, phase: `TERMINAL_${terminalClassification?.intent || 'OTHER'}`,
        before: { status: terminalSubmission.status, step: terminalSubmission.step },
        after: { status: terminalSubmission.status, step: terminalSubmission.step },
        behaviorRuntime: terminalClassification?.behaviorRuntime,
      };
    } else if (pendingQuotationSubmission && quotationCompletionConfig && humanHandoffConfig) {
      const finalizationBefore = { status: pendingQuotationSubmission.status, step: pendingQuotationSubmission.step };
      const submissionMessage = terminalDecision?.action === 'RETRY'
        ? (terminalDecision.route === 'CALL' ? 'تماس' : 'اعلام قیمت در چت')
        : userMessageContent;
      let semanticDeliveryChoice: 'CALL' | 'CHAT' | null = null;
      let deliveryChoiceBehaviorRuntime: unknown = null;
      let summaryDecision = null;
      if (pendingQuotationSubmission.step === 'DELIVERY_CHOICE') {
        try {
          const choice = await classifyQuotationDeliveryChoiceWithRuntime({
            message: submissionMessage,
            recentMessages: messagesReversed.map(message => ({ senderType: message.senderType, content: message.content })),
            context: {
              channel: 'GOFTINO', productId: pendingQuotationSubmission.productId, categoryId: pendingQuotationSubmission.categoryId,
              currentPageUrl: pendingQuotationSubmission.currentPageUrl, intent: 'Insurance Quotation', conversationState: 'QUOTATION',
              quotationState: 'AWAITING_DELIVERY_CHOICE', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
            },
          });
          deliveryChoiceBehaviorRuntime = choice.resolution;
          if (choice.output.confidence >= .75 && choice.output.choice !== 'UNKNOWN') semanticDeliveryChoice = choice.output.choice;
        } catch {
          // The deterministic parser is only a provider-unavailable fallback.
        }
      }
      if (pendingQuotationSubmission.step === 'CONFIRM') {
        const questions = await prisma.quotationQuestion.findMany({
          where: { productId: pendingQuotationSubmission.productId },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        summaryDecision = await classifyQuotationSummaryResponseWithAi({
          message: submissionMessage,
          state: pendingQuotationSubmission,
          questions,
          recentMessages: messagesReversed.map(message => ({ senderType: message.senderType, content: message.content })),
          behaviorContext: {
            channel: 'GOFTINO', productId: pendingQuotationSubmission.productId, categoryId: pendingQuotationSubmission.categoryId,
            currentPageUrl: pendingQuotationSubmission.currentPageUrl, intent: 'Insurance Quotation', conversationState: 'QUOTATION',
            quotationState: 'AWAITING_CONFIRMATION', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
          },
        });
        deliveryChoiceBehaviorRuntime = summaryDecision.behaviorRuntime || null;
        if (summaryDecision.action === 'FIELD_CORRECTION' && summaryDecision.target === 'ANSWER') {
          await processSessionAnswers(
            pendingQuotationSubmission.sessionId,
            { [summaryDecision.fieldName]: summaryDecision.canonicalValue },
            'customer',
          );
        }
      }
      const decision = advanceQuotationSubmission(pendingQuotationSubmission, submissionMessage, semanticDeliveryChoice, humanHandoffConfig, quotationCompletionConfig, summaryDecision);
      const profile = decision.state.profile;
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(profile.fullName ? { name: profile.fullName } : {}),
          ...(profile.mobile ? { phone: profile.mobile } : {}),
          ...(profile.city ? { city: profile.city } : {}),
        },
      });
      if (profile.fullName) customer.name = profile.fullName;
      if (profile.mobile) customer.phone = profile.mobile;
      if (profile.city) customer.city = profile.city;

      if (decision.action === 'ROUTE') {
        const idempotencyKey = 'quotation-completion:' + conversationId + ':' + decision.state.sessionId;
        try {
          const product = await prisma.insuranceProduct.findUnique({
            where: { id: decision.state.productId },
            select: { category: true },
          });
          const outcome = await finalizeQuotationCompletion({
            conversationId,
            customerId,
            sessionId: decision.state.sessionId,
            productId: decision.state.productId,
            productName: decision.state.productName,
            productCategory: product?.category,
            route: decision.route,
            preferredAssignedUserId: conversation.assignedUserId,
            profile,
            answers: decision.state.answers,
            successReply: renderQuotationCompletionSuccess(
              decision.route === 'CALL' ? quotationCompletionConfig.callSuccess : quotationCompletionConfig.chatSuccess,
              quoteResponseSlaMinutes,
              profile.fullName,
            ),
          });
          const finalState = completeQuotationSubmissionState(
            decision.state,
            decision.route,
            idempotencyKey,
            outcome,
          );
          brainResult = humanHandoffResult({
            replyText: outcome.ok ? outcome.replyText : quotationCompletionConfig.failure,
            reason: 'QUOTATION_COMPLETED',
            fullName: profile.fullName,
            collectedData: { ...existingCollectedData, quotationSubmission: finalState },
            handoffCompleted: outcome.ok,
            deferHumanHandoff: !outcome.ok,
          });
        } catch {
          const finalState: QuotationSubmissionState = {
            ...decision.state,
            pending: false,
            status: 'FAILED',
            idempotencyKey,
            smsStatus: 'submission-failed',
            failureReason: 'TASK_OR_LEAD_FAILED',
          };
          brainResult = humanHandoffResult({
            replyText: quotationCompletionConfig.failure,
            reason: 'QUOTATION_COMPLETED',
            collectedData: { ...existingCollectedData, quotationSubmission: finalState },
            deferHumanHandoff: true,
            handoffCompleted: false,
          });
        }
      } else {
        brainResult = humanHandoffResult({
          replyText: decision.replyText,
          reason: 'QUOTATION_COMPLETED',
          collectedData: { ...existingCollectedData, quotationSubmission: decision.state },
          deferHumanHandoff: true,
        });
      }
      quotationFinalizationAudit = {
        productId: decision.state.productId, productName: decision.state.productName,
        sessionId: decision.state.sessionId,
        phase: decision.action === 'ROUTE' ? 'FINAL_SUBMISSION' : pendingQuotationSubmission.step === 'CONFIRM' ? 'SUMMARY_CONFIRMATION' : 'PROFILE_OR_DELIVERY_CHOICE',
        before: finalizationBefore,
        after: {
          status: brainResult.collectedData?.quotationSubmission?.status || decision.state.status,
          step: brainResult.collectedData?.quotationSubmission?.step || decision.state.step,
        },
        behaviorRuntime: deliveryChoiceBehaviorRuntime,
      };
    } else if (pendingHandoff && humanHandoffConfig) {
      const decision = resolveHumanHandoffNameRule({
        ruleActive: fullNameHandoffRuleActive,
        reason: pendingHandoff.reason,
        existingCustomerName: customer.name,
        message: userMessageContent,
        state: pendingHandoff,
        prompts: humanHandoffConfig,
      });
      if (decision.action === 'ASK_NAME') {
        brainResult = humanHandoffResult({
          replyText: decision.replyText,
          reason: pendingHandoff.reason,
          collectedData: { ...existingCollectedData, humanHandoff: decision.state },
          deferHumanHandoff: true,
        });
      } else {
        const reasonText = handoffReasonLabel(decision.reason);
        brainResult = humanHandoffResult({
          replyText: humanHandoffConfig.successPrompt,
          reason: decision.reason,
          fullName: decision.fullName,
          collectedData: {
            ...existingCollectedData,
            humanHandoff: null,
            customerIdentity: { fullName: decision.fullName, status: decision.nameStatus },
            handoffReason: reasonText,
          },
          task: {
            create: true,
            title: decision.reason === 'QUOTATION_COMPLETED' ? 'محاسبه قیمت و تماس با مشتری' : 'تماس با مشتری درخواست‌کننده کارشناس',
            type: decision.reason === 'QUOTATION_COMPLETED' ? 'Prepare Quotation' : 'Call Customer',
            priority: 'HIGH',
            description: `علت ارجاع: ${reasonText}\nنام مشتری: ${decision.fullName || 'ثبت نشده'}`,
          },
        });
      }
    } else if (policyDecision.kind === 'HANDOFF') {
      brainResult = policyHandoffResult(
        humanHandoffConfig?.policyBlockedPrompt || 'پاسخ خودکار تخصصی برای این رشته فعال نیست.',
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
    } else if (customerRequestedHuman && !productQuotationActive && humanHandoffConfig) {
      const decision = resolveHumanHandoffNameRule({ ruleActive: fullNameHandoffRuleActive, reason: 'DIRECT_HUMAN_REQUEST', existingCustomerName: customer.name, prompts: humanHandoffConfig });
      if (decision.action === 'ASK_NAME') {
        brainResult = humanHandoffResult({
          replyText: decision.replyText,
          reason: 'DIRECT_HUMAN_REQUEST',
          collectedData: { ...existingCollectedData, humanHandoff: decision.state },
          deferHumanHandoff: true,
        });
      } else {
        const reasonText = handoffReasonLabel(decision.reason);
        brainResult = humanHandoffResult({
          replyText: humanHandoffConfig.successPrompt,
          reason: decision.reason,
          fullName: decision.fullName,
          collectedData: { ...existingCollectedData, humanHandoff: null, customerIdentity: { fullName: decision.fullName, status: decision.nameStatus }, handoffReason: reasonText },
          task: {
            create: true,
            title: `تماس با مشتری درخواست‌کننده کارشناس - ${decision.fullName || 'نام ثبت نشده'}`,
            type: 'Call Customer', priority: 'HIGH',
            description: `علت ارجاع: ${reasonText}\nنام مشتری: ${decision.fullName || 'ثبت نشده'}`,
          },
        });
      }

    } else {

      const priorPurchaseLinkMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id, senderType: 'AI' },
        select: { metadata: true },
      });

      brainResult = await processBrainLayer({
        customer,
        conversation,
        userMessageContent,
        messageHistory: messagesReversed,
        allowedCategoryId: policyDecision.policy.insuranceCategoryId || undefined,
        goftinoPolicyTitle: policyDecision.policy.goftinoTopicTitle,
        restrictKnowledgeScope: true,
        offeredPurchaseLinkProductIds: offeredPurchaseLinkProductIds(priorPurchaseLinkMessages),
        currentPageUrl: (() => {
          try {
            const metadata = JSON.parse(customer.metadata || '{}');
            return typeof metadata.lastUrl === 'string' ? metadata.lastUrl : null;
          } catch {
            return null;
          }
        })(),
        messageId,
        messageType: sourceMessage?.messageType || 'TEXT',
        quotationTurnBinding,
        preclassifiedIntent,
        preclassifiedIntentDurationMs: intentClassificationDurationMs,
      });

      if (brainResult.suppressAutomaticReply) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { collectedData: JSON.stringify(brainResult.collectedData || existingCollectedData) },
        });
        await createAiLog({
          conversationId, customerId, messageId,
          step: 'Conversation Opening State', status: 'INFO',
          details: brainResult.validationReason === 'STALE_QUOTATION_TURN_SUPPRESSED'
            ? 'پیام به turn قدیمی استعلام متصل بود؛ روی سؤال جدید ذخیره و پاسخ stale ارسال نشد.'
            : 'پیام صرفاً ادامهٔ greeting آغاز مکالمه بود؛ پاسخ خودکار تکراری تولید یا ارسال نشد.',
          durationMs: Date.now() - brainStart,
        });
        return;
      }

      if (brainResult.quotationState?.isCompleted && brainResult.task?.create && !terminalSubmission && quotationCompletionConfig && humanHandoffConfig) {
        const answeredFields = brainResult.extractedKnowledge.quotationWorkflow?.answeredFields || {};
        const answers = (brainResult.extractedKnowledge.quotationWorkflow?.allQuestions || [])
          .filter((question) => answeredFields[question.fieldName] !== undefined && answeredFields[question.fieldName] !== '')
          .map((question) => ({
            order: question.order,
            fieldLabel: question.title,
            fieldName: question.fieldName,
            value: String(answeredFields[question.fieldName]),
          }));
        const submission = startQuotationSubmission({
          sessionId: brainResult.quotationState.sessionId,
          productId: brainResult.quotationState.productId,
          productName: brainResult.quotationState.productName,
          answers,
          existingProfile: { fullName: customer.name, mobile: customer.phone, city: customer.city },
          choicePrompt: quotationCompletionPrompt,
          profilePrompts: humanHandoffConfig,
          completionConfig: quotationCompletionConfig,
          currentPageUrl: brainResult.workflowContext?.currentPageUrl || null,
          categoryId: brainResult.workflowContext?.matchedCategory?.id || null,
          categoryName: brainResult.workflowContext?.matchedCategory?.name || null,
        });
        if (submission.action === 'ROUTE') {
          const idempotencyKey = 'quotation-completion:' + conversationId + ':' + submission.state.sessionId;
          const product = await prisma.insuranceProduct.findUnique({
            where: { id: submission.state.productId }, select: { category: true },
          });
          const outcome = await finalizeQuotationCompletion({
            conversationId, customerId,
            sessionId: submission.state.sessionId,
            productId: submission.state.productId,
            productName: submission.state.productName,
            productCategory: product?.category,
            route: 'CALL',
            preferredAssignedUserId: conversation.assignedUserId,
            profile: submission.state.profile,
            answers: submission.state.answers,
            successReply: renderQuotationCompletionSuccess(
              quotationCompletionConfig.callSuccess,
              quoteResponseSlaMinutes,
              submission.state.profile.fullName,
            ),
          });
          const finalState = completeQuotationSubmissionState(submission.state, 'CALL', idempotencyKey, outcome);
          brainResult.replyText = outcome.ok ? outcome.replyText : quotationCompletionConfig.failure;
          brainResult.collectedData = { ...brainResult.collectedData, quotationSubmission: finalState };
          brainResult.handoffCompleted = outcome.ok;
          brainResult.deferHumanHandoff = !outcome.ok;
        } else {
          brainResult.replyText = submission.replyText;
          brainResult.collectedData = { ...brainResult.collectedData, quotationSubmission: submission.state };
          brainResult.deferHumanHandoff = true;
        }
        brainResult.task = undefined;
        quotationFinalizationAudit = {
          productId: submission.state.productId, productName: submission.state.productName,
          sessionId: submission.state.sessionId, phase: 'START_FINALIZATION', before: null,
          after: { status: submission.state.status, step: submission.state.step },
        };
      }

      if (terminalSubmission) brainResult.task = undefined;
    }

    if (brainResult.customerFullName) {
      await prisma.customer.update({ where: { id: customer.id }, data: { name: brainResult.customerFullName } });
      customer.name = brainResult.customerFullName;
    }

    if (quotationFinalizationAudit) {
      const audit = quotationFinalizationAudit;
      const submissionAuditState = (brainResult.collectedData?.quotationSubmission || existingCollectedData.quotationSubmission || {}) as Partial<QuotationSubmissionState>;
      const product = await prisma.insuranceProduct.findUnique({
        where: { id: audit.productId },
        select: { id: true, name: true, category: true, categoryRef: { select: { id: true, name: true } } },
      });
      const rulePayload = quotationFinalizationRules.map(rule => ({
        title: rule.title, priority: rule.priority, active: rule.active,
        enforcementLevel: rule.enforcementLevel, category: rule.category,
      }));
      if (product) {
        brainResult.extractedKnowledge.matchedProduct = product;
        brainResult.appliedRules = quotationFinalizationRules.filter(rule => rule.active).map(rule => ({
          title: rule.title, directive: rule.directive, enforcementLevel: rule.enforcementLevel,
        }));
        brainResult.loadedKnowledgeSummary = JSON.stringify({
          summary: `[مرحله قطعی استعلام]: ${audit.phase} | [محصول]: ${product.name}`,
          detectedProduct: { id: product.id, name: product.name },
          matchedCategory: product.categoryRef,
          quotationSession: { id: audit.sessionId, status: audit.after.status },
          ...buildQuotationAudit({
            messageId, conversationId, quotationSessionId: audit.sessionId,
            submissionId: submissionAuditState.idempotencyKey || null,
            currentFieldName: null, decisionSource: 'DETERMINISTIC_TERMINAL_HANDLER',
            answerValidation: null,
            responseValidation: { status: 'PASSED', reason: `Deterministic quotation finalization: ${audit.phase}` },
          }),
          finalization: { phase: audit.phase, before: audit.before, after: audit.after, rules: rulePayload, behaviorRuntime: audit.behaviorRuntime || null },
        });
        brainResult.workflowContext = {
          currentPageUrl: submissionAuditState.currentPageUrl || null, currentPageProduct: null,
          detectedProduct: { id: product.id, name: product.name }, purchaseUrl: null,
          purchaseRequested: true, orderedQuestions: [], registrationStatus: audit.after.status,
          matchedCategory: product.categoryRef || (submissionAuditState.categoryId && submissionAuditState.categoryName
            ? { id: submissionAuditState.categoryId, name: submissionAuditState.categoryName }
            : null), currentPageProductSuggestionDecision: 'NONE',
        };
      }
      await prisma.brainLog.create({
        data: {
          conversationId, customerId, messageId,
          intent: brainResult.intent, stage: brainResult.stage,
          missingInfo: audit.after.step === 'DELIVERY_CHOICE' ? 'انتخاب مسیر تماس یا اعلام قیمت در چت' : audit.after.step,
          loadedKnowledge: brainResult.loadedKnowledgeSummary,
          generatedReply: brainResult.replyText,
          validationResult: brainResult.validationResult,
          validationReason: `Deterministic quotation finalization: ${audit.phase}`,
          promptTokens: 0, completionTokens: 0, retryCount: 0,
        },
      }).catch(error => console.warn('Non-blocking quotation finalization BrainLog warning:', error));
    }

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
          assignedUserId: conversation.assignedUserId || undefined,
        });

        console.log('========== AI TASK CREATED ==========');
        console.log({
          title: brainResult.task.title,
          type: brainResult.task.type,
          priority: brainResult.task.priority,
        });
        console.log('=====================================');

        if (brainResult.handoffCompleted) {
          brainResult.replyText = 'درخواست شما با موفقیت ثبت شد و برای بررسی در اختیار کارشناس قرار گرفت.';
        }

      } catch (taskError: any) {
        console.error('AI TASK CREATION ERROR:', taskError.message);
        brainResult.replyText = 'ثبت درخواست در حال حاضر انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.';
        brainResult.handoffCompleted = false;
        brainResult.deferHumanHandoff = true;
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
        workflowContext: brainResult.workflowContext || null,
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
        purchaseLinkRule: brainResult.purchaseLinkOffer?.ruleTitle || null,
        validationReason: brainResult.validationReason,
        performanceTimings: {
          queueWaitMs: params.queueWaitMs || 0,
          ...brainResult.performanceTimings,
        },
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
        sourceMessageId: messageId,
        coalescedSourceMessageIds,
        isTestMode: isTestModeActive,
        notice: isTestModeActive ? 'این پاسخ فقط برای بررسی مدیر ایجاد شده و برای مشتری ارسال نشده است.' : '',
        modelUsed: brainResult.modelUsed,
        intent: brainResult.intent,
        stage: brainResult.stage,
        validationResult: brainResult.validationResult,
        ...(brainResult.purchaseLinkOffer
          ? { [PURCHASE_LINK_METADATA_KEY]: brainResult.purchaseLinkOffer.productId }
          : {}),
      }),
    },
  });

  // Prepare collectedData JSON string for persistence
  const updatedCollectedDataStr = JSON.stringify(brainResult.collectedData || {});
  const productIntentRouting = brainResult.workflowContext?.productIntentRouting;
  const productIntentChanged = Boolean(productIntentRouting)
    && productIntentRouting?.previousActiveProductId !== productIntentRouting?.newActiveProductId;

  // Update Conversation status & collectedData
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: !brainResult.deferHumanHandoff && (brainResult.policyHandoff || brainResult.handoffCompleted || brainResult.quotationState?.isCompleted)
        ? 'WAITING_OPERATOR'
        : 'AI_HANDLING',
      lastMessage: aiReplyText,
      lastMessageAt: new Date(),
      collectedData: updatedCollectedDataStr,
      ...(brainResult.purchaseLinkOffer
        ? { currentProductId: null, currentProductName: null, remainingQuestions: '[]' }
        : brainResult.quotationState
          ? {
              currentProductId: brainResult.quotationState.productId,
              currentProductName: brainResult.quotationState.productName,
              remainingQuestions: JSON.stringify(brainResult.quotationState.remainingQuestions),
            }
          : productIntentChanged
            ? { currentProductId: null, currentProductName: null, remainingQuestions: '[]' }
          : {}),
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
  let goftinoSendMs = 0;
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
    goftinoSendMs = Date.now() - goftinoStepStart;

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
    details: JSON.stringify({
      mode: isTestModeActive ? 'TEST_MODE' : 'ACTIVE',
      totalMs: Date.now() - startTime,
      performanceTimings: {
        queueWaitMs: params.queueWaitMs || 0,
        ...brainResult.performanceTimings,
        goftinoSendMs,
      },
    }, null, 2),
    durationMs: Date.now() - startTime,
  });

  } finally {
    // Typing باید در هر شرایطی هنگام پایان Pipeline متوقف شود.
    await stopGoftinoTyping();
  }
}
