export type FaqKnowledgeRecord = {
  id: string;
  question: string;
  answer: string;
  keywords: string;
  insuranceType: string;
};

export type RelevantFaq = Pick<FaqKnowledgeRecord, 'id' | 'question' | 'answer' | 'insuranceType'>;

export function selectRelevantFaqsForCategory(
  allFaqs: FaqKnowledgeRecord[],
  categoryFilter: string,
): RelevantFaq[] {
  return allFaqs
    .filter((faq) => {
      const combined = `${faq.question} ${faq.answer} ${faq.keywords} ${faq.insuranceType}`.toLowerCase();
      if (categoryFilter === 'خودرو' && (combined.includes('خودرو') || combined.includes('ثالث') || combined.includes('تخفیف') || combined.includes('اقساط'))) return true;
      if (categoryFilter === 'درمان' && (combined.includes('درمان') || combined.includes('تکمیلی') || combined.includes('زایمان'))) return true;
      if (categoryFilter === 'اموال' && (combined.includes('آتش') || combined.includes('زلزله') || combined.includes('اثاثیه'))) return true;
      if (categoryFilter === 'مسئولیت' && (combined.includes('مسئولیت') || combined.includes('مدیر') || combined.includes('کارفرما') || combined.includes('مهندسی'))) return true;
      return false;
    })
    .slice(0, 2)
    .map(({ id, question, answer, insuranceType }) => ({ id, question, answer, insuranceType }));
}
