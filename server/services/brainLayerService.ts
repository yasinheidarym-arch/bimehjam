import { advanceQuotationTurn, canonicalQuotationAnswer, canonicalQuotationHistoryPrefill, canonicalQuotationPrefill, isQuotationCorrection, isQuotationInterruption, type QuotationTurnState } from './quotationStateMachine';
import { classifyQuotationTurnWithAi, selectQuotationGuidanceWithAi } from './quotationClassifierService';
import prisma from '../db/client';
import {
  retrieveRelevantKnowledgeFromTrainingCenter,
  ExtractedKnowledgePayload,
} from './knowledgeRetrievalService';
import { getActiveQuotationTurnBinding, getOrCreateQuotationSession, processSessionAnswers } from './quotationWorkflowService';
import { isStaleQuotationTurn, type QuotationTurnBinding } from '../../shared/quotationTurnBinding';
import {
  isInsuranceQuotationRequest,
  isExplicitQuotationFormRequest,
  quotationQuestionReply,
  sortQuotationQuestions,
} from './quotationConversationFlow';
import type { QuotationOptionSelection } from './quotationOptionMatchingService';
import {
  isDirectQuotationWorkflowRequest,
  isAssistedLeadRequest,
  isPositiveQuotationWorkflowResponse,
  isDetectedProductCurrentPage,
  hasRecentProductPurchaseIntent,
  purchaseLinkAwaitingState,
  purchaseLinkAssistedLeadState,
  purchaseLinkDecisionLogSummary,
  purchaseLinkQuotationSelectedState,
  quotationEntryConversionMode,
  quotationQuestionLimitForConversionMode,
  renderQuotationRoutingTemplate,
  shouldOfferProductPurchaseLink,
  shouldWaitForProductPurchaseDecision,
} from '../../shared/productPurchaseLink';
import { resolveProductByUrl } from './productIntelligenceService';
import { buildQuotationAudit } from './quotationAudit';
import { buildAiBehaviorSystemPrompt, classifyConversationIntentOnce, classifyConversationIntentWithRuntime, classifyProductIntentWithRuntime, classifyQuotationRoutingWithRuntime, conversationIntentFamily, isSimpleGreeting, salesFlowAllowedForIntent, simpleGreetingReply, resolveAiBehaviorRules, runAiBehaviorStructuredModel, validateRequestedAction, type ProductRoutingCandidate } from './aiBehaviorRuntime';
import { parseQuotationResponseEngineConfig, QUOTATION_RESPONSE_ENGINE_CATEGORY } from '../../shared/quotationResponseEngine';
import { parseQuotationRoutingTemplates, PURCHASE_LINK_RULE_CATEGORY } from '../../shared/productPurchaseLink';
import { getQuotationCompletionConfig, getQuotationRoutingRule } from './aiBehaviorService';
import {
  categoryProductClarificationReply,
  currentPageProductSuggestionReply,
  CurrentPageProductSuggestionState,
  isCurrentPageProductSuggestionAccepted,
  isCurrentPageProductSuggestionRejected,
  readCurrentPageProductSuggestion,
  shouldOfferCurrentPageProductSuggestion,
} from '../../shared/currentPageProductSuggestion';
import {
  applyProductIntentClassification,
  inferredProductConfirmedByCustomer,
  invalidateStaleProductState,
  PRODUCT_INTENT_ROUTING_RULE_CATEGORY,
  readProductIntentRoutingState,
  type ProductIntentClassification,
} from '../../shared/productIntentRouting';
import { advanceConversationOpeningState, readConversationOpeningState } from '../../shared/conversationOpeningState';
import { productDetectionAliases, uniqueProductDetectionMatch } from './productDetectionAliases';
import { DEFAULT_UNSUPPORTED_MEDIA_REPLY, UNSUPPORTED_MEDIA_RULE_CATEGORY } from '../../shared/unsupportedMediaRule';
import { DEFAULT_INSUFFICIENT_PRODUCT_KNOWLEDGE_REPLY, GROUNDING_SAFETY_RULE_CATEGORY } from '../../shared/groundingSafetyRule';


export interface BrainResult {
  deferHumanHandoff?: boolean;
  suppressAutomaticReply?: boolean;
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
  performanceTimings?: Record<string, number>;

  quotationState?: {
    sessionId: string;
    productId: string;
    productName: string;
    currentQuestionFieldName: string | null;
    currentQuestion: { id: string; order: number; fieldName: string; helpText: string | null } | null;
    remainingQuestions: string[];
    remainingQuestionFields: Array<{ id: string; order: number; fieldName: string; helpText: string | null }>;
    isCompleted: boolean;
    conversionMode: 'ASSISTED_LEAD' | 'ASSISTED_QUOTE';
  };

  purchaseLinkOffer?: {
    productId: string;
    productName: string;
    ruleTitle: string;
    rulePriority: number;
    presentation: 'CURRENT_PAGE' | 'EXTERNAL_LINK';
  };

  workflowContext?: {
    currentPageUrl: string | null;
    currentPageProduct: { id: string; name: string; categoryId: string | null } | null;
    detectedProduct: { id: string; name: string } | null;
    purchaseUrl: string | null;
    purchaseRequested: boolean;
    orderedQuestions: Array<{ order: number; fieldName: string; text: string; helpText?: string | null }>;
    registrationStatus: string;
    matchedCategory: { id: string; name: string } | null;
    currentPageProductSuggestionDecision: 'NONE' | 'OFFERED' | 'AWAITING_CONFIRMATION' | 'ACCEPTED' | 'REJECTED';
    productIntentRouting: Record<string, unknown>;
    conversionMode: 'ASSISTED_LEAD' | 'ASSISTED_QUOTE' | null;
    conversationIntentFamily: 'GREETING' | 'INFORMATIONAL' | 'SALES_QUOTE' | 'SUPPORT_SERVICE';
    salesFlowAllowed: boolean;
    quotationAnswerValidationReason?: string;
    quotationOptionSelection?: QuotationOptionSelection;
  };

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
  // Provider-unavailable fallback only. Business intent classification is
  // semantic and rule-aware in AIBehaviorRuntime.
  void historyText;
  if (isInsuranceQuotationRequest(message)) return 'Insurance Quotation';
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

  const unverifiedOutcomeRegex = /کد\s*یکتا|کمتر از\s*[۰-۹0-9]+\s*دقیقه|تا\s*[۰-۹0-9]+\s*دقیقه.*(تماس|ثبت|صدور)|قیمت\s*قطعی|زمان\s*تضمینی|درخواست.*(?:ثبت|ارسال|ارجاع)\s*(?:شد|گردید)|اطلاعات.*ارجاع\s*(?:شد|گردید)/i;
  if (unverifiedOutcomeRegex.test(replyText)) {
    return { valid: false, reason: 'پاسخ شامل ادعای ثبت، صدور، قیمت یا زمان تضمینی بدون نتیجهٔ واقعی سیستم است.' };
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
  restrictKnowledgeScope?: boolean;
  offeredPurchaseLinkProductIds?: string[];
  currentPageUrl?: string | null;
  messageId?: string;
  messageType?: string;
  quotationTurnBinding?: QuotationTurnBinding | null;
  preclassifiedIntent?: Awaited<ReturnType<typeof classifyConversationIntentWithRuntime>> | null;
  preclassifiedIntentDurationMs?: number;
  preclassifiedIntentAttempted?: boolean;
  prevalidatedBoundAnswer?: string | null;
  prevalidatedBoundAnswerLookupMs?: number;
}): Promise<BrainResult> {
  const { customer, conversation, userMessageContent, messageHistory, allowedCategoryId, goftinoPolicyTitle, restrictKnowledgeScope, offeredPurchaseLinkProductIds = [], currentPageUrl: suppliedCurrentPageUrl, messageId, quotationTurnBinding } = params;
  const performanceTimings: Record<string, number> = {
    intentClassificationMs: params.preclassifiedIntentDurationMs || 0,
    pageProductLookupMs: 0,
    productMetadataLookupMs: 0,
    productClassificationMs: 0,
    knowledgeRetrievalMs: 0,
    quotationRoutingMs: 0,
    behaviorRulesLoadingMs: 0,
    quotationStateProcessingMs: 0,
    responseLlmMs: 0,
    intentLlmCalls: params.preclassifiedIntentAttempted || params.preclassifiedIntent ? 1 : 0,
    productLlmCalls: 0,
    routingLlmCalls: 0,
    answerInterpretationLlmCalls: 0,
    guidanceLlmCalls: 0,
    responseLlmCalls: 0,
    answerInterpretationValidationMs: 0,
    guidanceGenerationMs: 0,
    intentInputChars: params.preclassifiedIntent?.telemetry.inputChars || 0,
    productInputChars: 0,
    routingInputChars: 0,
    answerInterpretationInputChars: 0,
    guidanceInputChars: 0,
    responseInputChars: 0,
    boundQuestionLookupMs: params.prevalidatedBoundAnswerLookupMs || 0,
    postProcessingMs: 0,
  };

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

  let customerMetadata: Record<string, unknown> = {};
  try {
    customerMetadata = customer.metadata ? JSON.parse(customer.metadata) : {};
  } catch {
    customerMetadata = {};
  }

  const currentPageUrl = suppliedCurrentPageUrl || (typeof customerMetadata.lastUrl === 'string' ? customerMetadata.lastUrl : null);
  let boundTypedAnswer = params.prevalidatedBoundAnswer;
  if (boundTypedAnswer === undefined) {
    const boundQuestionLookupStartedAt = Date.now();
    const boundQuestion = quotationTurnBinding?.questionId
      ? await prisma.quotationQuestion.findUnique({ where: { id: quotationTurnBinding.questionId } })
      : null;
    const boundTypedEvidence = !isQuotationCorrection(userMessageContent) && !isQuotationInterruption(userMessageContent)
      ? userMessageContent
      : '';
    boundTypedAnswer = boundQuestion && boundTypedEvidence
      ? await canonicalQuotationAnswer(boundQuestion, boundTypedEvidence)
      : null;
    performanceTimings.boundQuestionLookupMs = Date.now() - boundQuestionLookupStartedAt;
  }
  const pageProductLookupStartedAt = Date.now();
  const currentPageMap = currentPageUrl
    ? await resolveProductByUrl(currentPageUrl, { seedIfEmpty: false, exactOnly: true })
    : null;
  performanceTimings.pageProductLookupMs = Date.now() - pageProductLookupStartedAt;
  const currentPageProduct = currentPageMap?.product &&
    currentPageMap.product.status === 'ACTIVE' && currentPageMap.aiEnabled
    ? {
        id: currentPageMap.product.id,
        name: currentPageMap.product.name,
        categoryId: currentPageMap.product.categoryId || null,
      }
    : null;
  let existingPageSuggestion = readCurrentPageProductSuggestion(existingCollectedData.currentPageProductSuggestion);
  let suggestionAccepted = existingPageSuggestion?.status === 'AWAITING_CONFIRMATION' &&
    isCurrentPageProductSuggestionAccepted(userMessageContent);
  let suggestionRejected = existingPageSuggestion?.status === 'AWAITING_CONFIRMATION' &&
    isCurrentPageProductSuggestionRejected(userMessageContent);
  const unsupportedImage = params.messageType === 'IMAGE';

  // Resolve intent before product discovery. A category or page hint must not
  // turn a greeting or informational request into a sales flow.
  const greetingOnly = isSimpleGreeting(userMessageContent);
  let detectedIntent = greetingOnly ? 'Greeting' : detectIntent(userMessageContent, historyText);
  let semanticIntentResolved = false;
  try {
    if (unsupportedImage || greetingOnly || boundTypedAnswer !== null) throw new Error('INTENT_CLASSIFICATION_NOT_APPLICABLE');
    const intentClassificationStartedAt = Date.now();
    if (params.preclassifiedIntentAttempted && !params.preclassifiedIntent) throw new Error('PRECLASSIFIED_INTENT_UNAVAILABLE');
    const semanticIntent = await classifyConversationIntentOnce({
      message: userMessageContent,
      recentMessages: messageHistory.map(message => ({ senderType: message.senderType, content: message.content })),
      context: {
        channel: 'GOFTINO', productId: conversation.currentProductId || null, categoryId: allowedCategoryId || null,
        currentPageUrl, conversationState: conversation.currentProductId ? 'QUOTATION' : 'GENERAL',
        messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
      },
    }, params.preclassifiedIntent);
    if (!params.preclassifiedIntent) {
      performanceTimings.intentClassificationMs = Date.now() - intentClassificationStartedAt;
      performanceTimings.intentLlmCalls += 1;
    }
    performanceTimings.intentInputChars = semanticIntent.telemetry.inputChars;
    if (!greetingOnly && semanticIntent.output.confidence >= .65) {
      detectedIntent = semanticIntent.output.intent;
      semanticIntentResolved = true;
    }
  } catch {
    // The narrow fallback distinguishes greeting, quote intent and general inquiry.
  }
  if (boundTypedAnswer !== null) {
    detectedIntent = 'Insurance Quotation';
    semanticIntentResolved = true;
  }
  const intentFamily = conversationIntentFamily(detectedIntent);
  const openingTransition = advanceConversationOpeningState(
    readConversationOpeningState(existingCollectedData.conversationOpeningState),
    intentFamily,
  );

  const previousProductRoutingState = readProductIntentRoutingState(existingCollectedData.productIntentRouting);
  const inferredConfirmation = inferredProductConfirmedByCustomer(
    previousProductRoutingState,
    isCurrentPageProductSuggestionAccepted(userMessageContent),
  );
  const productConfirmationAccepted = Boolean(suggestionAccepted || inferredConfirmation);
  const productMetadataLookupStartedAt = Date.now();
  const routingCandidatesRaw = await prisma.insuranceProduct.findMany({
    where: {
      status: 'ACTIVE',
      ...(restrictKnowledgeScope
        ? allowedCategoryId
          ? { categoryId: allowedCategoryId }
          : { id: { in: [] } }
        : {}),
    },
    select: {
      id: true, name: true, description: true, purchaseUrl: true, categoryId: true,
      categoryRef: { select: { name: true } },
      subCategoryRef: { select: { name: true } },
      urlMaps: { where: { aiEnabled: true }, select: { pageTitle: true } },
    },
    orderBy: [{ categoryId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  });
  performanceTimings.productMetadataLookupMs = Date.now() - productMetadataLookupStartedAt;
  const productClassificationStartedAt = Date.now();
  const routingCandidates: ProductRoutingCandidate[] = routingCandidatesRaw.map(product => ({
    id: product.id,
    name: product.name,
    categoryId: product.categoryId || null,
    categoryName: product.categoryRef?.name || null,
    subCategoryName: product.subCategoryRef?.name || null,
    description: (product.description || '').slice(0, 500),
    aliases: productDetectionAliases(product.description),
    pageTitles: product.urlMaps.map(item => item.pageTitle).filter(Boolean).slice(0, 12),
    purchaseUrlAvailable: Boolean(product.purchaseUrl),
  }));
  const previousActiveProductId = previousProductRoutingState?.activeProductId || conversation.currentProductId || null;
  let productRoutingResult = applyProductIntentClassification({
    classification: {
      decision: 'NO_CHANGE', selectedProductId: null, confidence: 0, explicitCorrection: false,
      confirmation: 'NONE', intentSummary: '', reason: 'Semantic routing was not available.', clarificationQuestion: null,
    },
    candidates: routingCandidates,
    previous: previousProductRoutingState,
    legacyActiveProductId: conversation.currentProductId || null,
    originPageProduct: currentPageProduct ? { id: currentPageProduct.id, name: currentPageProduct.name } : null,
  });
  let productRoutingAudit: Record<string, unknown> = {
    originPageProduct: currentPageProduct,
    previousActiveProductId,
    previousConfirmedProductId: previousProductRoutingState?.confirmedProductId || null,
    conversationIntent: detectedIntent,
    conversationIntentFamily: intentFamily,
    decision: 'NO_CHANGE', confidence: 0, reason: 'Semantic routing was not available.',
    newActiveProductId: productRoutingResult.selectedProductId,
    appliedRuleIds: [],
  };
  const directProductMatch = intentFamily === 'GREETING'
    ? null
    : uniqueProductDetectionMatch(userMessageContent, routingCandidatesRaw);
  if (directProductMatch) {
    const directSelection: ProductIntentClassification = {
      decision: 'SELECT_PRODUCT', selectedProductId: directProductMatch.id, confidence: 1,
      explicitCorrection: Boolean(previousActiveProductId && previousActiveProductId !== directProductMatch.id),
      confirmation: 'EXPLICIT', intentSummary: directProductMatch.name,
      reason: 'Latest customer message matched one unique administrator-managed product name or alias.',
      clarificationQuestion: null,
    };
    productRoutingResult = applyProductIntentClassification({
      classification: directSelection, candidates: routingCandidates, previous: previousProductRoutingState,
      legacyActiveProductId: conversation.currentProductId || null,
      originPageProduct: currentPageProduct ? { id: currentPageProduct.id, name: currentPageProduct.name } : null,
    });
    productRoutingAudit = { ...productRoutingAudit, ...directSelection, newActiveProductId: directProductMatch.id, source: 'ADMIN_PRODUCT_ALIAS' };
  } else if (productConfirmationAccepted) {
    const confirmedProductId = existingPageSuggestion?.productId || inferredConfirmation?.productId || null;
    const confirmedProductName = existingPageSuggestion?.productName || inferredConfirmation?.productName || '';
    const accepted: ProductIntentClassification = {
      decision: 'SELECT_PRODUCT', selectedProductId: confirmedProductId, confidence: 1,
      explicitCorrection: false, confirmation: 'EXPLICIT', intentSummary: confirmedProductName,
      reason: 'Customer explicitly accepted the pending product confirmation.', clarificationQuestion: null,
    };
    productRoutingResult = applyProductIntentClassification({
      classification: accepted, candidates: routingCandidates, previous: previousProductRoutingState,
      legacyActiveProductId: conversation.currentProductId || null,
      originPageProduct: currentPageProduct ? { id: currentPageProduct.id, name: currentPageProduct.name } : null,
    });
    productRoutingAudit = { ...productRoutingAudit, ...accepted, newActiveProductId: productRoutingResult.selectedProductId, source: 'PRODUCT_CONFIRMATION' };
  } else if (boundTypedAnswer === null && !unsupportedImage && intentFamily !== 'GREETING' && (intentFamily === 'SALES_QUOTE' || Boolean(previousActiveProductId) || existingPageSuggestion?.status === 'AWAITING_CONFIRMATION')) {
    try {
      performanceTimings.productLlmCalls += 1;
      const semanticProduct = await classifyProductIntentWithRuntime({
        message: userMessageContent,
        recentMessages: messageHistory.map(message => ({ senderType: message.senderType, content: message.content })),
        context: {
          channel: 'GOFTINO', productId: previousActiveProductId, categoryId: allowedCategoryId || null,
          currentPageUrl, conversationState: conversation.currentProductId ? 'QUOTATION' : 'GENERAL',
          messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
        },
        candidates: routingCandidates,
        originPageProductId: previousProductRoutingState?.originPageProductId || currentPageProduct?.id || null,
        previousActiveProductId,
        previousConfirmedProductId: previousProductRoutingState?.confirmedProductId || null,
      });
      performanceTimings.productInputChars = semanticProduct.telemetry.inputChars;
      const ruleApplied = semanticProduct.resolution.selected.some(rule => rule.category === PRODUCT_INTENT_ROUTING_RULE_CATEGORY);
      if (ruleApplied) {
        productRoutingResult = applyProductIntentClassification({
          classification: semanticProduct.output, candidates: routingCandidates, previous: previousProductRoutingState,
          legacyActiveProductId: conversation.currentProductId || null,
          originPageProduct: currentPageProduct ? { id: currentPageProduct.id, name: currentPageProduct.name } : null,
        });
      }
      productRoutingAudit = {
        originPageProduct: currentPageProduct,
        previousActiveProductId,
        previousConfirmedProductId: previousProductRoutingState?.confirmedProductId || null,
        conversationIntent: detectedIntent,
        conversationIntentFamily: intentFamily,
        ...semanticProduct.output,
        newActiveProductId: productRoutingResult.selectedProductId,
        appliedRuleIds: semanticProduct.resolution.selected.map(rule => rule.id),
        source: ruleApplied ? 'AI_BEHAVIOR_RUNTIME' : 'RULE_INACTIVE',
      };
    } catch {
      // Availability fallback preserves the prior product but never promotes the page hint.
    }
  }
  performanceTimings.productClassificationMs = Date.now() - productClassificationStartedAt;
  if (productRoutingResult.changed) {
    const previousQuestionFields = previousActiveProductId
      ? (await prisma.quotationQuestion.findMany({ where: { productId: previousActiveProductId }, select: { fieldName: true } })).map(item => item.fieldName)
      : [];
    existingCollectedData = invalidateStaleProductState(existingCollectedData, previousQuestionFields);
    if (productRoutingAudit.source !== 'PRODUCT_CONFIRMATION') {
      existingPageSuggestion = null;
      suggestionAccepted = false;
      suggestionRejected = false;
    }
  }
  existingCollectedData.productIntentRouting = productRoutingResult.state;

  // Step 1: Intelligent Knowledge Retrieval from AI Training Center (5 Sources)
  const knowledgeRetrievalStartedAt = Date.now();
  const extractedKnowledge = await retrieveRelevantKnowledgeFromTrainingCenter({
    userMessage: userMessageContent,
    conversationHistoryText: historyText,
    customerContext: {
      name: customer.name,
      city: customer.city,
      pageUrl: currentPageUrl || undefined,
      interestedInsuranceTypes: customer.interestedInsuranceTypes,
      categoryId: allowedCategoryId || null,
      productId: intentFamily === 'GREETING'
        ? null
        : productRoutingResult.state.status === 'CONFIRMED'
          ? productRoutingResult.state.confirmedProductId
          : (suggestionAccepted ? existingPageSuggestion?.productId || null : null),
      restrictToCategory: Boolean(restrictKnowledgeScope),
    },
    existingCollectedData,
  });
  performanceTimings.knowledgeRetrievalMs = Date.now() - knowledgeRetrievalStartedAt;

  if (intentFamily !== 'SALES_QUOTE' && !productConfirmationAccepted && !conversation.currentProductId) {
    // Product knowledge may answer an informational question, but its
    // questionnaire must not leak into the response/prompt as a next step.
    extractedKnowledge.quotationWorkflow = null;
  }

  // Product retrieval now follows the already-resolved conversation intent.
  const productPurchaseRequested = productConfirmationAccepted || (semanticIntentResolved
    ? detectedIntent === 'Insurance Quotation'
    : intentFamily === 'GREETING' ? false : hasRecentProductPurchaseIntent(
        userMessageContent,
        messageHistory.filter((message) => message.senderType === 'CUSTOMER').map((message) => message.content),
      ));
  const intent = extractedKnowledge.matchedProduct && productPurchaseRequested
    ? 'Insurance Quotation'
    : detectedIntent;
  let semanticRoutingDecision: string | null = null;
  let semanticRoutingAvailable = false;
  const quotationRoutingStartedAt = Date.now();
  const routingRuleForClassification = await getQuotationRoutingRule();
  try {
    if (unsupportedImage || boundTypedAnswer !== null) throw new Error('ROUTING_NOT_APPLICABLE');
    if (productRoutingResult.clarificationQuestion || intentFamily === 'GREETING' || (intentFamily !== 'SALES_QUOTE' && !conversation.currentProductId && !productRoutingResult.selectedProductId && existingPageSuggestion?.status !== 'AWAITING_CONFIRMATION')) {
      throw new Error('ROUTING_NOT_APPLICABLE');
    }
    performanceTimings.routingLlmCalls += 1;
    const routing = await classifyQuotationRoutingWithRuntime({
      message: userMessageContent,
      recentMessages: messageHistory.map(message => ({ senderType: message.senderType, content: message.content })),
      context: {
        channel: 'GOFTINO', productId: extractedKnowledge.matchedProduct?.id || conversation.currentProductId || null,
        categoryId: extractedKnowledge.matchedCategoryId || allowedCategoryId || null, currentPageUrl, intent,
        conversationState: conversation.currentProductId ? 'QUOTATION' : 'GENERAL', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
      },
      routing: {
        matchedProductId: extractedKnowledge.matchedProduct?.id || null,
        purchaseUrlAvailable: Boolean(extractedKnowledge.matchedProduct?.purchaseUrl),
        currentPageProductId: currentPageProduct?.id || null,
        offeredAlready: Boolean(extractedKnowledge.matchedProduct && new Set(offeredPurchaseLinkProductIds).has(extractedKnowledge.matchedProduct.id)),
        pendingPageSuggestion: existingPageSuggestion?.status === 'AWAITING_CONFIRMATION',
        quotationWorkflowActive: Boolean(conversation.currentProductId),
        assistedQuoteExamples: routingRuleForClassification?.templates.acceptanceExamples || [],
        assistedLeadExamples: routingRuleForClassification?.templates.assistedLeadExamples || [],
      },
    });
    performanceTimings.routingInputChars = routing.telemetry.inputChars;
    semanticRoutingAvailable = true;
    if (routing.output.confidence >= .7) semanticRoutingDecision = routing.output.decision;
  } catch {
    // Provider-unavailable fallback uses the narrow deterministic helpers.
  }
  performanceTimings.quotationRoutingMs = Date.now() - quotationRoutingStartedAt;
  if (semanticRoutingAvailable) {
    suggestionAccepted = semanticRoutingDecision === 'ACCEPT_PAGE_PRODUCT';
    suggestionRejected = semanticRoutingDecision === 'REJECT_PAGE_PRODUCT';
  }
  const stage = detectCustomerStage(messageHistory.length, intent, customer.leadScore || 50, historyText);
  const explicitFormRequested = semanticRoutingDecision === 'REQUEST_LINK_AGAIN' ||
    (!semanticRoutingAvailable && isExplicitQuotationFormRequest(userMessageContent));
  const matchedProductWasOffered = Boolean(
    extractedKnowledge.matchedProduct &&
    new Set(offeredPurchaseLinkProductIds).has(extractedKnowledge.matchedProduct.id),
  );
  const directQuotationRequested = semanticRoutingDecision === 'START_CHAT_QUOTATION' || (!semanticRoutingAvailable && (
    (isDirectQuotationWorkflowRequest(userMessageContent) && !isAssistedLeadRequest(userMessageContent)) ||
    (matchedProductWasOffered && isPositiveQuotationWorkflowResponse(userMessageContent))
  ));
  const assistedLeadRequested = semanticRoutingDecision === 'START_ASSISTED_LEAD'
    || (!semanticRoutingAvailable && isAssistedLeadRequest(userMessageContent));
  const registrationStatus = typeof existingCollectedData.quotationSubmission?.status === 'string'
    ? existingCollectedData.quotationSubmission.status
    : 'NOT_SUBMITTED';
  const behaviorContext = {
    channel: 'GOFTINO',
    productId: extractedKnowledge.matchedProduct?.id || conversation.currentProductId || null,
    categoryId: extractedKnowledge.matchedCategoryId || allowedCategoryId || null,
    currentPageUrl,
    intent,
    conversationState: conversation.currentProductId || (intent === 'Insurance Quotation' && extractedKnowledge.matchedProduct) ? 'QUOTATION' : 'GENERAL',
    quotationState: registrationStatus,
    currentField: extractedKnowledge.quotationWorkflow?.nextQuestion?.fieldName || null,
    messageType: params.messageType || 'CUSTOMER_MESSAGE',
    userRole: 'CUSTOMER',
  };
  const behaviorRulesLoadingStartedAt = Date.now();
  const behaviorRuntime = await resolveAiBehaviorRules(behaviorContext);
  performanceTimings.behaviorRulesLoadingMs = Date.now() - behaviorRulesLoadingStartedAt;
  const quotationCompletionConfig = await getQuotationCompletionConfig();
  const routingRuntimeRule = behaviorRuntime.selected.find(rule => rule.category === PURCHASE_LINK_RULE_CATEGORY);
  const unsupportedMediaRule = behaviorRuntime.selected.find(rule => rule.category === UNSUPPORTED_MEDIA_RULE_CATEGORY);
  const groundingSafetyRule = behaviorRuntime.selected.find(rule => rule.category === GROUNDING_SAFETY_RULE_CATEGORY);
  const routingTemplates = routingRuntimeRule ? parseQuotationRoutingTemplates(routingRuntimeRule.directive) : null;
  const quotationRoutingRule = routingRuntimeRule && routingTemplates ? {
    id: routingRuntimeRule.id, title: routingRuntimeRule.title, status: 'ACTIVE' as const,
    sortOrder: routingRuntimeRule.sortOrder, templates: routingTemplates,
  } : null;
  const responseRuntimeRule = behaviorRuntime.selected.find(rule => rule.category === QUOTATION_RESPONSE_ENGINE_CATEGORY);
  const responseEngineConfig = responseRuntimeRule ? parseQuotationResponseEngineConfig(responseRuntimeRule.directive) : null;
  const quotationResponseEngineRule = responseRuntimeRule && responseEngineConfig ? {
    id: responseRuntimeRule.id, title: responseRuntimeRule.title, status: 'ACTIVE' as const,
    sortOrder: responseRuntimeRule.sortOrder, config: responseEngineConfig,
  } : null;
  const routingRuleActive = quotationRoutingRule?.status === 'ACTIVE';
  const inferredProductConfirmation = intentFamily === 'SALES_QUOTE'
    && productRoutingResult.state.status === 'INFERRED'
    && extractedKnowledge.matchedProduct
    ? (quotationRoutingRule
        ? renderQuotationRoutingTemplate(quotationRoutingRule.templates.pageProductSuggestionResponse, {
            productName: extractedKnowledge.matchedProduct.name,
            categoryName: extractedKnowledge.matchedCategory,
            currentPageUrl,
          })
        : currentPageProductSuggestionReply(extractedKnowledge.matchedProduct.name))
    : null;
  let deterministicReply: string | null = unsupportedImage
    ? unsupportedMediaRule?.instruction || DEFAULT_UNSUPPORTED_MEDIA_REPLY
    : intentFamily === 'GREETING'
    ? simpleGreetingReply(userMessageContent) || 'سلام، وقت بخیر، در خدمتم.'
    : inferredProductConfirmation;
  const quotationStateProcessingStartedAt = Date.now();
  let quotationState: BrainResult['quotationState'];
  let purchaseLinkOffer: BrainResult['purchaseLinkOffer'];
  let quotationInterruptionQuestion: { text: string } | null = null;
  let quotationInvalidReply: string | null = null;
  let quotationValidation: Record<string, unknown> | undefined;
  let quotationAnswerValidationReason: string | null = null;
  let quotationOptionSelection: QuotationOptionSelection | null = null;
  let quotationTurn: Awaited<ReturnType<typeof advanceQuotationTurn>> | null = null;
  let pageProductSuggestionState: CurrentPageProductSuggestionState | null = existingPageSuggestion;
  let pageProductSuggestionDecision: NonNullable<BrainResult['workflowContext']>['currentPageProductSuggestionDecision'] = 'NONE';
  const detectedProductConfirmed = Boolean(
    extractedKnowledge.matchedProduct
    && productRoutingResult.state.confirmedProductId === extractedKnowledge.matchedProduct.id,
  );
  if (!deterministicReply && intentFamily === 'INFORMATIONAL' && detectedProductConfirmed && !extractedKnowledge.productKnowledgeAvailable) {
    deterministicReply = groundingSafetyRule?.instruction || DEFAULT_INSUFFICIENT_PRODUCT_KNOWLEDGE_REPLY;
  }
  const productConfirmedThisTurn = Boolean(
    detectedProductConfirmed
    && productRoutingResult.state.confirmedProductId !== previousProductRoutingState?.confirmedProductId,
  );
  const storedPurchaseSelectionMode = extractedKnowledge.matchedProduct
    && existingCollectedData.purchaseLinkState?.status === 'DETAILED_QUOTATION_SELECTED'
    && existingCollectedData.purchaseLinkState?.productId === extractedKnowledge.matchedProduct.id
    && ['ASSISTED_QUOTE', 'ASSISTED_LEAD'].includes(existingCollectedData.purchaseLinkState?.mode)
    ? existingCollectedData.purchaseLinkState.mode as 'ASSISTED_QUOTE' | 'ASSISTED_LEAD'
    : null;
  const activeSessionBinding = extractedKnowledge.matchedProduct
    ? await getActiveQuotationTurnBinding(conversation.id, extractedKnowledge.matchedProduct.id)
    : null;
  const activeQuotationSession = Boolean(activeSessionBinding);
  const entryConversionMode = quotationEntryConversionMode({
    activeSession: activeQuotationSession,
    currentMode: existingCollectedData.conversionMode,
    storedSelectionMode: storedPurchaseSelectionMode,
    assistedQuoteRequested: directQuotationRequested,
    assistedLeadRequested,
  });
  const awaitingCustomerChoice = Boolean(
    extractedKnowledge.matchedProduct
    && existingCollectedData.purchaseLinkState?.status === 'AWAITING_CUSTOMER_CHOICE'
    && existingCollectedData.purchaseLinkState?.productId === extractedKnowledge.matchedProduct.id,
  );

  if (
    !deterministicReply && suggestionAccepted && existingPageSuggestion &&
    extractedKnowledge.matchedProduct?.id === existingPageSuggestion.productId
  ) {
    pageProductSuggestionDecision = 'ACCEPTED';
    pageProductSuggestionState = { ...existingPageSuggestion, status: 'ACCEPTED' };
  } else if (!deterministicReply && suggestionRejected && existingPageSuggestion) {
    pageProductSuggestionDecision = 'REJECTED';
    pageProductSuggestionState = { ...existingPageSuggestion, status: 'REJECTED' };
    if (!extractedKnowledge.matchedProduct || extractedKnowledge.matchedProduct.id === existingPageSuggestion.productId) {
      extractedKnowledge.matchedProduct = null;
      extractedKnowledge.quotationWorkflow = null;
      extractedKnowledge.productKnowledgeAvailable = false;
      extractedKnowledge.productSelectionRequired = Boolean(extractedKnowledge.matchedCategoryId);
      const categoryName = extractedKnowledge.matchedCategory || existingPageSuggestion.categoryName;
      deterministicReply = quotationRoutingRule
        ? renderQuotationRoutingTemplate(quotationRoutingRule.templates.categoryClarificationResponse, { productName: '', categoryName, currentPageUrl })
        : categoryProductClarificationReply(categoryName);
    }
  } else if (!deterministicReply && existingPageSuggestion?.status === 'AWAITING_CONFIRMATION') {
    pageProductSuggestionDecision = 'AWAITING_CONFIRMATION';
    extractedKnowledge.matchedProduct = null;
    extractedKnowledge.quotationWorkflow = null;
    extractedKnowledge.productKnowledgeAvailable = false;
    extractedKnowledge.productSelectionRequired = true;
    deterministicReply = quotationRoutingRule
      ? renderQuotationRoutingTemplate(quotationRoutingRule.templates.pageProductSuggestionResponse, { productName: existingPageSuggestion.productName, categoryName: existingPageSuggestion.categoryName, currentPageUrl })
      : currentPageProductSuggestionReply(existingPageSuggestion.productName);
  } else if (!deterministicReply && productPurchaseRequested && currentPageUrl && extractedKnowledge.productSelectionRequired && currentPageProduct && extractedKnowledge.matchedCategoryId && currentPageProduct.categoryId === extractedKnowledge.matchedCategoryId && (semanticRoutingDecision === 'SUGGEST_PAGE_PRODUCT' || (!semanticRoutingAvailable && shouldOfferCurrentPageProductSuggestion({
    message: userMessageContent,
    matchedCategoryId: extractedKnowledge.matchedCategoryId,
    matchedCategoryName: extractedKnowledge.matchedCategory,
    productSelectionRequired: extractedKnowledge.productSelectionRequired,
    currentPageProduct,
    previousSuggestion: existingPageSuggestion,
  })))) {
    pageProductSuggestionDecision = 'OFFERED';
    pageProductSuggestionState = {
      status: 'AWAITING_CONFIRMATION',
      productId: currentPageProduct.id,
      productName: currentPageProduct.name,
      categoryId: extractedKnowledge.matchedCategoryId,
      categoryName: extractedKnowledge.matchedCategory,
      currentPageUrl,
    };
    deterministicReply = quotationRoutingRule
      ? renderQuotationRoutingTemplate(quotationRoutingRule.templates.pageProductSuggestionResponse, { productName: currentPageProduct.name, categoryName: extractedKnowledge.matchedCategory, currentPageUrl })
      : currentPageProductSuggestionReply(currentPageProduct.name);
  }

  if (!deterministicReply && productRoutingResult.clarificationQuestion) {
    extractedKnowledge.matchedProduct = null;
    extractedKnowledge.quotationWorkflow = null;
    extractedKnowledge.productKnowledgeAvailable = false;
    extractedKnowledge.productSelectionRequired = true;
    pageProductSuggestionState = null;
    pageProductSuggestionDecision = 'NONE';
    deterministicReply = productRoutingResult.clarificationQuestion;
  }

  if (
    !deterministicReply &&
    quotationRoutingRule && routingRuleActive &&
    extractedKnowledge.matchedProduct &&
    detectedProductConfirmed &&
    extractedKnowledge.matchedProduct.purchaseUrl &&
    registrationStatus !== 'SUBMITTED' &&
    (((productConfirmationAccepted || productConfirmedThisTurn) && !entryConversionMode) || ['OFFER_PURCHASE_ROUTE', 'REQUEST_LINK_AGAIN'].includes(semanticRoutingDecision || '') || (!semanticRoutingAvailable && shouldOfferProductPurchaseLink({
      intent,
      productId: extractedKnowledge.matchedProduct.id,
      purchaseUrl: extractedKnowledge.matchedProduct.purchaseUrl,
      offeredProductIds: offeredPurchaseLinkProductIds,
      message: userMessageContent,
    })))
  ) {
    const samePage = isDetectedProductCurrentPage({
      productId: extractedKnowledge.matchedProduct.id,
      currentPageProductId: currentPageProduct?.id,
      purchaseUrl: extractedKnowledge.matchedProduct.purchaseUrl,
      currentPageUrl,
    });
    const routingTemplate = samePage
      ? quotationRoutingRule.templates.samePageResponse
      : quotationRoutingRule.templates.differentPageResponse;
    deterministicReply = renderQuotationRoutingTemplate(routingTemplate, {
      productName: extractedKnowledge.matchedProduct.name,
      purchaseUrl: extractedKnowledge.matchedProduct.purchaseUrl,
      currentPageUrl,
    });
    purchaseLinkOffer = {
      productId: extractedKnowledge.matchedProduct.id,
      productName: extractedKnowledge.matchedProduct.name,
      ruleTitle: quotationRoutingRule.title,
      rulePriority: quotationRoutingRule.sortOrder,
      presentation: samePage ? 'CURRENT_PAGE' : 'EXTERNAL_LINK',
    };
  } else if (
    !deterministicReply &&
    quotationRoutingRule && routingRuleActive &&
    extractedKnowledge.matchedProduct &&
    detectedProductConfirmed &&
    !entryConversionMode && !explicitFormRequested &&
    (awaitingCustomerChoice || semanticRoutingDecision === 'WAIT_FOR_PRODUCT_DECISION' || semanticRoutingDecision === 'WAIT_FOR_CHOICE' || (!semanticRoutingAvailable && shouldWaitForProductPurchaseDecision({
      productId: extractedKnowledge.matchedProduct.id,
      purchaseUrl: extractedKnowledge.matchedProduct.purchaseUrl,
      offeredProductIds: offeredPurchaseLinkProductIds,
      quotationWorkflowActive: conversation.currentProductId === extractedKnowledge.matchedProduct.id,
      message: userMessageContent,
    })))
  ) {
    // The link has been offered and the customer has not selected the detailed
    // quotation path yet. Do not expose nextQuestion to the LLM on this turn.
    extractedKnowledge.quotationWorkflow = null;
    deterministicReply = renderQuotationRoutingTemplate(quotationRoutingRule.templates.awaitingChoiceResponse, {
      productName: extractedKnowledge.matchedProduct.name,
      purchaseUrl: extractedKnowledge.matchedProduct.purchaseUrl,
      currentPageUrl,
    });
  } else if (!deterministicReply && explicitFormRequested && extractedKnowledge.matchedProduct && detectedProductConfirmed && quotationRoutingRule && routingRuleActive) {
    const samePage = isDetectedProductCurrentPage({
      productId: extractedKnowledge.matchedProduct.id,
      currentPageProductId: currentPageProduct?.id,
      purchaseUrl: extractedKnowledge.matchedProduct.purchaseUrl,
      currentPageUrl,
    });
    deterministicReply = renderQuotationRoutingTemplate(
      samePage ? quotationRoutingRule.templates.samePageResponse : quotationRoutingRule.templates.differentPageResponse,
      { productName: extractedKnowledge.matchedProduct.name, purchaseUrl: extractedKnowledge.matchedProduct.purchaseUrl, currentPageUrl },
    );
  } else if (
    !deterministicReply && extractedKnowledge.matchedProduct && detectedProductConfirmed && entryConversionMode
  ) {
    const product = extractedKnowledge.matchedProduct;
    const categoryGuidanceKnowledge = '';
    const quotationGuidanceKnowledge = [
      product.aiKnowledgeArticle || '',
      product.description || '',
      product.coverage || '',
      product.purchaseConditions || '',
      product.exclusions || '',
      product.benefits || '',
    ].filter(value => value.trim()).join('\n\n');
    const session = await getOrCreateQuotationSession({
      conversationId: conversation.id,
      customerId: customer.id,
      productId: product.id,
      sessionId: existingCollectedData.quotationSubmission?.pending === true
        && existingCollectedData.quotationSubmission?.productId === product.id
        ? existingCollectedData.quotationSubmission.sessionId : undefined,
    });
    const workflowWasActive = Boolean(activeSessionBinding && activeSessionBinding.sessionId === session.id);
    // Reject a late transport turn before any prefill or session write. This
    // keeps a stale customer message from advancing the persisted stateVersion.
    if (workflowWasActive && isStaleQuotationTurn(quotationTurnBinding, activeSessionBinding)) {
      return {
        suppressAutomaticReply: true,
        intent,
        stage,
        missingInfo: '',
        loadedKnowledgeSummary: JSON.stringify({ staleQuotationTurn: { received: quotationTurnBinding, current: activeSessionBinding } }),
        extractedKnowledge,
        appliedRules: extractedKnowledge.appliedRules,
        systemPrompt: '', userPrompt: '', finalPromptSnippet: '', replyText: '',
        collectedData: existingCollectedData,
        promptTokens: 0, completionTokens: 0,
        validationResult: 'REJECTED',
        validationReason: 'STALE_QUOTATION_TURN_SUPPRESSED',
        retryCount: 0,
        modelUsed: 'deterministic-state-guard',
        performanceTimings: {
          ...performanceTimings,
          quotationStateProcessingMs: Date.now() - quotationStateProcessingStartedAt,
        },
      };
    }
    const sessionQuestions = session.workflow?.questions || [];
    const prefillAnswers = {
      ...await canonicalQuotationHistoryPrefill(sessionQuestions, messageHistory),
      ...await canonicalQuotationPrefill(sessionQuestions, existingCollectedData),
    };
    const storedAssistedLimit = existingCollectedData.purchaseLinkState?.status === 'DETAILED_QUOTATION_SELECTED'
      && existingCollectedData.purchaseLinkState?.productId === product.id
      && existingCollectedData.purchaseLinkState?.mode === 'ASSISTED_LEAD'
      && Number.isInteger(existingCollectedData.purchaseLinkState?.assistedLeadQuestionLimit)
      ? Number(existingCollectedData.purchaseLinkState.assistedLeadQuestionLimit)
      : null;
    const conversionMode: 'ASSISTED_LEAD' | 'ASSISTED_QUOTE' = entryConversionMode;
    const assistedQuestionLimit = quotationQuestionLimitForConversionMode(
      conversionMode,
      storedAssistedLimit || quotationRoutingRule?.templates.assistedLeadQuestionLimit || 5,
    );
    const assistedQuestions = assistedQuestionLimit ? sessionQuestions.slice(0, assistedQuestionLimit) : sessionQuestions;
    let evaluation = await processSessionAnswers(session.id, prefillAnswers, 'ai_extracted', { questionLimit: assistedQuestionLimit || undefined });
    const pendingQuestion = evaluation.nextQuestion;
    if (workflowWasActive) {
      quotationTurn = await advanceQuotationTurn({
        sessionId: session.id,
        questions: assistedQuestions,
        answers: evaluation.collectedData,
        previous: existingCollectedData.quotationTurnState as QuotationTurnState | undefined,
        message: userMessageContent,
        engine: quotationResponseEngineRule ? {
          active: quotationResponseEngineRule.status === 'ACTIVE',
          title: quotationResponseEngineRule.title,
          priority: quotationResponseEngineRule.sortOrder,
          config: quotationResponseEngineRule.config,
        } : null,
        model: classifyQuotationTurnWithAi,
        productKnowledge: quotationGuidanceKnowledge,
        categoryKnowledge: categoryGuidanceKnowledge,
        guidanceSelector: selectQuotationGuidanceWithAi,
        sessionStatus: session.status,
        behaviorContext,
        recentMessages: messageHistory.map(message => ({ senderType: message.senderType, content: message.content })),
      });
      performanceTimings.answerInterpretationLlmCalls += quotationTurn.performance.classifierCallCount;
      performanceTimings.guidanceLlmCalls += quotationTurn.performance.guidanceCallCount;
      performanceTimings.answerInterpretationValidationMs += quotationTurn.performance.classifierMs;
      performanceTimings.guidanceGenerationMs += quotationTurn.performance.guidanceMs;
      performanceTimings.answerInterpretationInputChars += quotationTurn.performance.classifierInputChars;
      performanceTimings.guidanceInputChars += quotationTurn.performance.guidanceInputChars;
      if (Object.keys(quotationTurn.updates).length) {
        evaluation = await processSessionAnswers(session.id, quotationTurn.updates, 'customer', { questionLimit: assistedQuestionLimit || undefined });
      }
      quotationInvalidReply = quotationTurn.clarification;
      quotationAnswerValidationReason = quotationTurn.decisions.map(d => `${d.fieldName || 'question'}: ${d.reason}`).join(' | ');
      const primaryDecision = quotationTurn.decisions[0];
      const fieldName = primaryDecision?.fieldName || quotationTurn.currentQuestionBefore?.fieldName || null;
      quotationValidation = primaryDecision ? {
        status: primaryDecision.outcome,
        classification: primaryDecision.status,
        fieldName,
        fieldLabel: quotationTurn.currentQuestionBefore?.title || null,
        canonicalValue: fieldName ? quotationTurn.updates[fieldName] || null : null,
        confidence: primaryDecision.confidence,
        reason: primaryDecision.reason,
      } : undefined;
      if (quotationTurn.interruption) quotationInterruptionQuestion = { text: '' };
    } else {
      quotationTurn = {
        currentQuestionBefore: null,
        state: { version: 1, sessionId: session.id, currentQuestion: pendingQuestion, answers: evaluation.collectedData, attempts: {}, ambiguity: 'NONE', lastAnsweredField: null },
        updates: {}, decisions: [], interruption: false, clarification: null,
        classification: null, responseText: pendingQuestion ? quotationQuestionReply(pendingQuestion) : null, appliedRule: null,
        guidance: null,
        nextQuestionText: pendingQuestion ? quotationQuestionReply(pendingQuestion) : null,
        answerValidation: { status: 'CLARIFY', reason: 'Quotation workflow initialized', canonicalValue: null, confidence: 1, fieldName: pendingQuestion?.fieldName || null },
        decisionSource: 'BACKEND_WORKFLOW_INITIALIZATION',
        performance: { modelCallCount: 0, classifierCallCount: 0, guidanceCallCount: 0, classifierMs: 0, guidanceMs: 0, classifierInputChars: 0, guidanceInputChars: 0 },
      };
    }

    const questions = assistedQuestions;
    const answered = evaluation.collectedData as Record<string, string>;
    const remainingQuestions = evaluation.remainingQuestions.map((question) => question.title);
    const nextQuestion = evaluation.nextQuestion;

    extractedKnowledge.quotationWorkflow = {
      totalQuestions: evaluation.totalQuestionsCount,
      allQuestions: questions.map((question) => ({
        id: question.id,
        createdAt: question.createdAt,
        order: question.order,
        title: question.title,
        fieldName: question.fieldName,
        aiQuestion: question.aiQuestion || question.title,
        required: question.required,
        type: question.type,
        options: question.options && question.options !== '[]'
          ? JSON.parse(question.options)
          : undefined,
        helpText: question.helpText || null,
      })),
      answeredFields: answered,
      nextQuestion: nextQuestion ? {
        id: nextQuestion.id,
        createdAt: nextQuestion.createdAt,
        order: nextQuestion.order,
        title: nextQuestion.title,
        fieldName: nextQuestion.fieldName,
        aiQuestion: nextQuestion.aiQuestion || nextQuestion.title,
        options: nextQuestion.options && nextQuestion.options !== '[]'
          ? JSON.parse(nextQuestion.options)
          : undefined,
        helpText: nextQuestion.helpText || null,
      } : null,
      isCompleted: evaluation.isCompleted,
    };

    quotationState = {
      sessionId: evaluation.sessionId,
      productId: product.id,
      productName: product.name,
      currentQuestionFieldName: nextQuestion?.fieldName || null,
      currentQuestion: nextQuestion ? {
        id: nextQuestion.id,
        order: nextQuestion.order,
        fieldName: nextQuestion.fieldName,
        helpText: nextQuestion.helpText || null,
      } : null,
      remainingQuestions,
      remainingQuestionFields: evaluation.remainingQuestions.map((question) => ({
        id: question.id,
        order: question.order,
        fieldName: question.fieldName,
        helpText: question.helpText || null,
      })),
      isCompleted: evaluation.isCompleted,
      conversionMode,
    };

    const questionReply = nextQuestion ? quotationQuestionReply(nextQuestion) : null;
    const chatStartPrefix = questionReply && directQuotationRequested && conversation.currentProductId !== product.id && quotationRoutingRule && routingRuleActive
      ? renderQuotationRoutingTemplate(quotationRoutingRule.templates.chatStartResponse, {
          productName: product.name,
          purchaseUrl: product.purchaseUrl,
          currentPageUrl,
        })
      : '';
    deterministicReply = quotationTurn?.responseText || quotationInvalidReply || (questionReply
      ? [chatStartPrefix, questionReply].filter(Boolean).join('\n')
      : evaluation.isCompleted
        ? quotationCompletionConfig?.choicePrompt || null
        : 'برای این محصول سؤال استعلام فعالی پیدا نشد. می‌توانید از کارشناس راهنمایی بخواهید.');
  }

  const missingInfo = detectMissingInfo(intent, userMessageContent, historyText, extractedKnowledge.quotationWorkflow);
  performanceTimings.quotationStateProcessingMs = Date.now() - quotationStateProcessingStartedAt;
  const workflowContext: NonNullable<BrainResult['workflowContext']> = {
    currentPageUrl,
    currentPageProduct,
    detectedProduct: extractedKnowledge.matchedProduct
      ? { id: extractedKnowledge.matchedProduct.id, name: extractedKnowledge.matchedProduct.name }
      : null,
    purchaseUrl: extractedKnowledge.matchedProduct?.purchaseUrl || null,
    purchaseRequested: productPurchaseRequested,
    orderedQuestions: sortQuotationQuestions(extractedKnowledge.quotationWorkflow?.allQuestions || [])
      .map((question) => ({
        order: question.order,
        fieldName: question.fieldName,
        text: question.aiQuestion || question.title,
        helpText: question.helpText || null,
      })),
    registrationStatus,
    matchedCategory: extractedKnowledge.matchedCategoryId && extractedKnowledge.matchedCategory
      ? { id: extractedKnowledge.matchedCategoryId, name: extractedKnowledge.matchedCategory }
      : null,
    currentPageProductSuggestionDecision: pageProductSuggestionDecision,
    productIntentRouting: productRoutingAudit,
    conversionMode: quotationState?.conversionMode || existingCollectedData.conversionMode || null,
    conversationIntentFamily: intentFamily,
    salesFlowAllowed: salesFlowAllowedForIntent(intentFamily, Boolean(conversation.currentProductId)),
    ...(quotationAnswerValidationReason
      ? { quotationAnswerValidationReason }
      : {}),
    ...(quotationOptionSelection
      ? { quotationOptionSelection }
      : {}),
  };

  const productSelectionRequired =
    extractedKnowledge.productSelectionRequired === true;

  const systemPrompt = buildAiBehaviorSystemPrompt(behaviorRuntime,
    intentFamily === 'INFORMATIONAL'
      ? 'فقط به سؤال اطلاعاتی کاربر با دانش معتبر پاسخ بده. Sales Flow، کشف محصول، فرم، لینک و سؤال استعلام را شروع نکن. عملیات اجرا نکن.'
      : intentFamily === 'SUPPORT_SERVICE'
        ? 'درخواست خدماتی/پیگیری/خسارت را پاسخ بده و Sales Flow یا سؤال استعلام فروش را شروع نکن. عملیات اجرا نکن.'
        : 'با استفاده از context و دانش معتبر، پاسخ مکالمه را بساز. عملیات اجرا نکن؛ فقط action پیشنهادی allowlistشده و داده‌ای را که عیناً در پیام مشتری وجود دارد برگردان.');

  const userPrompt = `سابقه گفتگوهای پیشین:\n${historyText || 'این اولین پیام ارسالی مشتری است.'}\n\nپیام جدید مشتری:\n"${userMessageContent}"`;

  let promptTokens = 0;
  let completionTokens = 0;
  let finalReplyText = deterministicReply || '';
  let newlyExtractedData: Record<string, any> = {};
  let generatedTask: any = undefined;
  let generatedOperatorSummary = '';
  let validation = deterministicReply
    ? { valid: true, reason: purchaseLinkOffer ? purchaseLinkOffer.ruleTitle : 'Backend-enforced quotation workflow response' }
    : { valid: false, reason: '' };
  let retryCount = 0;
  let validationStatus: 'PASSED' | 'REJECTED' | 'REGENERATED' = 'PASSED';
  let modelUsed = deterministicReply
    ? purchaseLinkOffer ? 'Deterministic Product Purchase Link' : 'Deterministic Quotation Workflow'
    : 'AIBehaviorRuntime';
  let effectiveBehaviorRuntime = behaviorRuntime;
  let behaviorDecisionAudit: Record<string, unknown> | null = deterministicReply ? {
    decision: 'DETERMINISTIC_BACKEND_ACTION', proposedAction: 'NONE', approvedAction: 'NONE',
  } : null;

  // The conversational response path uses the same central runtime as the
  // quotation classifier, guidance generator, terminal classifier and simulator.
  while (!deterministicReply && retryCount <= 2) {
    const responseLlmStartedAt = Date.now();
    try {
      performanceTimings.responseLlmCalls += 1;
      const runtimeResult = await runAiBehaviorStructuredModel<{
        decision: string;
        intent: string;
        responseText: string;
        canonicalAnswer: string | null;
        answeredFields: Array<{ fieldName: string; value: string; evidence: string }>;
        needsClarification: boolean;
        clarificationReason: string | null;
        requestedAction: string;
        shouldAdvance: boolean;
        knowledgeSource: string;
        appliedRuleIds: string[];
        confidence: number;
      }>({
        context: behaviorContext,
        taskContract: 'به آخرین پیام کاربر پاسخ بده. رفتار مکالمه فقط از قوانین فعال runtime می‌آید. دانش فقط از context مجاز است. answeredFields تنها برای داده‌ای مجاز است که evidence آن عیناً در پیام مشتری وجود دارد. هیچ Task/Lead/SMS نساز.',
        schemaName: 'ai_behavior_turn',
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            decision: { type: 'string' }, intent: { type: 'string' }, responseText: { type: 'string' },
            canonicalAnswer: { type: ['string', 'null'] },
            answeredFields: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { fieldName: { type: 'string' }, value: { type: 'string' }, evidence: { type: 'string' } }, required: ['fieldName', 'value', 'evidence'] } },
            needsClarification: { type: 'boolean' }, clarificationReason: { type: ['string', 'null'] },
            requestedAction: { type: 'string', enum: ['NONE', 'SAVE_VALID_ANSWER', 'KEEP_CURRENT_QUESTION', 'ADVANCE_QUESTION', 'CORRECT_ANSWER', 'START_NEW_QUOTATION', 'PAUSE_QUOTATION', 'REQUEST_HUMAN', 'RETRY_SUBMISSION'] },
            shouldAdvance: { type: 'boolean' }, knowledgeSource: { type: 'string' },
            appliedRuleIds: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['decision', 'intent', 'responseText', 'canonicalAnswer', 'answeredFields', 'needsClarification', 'clarificationReason', 'requestedAction', 'shouldAdvance', 'knowledgeSource', 'appliedRuleIds', 'confidence'],
        },
        payload: {
          message: userMessageContent,
          recentMessages: messageHistory.slice(-8).map(message => ({ senderType: message.senderType, content: message.content })),
          context: workflowContext,
          knowledge: extractedKnowledge.promptFormattedKnowledge,
          retry: retryCount ? { rejectedReason: validation.reason } : null,
        },
      });
      modelUsed = runtimeResult.model;
      performanceTimings.responseInputChars += runtimeResult.telemetry.inputChars;
      effectiveBehaviorRuntime = runtimeResult.resolution;
      promptTokens += runtimeResult.usage.promptTokens;
      completionTokens += runtimeResult.usage.completionTokens;
      finalReplyText = runtimeResult.output.responseText || '';
      const requestedAction = validateRequestedAction(runtimeResult.output.requestedAction, ['NONE', 'REQUEST_HUMAN', 'START_NEW_QUOTATION', 'PAUSE_QUOTATION']);
      behaviorDecisionAudit = {
        decision: runtimeResult.output.decision,
        proposedAction: runtimeResult.output.requestedAction,
        approvedAction: requestedAction,
        confidence: runtimeResult.output.confidence,
        knowledgeSource: runtimeResult.output.knowledgeSource,
      };
      generatedTask = requestedAction === 'REQUEST_HUMAN' ? { create: false, requestedByBehaviorRuntime: true } : undefined;
      newlyExtractedData = Object.fromEntries((runtimeResult.output.answeredFields || [])
        .filter(item => item.fieldName && item.value && item.evidence && userMessageContent.includes(item.evidence))
        .map(item => [item.fieldName, item.value]));
      generatedOperatorSummary = '';
    } catch {
      finalReplyText = '';
    } finally {
      performanceTimings.responseLlmMs += Date.now() - responseLlmStartedAt;
    }

    // Validate Response against Training Center Policies
    validation = validateResponse(finalReplyText, previousAiReplies, missingInfo);

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
    finalReplyText = 'در حال حاضر امکان آماده‌کردن پاسخ مطمئن وجود ندارد. لطفاً پیام را کوتاه‌تر تکرار کنید.';
  }

  if (quotationInterruptionQuestion) {
    newlyExtractedData = {};
    generatedTask = undefined;
    generatedOperatorSummary = '';
  }

  if (quotationState?.isCompleted && quotationCompletionConfig && !quotationInterruptionQuestion && !quotationInvalidReply) {
    generatedTask = {
      create: true,
      title: `محاسبه قیمت ${quotationState.productName}`,
      type: 'Prepare Quotation',
      priority: 'HIGH',
      description: `پرسش‌های استعلام محصول ${quotationState.productName} تکمیل شده است.`,
    };
    generatedOperatorSummary = `پرسش‌های استعلام ${quotationState.productName} تکمیل شد و آماده محاسبه قیمت است.`;
  }

  performanceTimings.totalLlmCalls = performanceTimings.intentLlmCalls
    + performanceTimings.productLlmCalls
    + performanceTimings.routingLlmCalls
    + performanceTimings.answerInterpretationLlmCalls
    + performanceTimings.guidanceLlmCalls
    + performanceTimings.responseLlmCalls;
  const postProcessingStartedAt = Date.now();
  const loadedKnowledgeSummary = JSON.stringify({
    summary: purchaseLinkOffer
    ? `${purchaseLinkDecisionLogSummary(purchaseLinkOffer.productName)} | [تعداد قوانین فعال]: ${extractedKnowledge.appliedRules.length}`
    : `[محصول]: ${extractedKnowledge.matchedProduct?.name || 'عمومی'} | [سوال بعدی]: ${extractedKnowledge.quotationWorkflow?.nextQuestion?.title || 'تکمیل'} | [تعداد قوانین فعال]: ${extractedKnowledge.appliedRules.length}`,
    currentPageUrl,
    currentPageProduct,
    matchedCategory: workflowContext.matchedCategory,
    currentPageProductSuggestionDecision: pageProductSuggestionDecision,
    quotationOptionSelection,
    quotationValidation,
    behaviorRuntime: {
      promptVersion: effectiveBehaviorRuntime.promptVersion,
      resolvedAt: effectiveBehaviorRuntime.resolvedAt,
      context: effectiveBehaviorRuntime.context,
      candidates: effectiveBehaviorRuntime.candidates,
      selected: effectiveBehaviorRuntime.selected.map(rule => ({ id: rule.id, title: rule.title, version: rule.version, priority: rule.sortOrder, specificity: rule.specificity })),
      rejected: effectiveBehaviorRuntime.rejected,
      decision: behaviorDecisionAudit,
    },
    ...buildQuotationAudit({
      messageId, conversationId: conversation.id,
      quotationSessionId: quotationState?.sessionId || null,
      submissionId: existingCollectedData.quotationSubmission?.idempotencyKey || null,
      currentFieldName: quotationTurn?.currentQuestionBefore?.fieldName || null,
      decisionSource: quotationTurn?.decisionSource || 'BRAIN_LAYER',
      answerValidation: quotationTurn?.answerValidation || null,
      responseValidation: { status: validationStatus, reason: validation.reason },
    }),
    quotationTurn: quotationTurn ? { currentQuestionBefore: quotationTurn.currentQuestionBefore, state: quotationTurn.state, classification: quotationTurn.classification, guidance: quotationTurn.guidance, appliedRule: quotationTurn.appliedRule, decisions: quotationTurn.decisions, savedFields: Object.keys(quotationTurn.updates) } : null,
    productIntentRouting: productRoutingAudit,
  });

  // Record BrainLog in Database
  try {
    await prisma.brainLog.create({
      data: {
      conversationId: conversation.id,
      customerId: customer.id,
      messageId,
      intent,
      stage,
      missingInfo,
      loadedKnowledge: loadedKnowledgeSummary,
      promptTokens,
      completionTokens,
      rawPrompt: systemPrompt.substring(0, 1500),
      generatedReply: finalReplyText,
      validationResult: validationStatus,
      validationReason: quotationAnswerValidationReason || validation.reason,
      retryCount,
      },
    });

  } catch {
    // BrainLog failure must NOT stop the AI response pipeline.
  }

  const { quotationAnswerValidation: _legacyQuotationValidation, ...existingCollectedDataWithoutLegacyValidation } = existingCollectedData;
  const mergedCollectedData = {
    ...existingCollectedDataWithoutLegacyValidation,
    ...(extractedKnowledge.quotationWorkflow?.answeredFields || {}),
    ...(!quotationState ? newlyExtractedData : {}),
    productIntentRouting: productRoutingResult.state,
    conversationOpeningState: openingTransition.state,
    ...(quotationState ? { conversionMode: quotationState.conversionMode } : {}),
    ...(quotationTurn ? { quotationTurnState: quotationTurn.state } : {}),
    ...(purchaseLinkOffer
      ? { purchaseLinkState: purchaseLinkAwaitingState(purchaseLinkOffer.productId) }
      : quotationState && assistedLeadRequested
        ? { purchaseLinkState: purchaseLinkAssistedLeadState(quotationState.productId, quotationRoutingRule?.templates.assistedLeadQuestionLimit || 5) }
        : quotationState && directQuotationRequested
          ? { purchaseLinkState: purchaseLinkQuotationSelectedState(quotationState.productId) }
        : {}),
    ...(pageProductSuggestionState
      ? { currentPageProductSuggestion: pageProductSuggestionState }
      : {}),
    ...(quotationValidation
      ? { quotationTechnical: { ...(existingCollectedData.quotationTechnical || {}), validation: quotationValidation } }
      : {}),
    ...(quotationOptionSelection
      ? { quotationOptionSelection }
      : {}),
  };

  return {
    suppressAutomaticReply: openingTransition.duplicateGreeting,
    intent,
    stage,
    missingInfo,
    loadedKnowledgeSummary,
    deferHumanHandoff: Boolean(quotationState),
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
    validationReason: quotationAnswerValidationReason || validation.reason,
    retryCount,
    modelUsed,
    performanceTimings: {
      ...performanceTimings,
      postProcessingMs: Date.now() - postProcessingStartedAt,
    },
    quotationState,
    workflowContext,
    purchaseLinkOffer,
    task: generatedTask,
    operatorSummary: generatedOperatorSummary,
  };
}
