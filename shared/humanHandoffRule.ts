export const FULL_NAME_HANDOFF_RULE_ID = 'system-full-name-before-human-handoff';
export const FULL_NAME_HANDOFF_RULE_CATEGORY = 'SYSTEM_HANDOFF_FULL_NAME';
export const FULL_NAME_HANDOFF_RULE_TITLE = 'دریافت نام کامل پیش از ارجاع انسانی';
export const FULL_NAME_HANDOFF_RULE_DIRECTIVE = [
  'زمان اجرا: تکمیل استعلام قیمت یا درخواست مستقیم کارشناس',
  'رفتار: اگر نام کامل مشتری ثبت نشده است، پیش از ایجاد وظیفه نام و نام خانوادگی را درخواست کن. اگر نام موجود است، دوباره نپرس. در صورت امتناع، وظیفه ایجاد شود و نام ثبت‌نشده مشخص باشد.',
  'کاربرد: نام برای تماس اپراتور و نمایش نام مشتری در پیامک اعلان وظیفه استفاده می‌شود.',
].join('\n');
