import { isDirectQuotationWorkflowRequest } from '../../shared/productPurchaseLink';

export type QuotationTurnQuestion = {
  id?: string;
  title: string;
  aiQuestion?: string | null;
  fieldName: string;
  required: boolean;
  order: number;
  options?: string | null;
};

export function isInsuranceQuotationRequest(message: string): boolean {
  const text = String(message || '').toLowerCase();
  return isDirectQuotationWorkflowRequest(text) || ['قیمت', 'استعلام', 'خرید', 'صدور', 'چقدر میشه', 'چنده', 'چند درمیاد', 'چند در میاد', 'هزینه', 'نرخ', 'محاسبه']
    .some((term) => text.includes(term));
}

export function isExplicitQuotationFormRequest(message: string): boolean {
  const normalized = String(message || '').replace(/‌/g, ' ').trim().toLowerCase();
  const mentionsForm = /فرم|لینک\s*استعلام|استعلام\s*آنلاین/.test(normalized);
  const requestsIt = /می\s*خوام|میخواهم|می‌خواهم|بفرست|ارسال|باز\s*کن|لینک|از\s*فرم/.test(normalized);
  return mentionsForm && requestsIt;
}

export function quotationQuestionReply(question: QuotationTurnQuestion): string {
  const prompt = question.aiQuestion?.trim() || question.title.trim();
  if (!question.options || question.options === '[]') return prompt;

  try {
    const parsed: unknown = JSON.parse(question.options);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return `${prompt}\nگزینه‌ها: ${parsed.map(String).join(' / ')}`;
    }
  } catch {
    // Keep the administrator-authored prompt usable even if legacy options are malformed.
  }
  return prompt;
}

export function quotationFormReply(): string {
  return 'حتماً؛ می‌توانید از فرم استعلام همین صفحه استفاده کنید و اطلاعات را مستقیماً در فرم وارد کنید.';
}

export function quotationCompletedReply(): string {
  return 'اطلاعات استعلام شما کامل شد. برای بررسی و اعلام قیمت نهایی در اختیار کارشناس مربوطه قرار گرفت.';
}

export function currentRequiredQuestion(
  questions: QuotationTurnQuestion[],
  collectedData: Record<string, string>,
): QuotationTurnQuestion | null {
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .find((question) => question.required && !collectedData[question.fieldName]) || null;
}

export function captureCurrentQuestionAnswer(
  question: QuotationTurnQuestion | null,
  message: string,
): Record<string, string> {
  const value = String(message || '').trim();
  return question && value ? { [question.fieldName]: value } : {};
}

export function shouldCaptureCurrentQuestionAnswer(
  sameProductWorkflowActive: boolean,
  question: QuotationTurnQuestion | null,
  message: string,
): boolean {
  return sameProductWorkflowActive && Boolean(question) && !isDirectQuotationWorkflowRequest(message);
}
