export type QuotationTurnBinding = {
  sessionId: string;
  productId: string;
  questionId: string | null;
  fieldName: string | null;
};

export function isStaleQuotationTurn(
  received: QuotationTurnBinding | null | undefined,
  current: QuotationTurnBinding | null | undefined,
): boolean {
  if (!received) return false; // compatibility for simulator and historical messages
  if (!current) return true;
  return received.sessionId !== current.sessionId
    || received.productId !== current.productId
    || received.questionId !== current.questionId
    || received.fieldName !== current.fieldName;
}
