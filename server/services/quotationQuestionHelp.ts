import type { QuotationTurnQuestion } from './quotationConversationFlow';
import { normalizeQuotationOptionText, quotationQuestionOptions } from './quotationOptionMatchingService';

export function isQuotationHelpRequest(message: string): boolean {
  const text = normalizeQuotationOptionText(message);
  // Coverage/pricing questions still need product knowledge, not arithmetic guidance.
  if (/پوشش|خسارت|حق بیمه|قیمت بیمه|استثنا|بیمه (?:چیست|یعنی)/.test(text) && !/همین سؤال|همین سوال/.test(text)) return false;
  return /چجوری|چه جوری|چگونه|چطور|نحوه|روش|حسابش|محاسبه.*کن|چی.*وارد|چی.*بنویس|چی.*بفرست|منظور.*سوال|منظور.*سؤال|یعنی چی|نفهمیدم|متوجه نشدم|راهنمایی|توضیح.*(?:بده|بدی|بدید|دهید)/.test(text);
}

/** Only explain how to supply this field; never infer insurance terms or customer values. */
export function quotationQuestionHelp(question: QuotationTurnQuestion): string {
  if (question.helpText?.trim()) return question.helpText.trim();
  const text = normalizeQuotationOptionText(`${question.title} ${question.aiQuestion || ''}`);
  if (/متراژ|مساحت/.test(text)) {
    if (/جمع|مجموع|کل/.test(text) && /طبقات|طبقه/.test(text)) {
      const includesBoth = /همکف/.test(text) && /منفی|زیرزمین/.test(text);
      return includesBoth
        ? 'متراژ هر طبقه را با هم جمع کنید؛ همکف و طبقات منفی هم داخل مجموع حساب می‌شوند. برای مثال، سه طبقهٔ ۱۰۰ متری و یک زیرزمین ۵۰ متری، مجموعاً ۳۵۰ متر می‌شود. مجموع تقریبی را بفرستید.'
        : 'متراژ طبقه‌هایی را که در همین سؤال مشخص شده با هم جمع کنید و مجموع را به مترمربع بفرستید.';
    }
    return 'مساحت بخش مورد سؤال را به مترمربع بفرستید؛ برای یک بخش مستطیلی، طول را در عرض ضرب کنید.';
  }
  if (/آسانسور/.test(text) && /تعداد|چند/.test(text)) return 'دستگاه‌های آسانسور ساختمان را بشمارید، نه تعداد توقف‌ها یا طبقات؛ تعداد دستگاه‌ها را بفرستید.';
  if (/سن.*(?:بنا|ساختمان)|چند سال.*ساخت|چند ساله/.test(text)) return 'تعداد سال‌های گذشته از ساخت ساختمان را حساب کنید؛ سال ساخت را از سال جاری کم کنید و سن بنا را به سال بفرستید.';
  if (/سال ساخت/.test(text)) return 'سال ساخت درج‌شده در مدارک ساختمان را بفرستید؛ این سؤال سال ساخت را می‌خواهد، نه تعداد سال‌های گذشته از ساخت.';
  const options = quotationQuestionOptions(question);
  if (options.length) return `برای «${question.title}»، گزینه‌ای را که با وضعیت شما سازگار است مشخص کنید: ${options.map(o => o.value).join('، ')}.`;
  if (question.type === 'number') {
    const range = [question.minVal != null ? `حداقل ${question.minVal}` : '', question.maxVal != null ? `حداکثر ${question.maxVal}` : ''].filter(Boolean).join(' و ');
    return `برای «${question.title}»، ${/تعداد|چند/.test(text) ? 'موارد خواسته‌شده را بشمارید و تعداد' : 'مقدار عددی'} را بفرستید${range ? `؛ ${range}` : ''}.`;
  }
  if (question.type === 'boolean') return `برای «${question.title}»، اگر مورد سؤال برقرار است «بله» و در غیر این صورت «خیر» بفرستید.`;
  if (question.type === 'date') return `برای «${question.title}»، تاریخ را با سال، ماه و روز به شکل سال/ماه/روز بفرستید.`;
  return `برای «${question.title}»، وضعیت مربوط به همین مورد را کوتاه و با کلمات خودتان توضیح دهید.`;
}
