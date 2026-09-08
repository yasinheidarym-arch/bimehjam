export type QuotationAnswerValidationAudit = {
  status: string;
  reason: string;
  canonicalValue: string | null;
  confidence: number;
  fieldName: string | null;
} | null;

export function buildQuotationAudit(input: {
  messageId?: string | null;
  conversationId: string;
  quotationSessionId?: string | null;
  submissionId?: string | null;
  currentFieldName?: string | null;
  decisionSource: string;
  answerValidation: QuotationAnswerValidationAudit;
  responseValidation: { status: string; reason: string };
}) {
  return {
    answerValidation: input.answerValidation,
    responseValidation: input.responseValidation,
    audit: {
      messageId: input.messageId || null,
      conversationId: input.conversationId,
      quotationSessionId: input.quotationSessionId || null,
      submissionId: input.submissionId || null,
      currentFieldName: input.currentFieldName || null,
      decisionSource: input.decisionSource,
    },
  };
}
