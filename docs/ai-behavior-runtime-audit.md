# ممیزی معماری رفتار AI

این سند مرز مسئولیت‌های runtime نسخه `ai-behavior-runtime-v1` را ثبت می‌کند. قوانین فعال در هر turn مستقیماً از `AiRule` خوانده می‌شوند؛ cache فرایندی وجود ندارد و نسخهٔ هر قانون از `id@updatedAt` ساخته می‌شود.

## موارد شناسایی‌شده و تصمیم نهایی

| مسیر قبلی | نوع | تصمیم |
|---|---|---|
| prompt بزرگ و ثابت در `brainLayerService` | رفتار مکالمه | حذف؛ prompt فقط با `AIBehaviorRuntime` ساخته می‌شود |
| prompt مستقل classifier، guidance و terminal | رفتار/تشخیص معنایی | انتقال به فراخوانی ساختاریافتهٔ runtime مشترک |
| متن هدایت فرم/لینک و پیشنهاد محصول صفحه | رفتار تجاری | متن‌ها در قانون `SYSTEM_PURCHASE_LINK` و پنل قابل ویرایش‌اند |
| متن‌های جمع‌آوری نام، موبایل، شهر و ارجاع | رفتار تجاری | در قانون `SYSTEM_HANDOFF_FULL_NAME` قابل ویرایش‌اند |
| انتخاب تماس/چت و متن موفق/شکست/terminal | رفتار تجاری | در قانون `SYSTEM_QUOTATION_COMPLETION` قابل ویرایش‌اند |
| لحن، clarification و پاسخ راهنما | رفتار مکالمه | در قانون `SYSTEM_QUOTATION_RESPONSE_ENGINE` قابل ویرایش‌اند |
| phrase-listهای intent/routing | تشخیص معنایی | runtime معنایی مسیر اصلی است؛ parser کوچک فقط fallback قطع provider است |
| ترتیب، شرط، گزینه و validation سؤال | invariant داده | در backend باقی ماند؛ مدل اجازهٔ ساخت سؤال/گزینه یا دورزدن validator ندارد |
| transaction، idempotency و Task/Lead/SMS outbox | invariant عملیاتی | در backend باقی ماند |
| gate حالت AI و allowlist گفتینو | invariant امنیتی | در backend باقی ماند |
| تست اتصال provider در `settingService` | ابزار عملیاتی | مستقل از مکالمه باقی ماند و هیچ پاسخ مشتری تولید نمی‌کند |

## Resolution و تعارض

context شامل کانال، محصول، دسته، URL صفحه، intent، state مکالمه و استعلام، فیلد جاری، نوع پیام و نقش کاربر است. قوانین ناسالم یا خارج scope با علت ثبت‌شده کنار گذاشته می‌شوند. ترتیب specificity برابر است با فیلد/state، محصول، دسته و سپس عمومی؛ در یک `conflictKey`، اولویت عددی کمتر برنده است و tie با نسخه و شناسه به‌صورت قطعی شکسته می‌شود. قوانین غیرمتعارض هم‌زمان اعمال می‌شوند.

## قرارداد اجرا

مدل فقط JSON مطابق schema برمی‌گرداند. action پیشنهادی از allowlist عبور می‌کند؛ ذخیره پاسخ، transition، عملیات دیتابیس و نتیجهٔ واقعی ثبت تنها در backend انجام می‌شوند. BrainLog شامل candidate/selected/rejected، نسخه، context، منبع دانش، تصمیم مدل، action پیشنهادی/تأییدشده و validation است. simulator همین resolver/runtime را بدون ایجاد Lead، Task یا SMS استفاده می‌کند.

## fallbackها

fallback ثابت فقط قرارداد پایهٔ ایمنی و پاسخ امن هنگام unavailable بودن provider است. fallbackهای parser برای تشخیص‌های عملیاتی محدود، state را حفظ می‌کنند و اجازهٔ ثبت پاسخ غیرcanonical یا اجرای action خارج allowlist را نمی‌دهند.
