import { KnowledgeBaseData, CustomerAnalysis } from '../src/types';
import { runAiBehaviorStructuredModel, validateRequestedAction } from './services/aiBehaviorRuntime';

export interface ProcessedAIOutput {
  replyText: string;
  analysis: CustomerAnalysis;
  modelUsed: string;
}

/**
 * Compatibility entry point used by the legacy test screen. It intentionally
 * delegates to the same runtime and rule resolver as production; it performs
 * no Task, Lead, SMS, or conversation writes.
 */
export async function processGoftinoMessageWithAI(
  userMessage: string,
  clientMeta: { name?: string; phone?: string; page?: string; city?: string },
  knowledgeBase: KnowledgeBaseData,
  conversationHistory: Array<{ sender: 'client' | 'bot'; text: string }> = [],
): Promise<ProcessedAIOutput> {
  try {
    const result = await runAiBehaviorStructuredModel<{
      responseText: string;
      requestedAction: string;
      analysis: CustomerAnalysis;
    }>({
      context: { channel: 'SIMULATOR', currentPageUrl: clientMeta.page, conversationState: 'GENERAL', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER' },
      taskContract: 'این شبیه‌ساز read-only است. به پیام پاسخ بده و تحلیل مکالمه را برگردان؛ هیچ عملیات تجاری پیشنهاد یا اجرا نکن.',
      schemaName: 'simulated_conversation_response',
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          responseText: { type: 'string' },
          requestedAction: { type: 'string', enum: ['NONE', 'REQUEST_HUMAN'] },
          analysis: {
            type: 'object', additionalProperties: false,
            properties: {
              sentiment: { type: 'string' }, leadScore: { type: 'number', minimum: 0, maximum: 100 },
              customerIntent: { type: 'string' },
              extractedNeeds: { type: 'object', additionalProperties: false, properties: { insuranceType: { type: ['string', 'null'] }, vehicleOrPropertyDetails: { type: ['string', 'null'] }, budgetOrDiscountMentioned: { type: ['string', 'null'] }, urgencyLevel: { type: ['string', 'null'] } }, required: ['insuranceType', 'vehicleOrPropertyDetails', 'budgetOrDiscountMentioned', 'urgencyLevel'] },
              recommendedAction: { type: 'string' }, keyInsights: { type: 'array', items: { type: 'string' } },
            },
            required: ['sentiment', 'leadScore', 'customerIntent', 'extractedNeeds', 'recommendedAction', 'keyInsights'],
          },
        },
        required: ['responseText', 'requestedAction', 'analysis'],
      },
      payload: {
        message: userMessage,
        recentMessages: conversationHistory.slice(-6),
        page: clientMeta.page || null,
        // This store is fixture data for the simulator only. Rules still come
        // from AIBehaviorRuntime and cannot be overridden by this payload.
        knowledge: {
          companyName: knowledgeBase.companyName,
          faqs: knowledgeBase.frequentlyAskedQuestions,
          notes: [knowledgeBase.hullInsuranceNotes, knowledgeBase.healthInsuranceNotes, knowledgeBase.fireInsuranceNotes].filter(Boolean),
        },
      },
    });
    validateRequestedAction(result.output.requestedAction, ['NONE', 'REQUEST_HUMAN']);
    return { replyText: result.output.responseText, analysis: result.output.analysis, modelUsed: `AIBehaviorRuntime/${result.model}` };
  } catch {
    return {
      replyText: 'در حال حاضر امکان آماده‌کردن پاسخ مطمئن وجود ندارد. لطفاً پیام را کوتاه‌تر تکرار کنید.',
      analysis: { sentiment: 'سوال تکنیکی / خنثی', leadScore: 0, customerIntent: 'سوال عام (General Q&A)', extractedNeeds: {}, recommendedAction: 'تلاش مجدد', keyInsights: [] },
      modelUsed: 'AIBehaviorRuntime/Fallback',
    };
  }
}
