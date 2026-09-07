export type QuotationFieldDefinition = {
  fieldName: string;
  title: string;
  order: number;
};

const INTERNAL_KEYS = new Set([
  'purchaseLinkState',
  'quotationTurnState',
  'quotationSubmission',
  'quotationTechnical',
  'quotationAnswerValidation',
  'quotationOptionSelection',
  'currentPageProductSuggestion',
  'humanHandoff',
  'customerIdentity',
  'handoffReason',
]);

const LEGACY_LABELS: Record<string, string> = {
  type: 'کاربری ساختمان',
  majmuemetraj: 'متراژ کل ساختمان',
  tabaghat: 'تعداد طبقات',
  tedad_vahed: 'تعداد واحدها',
  jenseh_nama: 'نوع نمای ساختمان',
  omre_bana: 'سن ساختمان',
  asansor: 'تعداد آسانسور',
  tedad_diay: 'تعداد دیه درخواستی',
  pezeshki: 'هزینه پزشکی هر نفر',
  tedade_pezeshki: 'تعداد تعهد پزشکی',
  mali: 'پوشش مالی',
  tedade_mali: 'تعداد تعهد مالی',
  karkonan: 'تعداد کارکنان',
  emkanat: 'امکانات ایمنی و حفاظتی',
  refahi: 'امکانات رفاهی',
  extra: 'پوشش‌های تکمیلی',
  afzayesh: 'افزایش ریالی مبلغ دیه',
  taadod: 'تعدد دیات',
  '66tamin': 'پوشش ماده ۶۶ تأمین اجتماعی',
  tamdid: 'وضعیت تمدید بیمه‌نامه',
};

function objectValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildConversationQuotationPresentation(
  collectedData: Record<string, unknown>,
  questions: QuotationFieldDefinition[],
) {
  const questionMap = new Map(questions.map(question => [question.fieldName, question]));
  const submission = objectValue(collectedData.quotationSubmission) ? collectedData.quotationSubmission : null;
  const submittedAnswers = submission && Array.isArray(submission.answers)
    ? submission.answers.filter(objectValue)
    : [];
  const submissionLabels = new Map(submittedAnswers.flatMap(answer =>
    typeof answer.fieldName === 'string' && typeof answer.fieldLabel === 'string'
      ? [[answer.fieldName, answer.fieldLabel] as const]
      : []
  ));

  const fields = Object.entries(collectedData)
    .filter(([key, value]) => !INTERNAL_KEYS.has(key) && value !== undefined && value !== null && typeof value !== 'object')
    .map(([fieldName, value], index) => {
      const question = questionMap.get(fieldName);
      return {
        fieldName,
        label: question?.title || submissionLabels.get(fieldName) || LEGACY_LABELS[fieldName] || `پاسخ استعلام ${index + 1}`,
        value: String(value),
        order: question?.order ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fa'));

  const technical = Object.fromEntries(Object.entries(collectedData).filter(([key]) => INTERNAL_KEYS.has(key)));
  delete technical.quotationAnswerValidation;
  return { fields, technical };
}
