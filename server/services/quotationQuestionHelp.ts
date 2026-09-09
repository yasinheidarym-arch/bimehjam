import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { normalizeQuotationOptionText, quotationQuestionOptions } from './quotationOptionMatchingService';

export function isQuotationHelpRequest(message: string): boolean {
  const text = normalizeQuotationOptionText(message);
  // Coverage/pricing questions still need product knowledge, not arithmetic guidance.
  if (/پوشش|خسارت|حق بیمه|قیمت بیمه|استثنا|بیمه (?:چیست|یعنی)/.test(text) && !/همین سؤال|همین سوال/.test(text)) return false;
  return /چجوری|چه جوری|چگونه|چطور|نحوه|روش|حسابش|محاسبه.*کن|چی.*وارد|چی.*بنویس|چی.*بفرست|چی\s*شد(?:\s*پس)?|حالا\s*چی|منظور.*سوال|منظور.*سؤال|یعنی چی|نفهمیدم|متوجه نشدم|راهنمایی|توضیح.*(?:بده|بدی|بدید|دهید)/.test(text);
}

/** Only explain how to supply this field; never infer insurance terms or customer values. */
export function quotationQuestionHelp(question: QuotationTurnQuestion): string {
  if (question.helpText?.trim()) return question.helpText.trim();
  const options = quotationQuestionOptions(question);
  if (options.length) return `برای «${question.title}»، گزینه‌ای را که با وضعیت شما سازگار است مشخص کنید: ${options.map(o => o.value).join('، ')}.`;
  if (question.type === 'number') {
    const range = [question.minVal != null ? `حداقل ${question.minVal}` : '', question.maxVal != null ? `حداکثر ${question.maxVal}` : ''].filter(Boolean).join(' و ');
    return `برای «${question.title}»، مقدار عددی مربوط به همان مورد را اعلام کنید${range ? `؛ ${range}` : ''}.`;
  }
  if (question.type === 'boolean') return `برای «${question.title}»، اگر مورد سؤال برقرار است «بله» و در غیر این صورت «خیر» اعلام کنید.`;
  if (question.type === 'date') return `برای «${question.title}»، تاریخ را با سال، ماه و روز به شکل سال/ماه/روز اعلام کنید.`;
  return `برای «${question.title}»، وضعیت مربوط به همین مورد را کوتاه و با کلمات خودتان توضیح دهید.`;
}

export function quotationHelpResponseRequest(question: QuotationTurnQuestion): string {
  if (question.type === 'number') return 'اگر مقدار را در اختیار دارید بفرمایید؛ مقدار تقریبی هم قابل قبول است.';
  if (quotationQuestionOptions(question).length) return 'لطفاً گزینهٔ متناسب با شرایط‌تان را اعلام کنید.';
  if (question.type === 'boolean') return 'لطفاً وضعیت را به‌صورت بله یا خیر اعلام کنید.';
  if (question.type === 'date') return 'اگر تاریخ را در اختیار دارید، لطفاً اعلام کنید.';
  return 'اگر اطلاعات مربوط را در اختیار دارید، لطفاً اعلام کنید.';
}

/** Safe no-provider fallback: conversationally restate operational help without adding facts. */
export function naturalizeQuotationHelp(question: QuotationTurnQuestion, source: string): string {
  let text = source.trim()
    .replace(/^راهنمای\s+(?:این\s+)?س[ؤو]ال\s*[:：-]?\s*/u, '')
    .replace(/کافیه/g, 'برای پاسخ،')
    .replace(/حالا/g, '')
    .replace(/بفرست(?:ید)?/g, 'اعلام کنید')
    .replace(/همشونو/g, 'همهٔ موارد را')
    .replace(/فقط\s+این\s+کار\s+رو\s+بکن/g, 'این مورد را در نظر بگیرید')
    .replace(/بگو\s+ببینم/g, 'بفرمایید')
    .replace(/تمام/g, 'همهٔ')
    .replace(/شامل/g, 'با احتساب')
    .replace(/زیر\s*زمین/g, 'زیرزمین')
    .replace(/ را با هم جمع کنید/g, ' با هم جمع می‌شود')
    .replace(/ را نام ببرید/g, ' را مشخص بفرمایید')
    .replace(/توضیح دهید/g, 'توضیح بفرمایید')
    .replace(/می[‌ ]باشد/g, 'است')
    .replace(/نمایید/g, 'بفرمایید')
    .replace(/[.。]+$/u, '')
    .trim();
  if (!text) text = quotationQuestionHelp({ ...question, helpText: '' });
  const request = quotationHelpResponseRequest(question);
  return `${text}. ${request}`.replace(/\.\s*\./g, '.').trim();
}
