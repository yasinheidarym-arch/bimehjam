export type AiMode = 'OFF' | 'TEST_MODE' | 'ACTIVE';
export type IranWeekday = 'SATURDAY' | 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';

export type AiSchedule = {
  enabled: boolean;
  days: IranWeekday[];
  startTime: string;
  endTime: string;
  allowedMode: Exclude<AiMode, 'OFF'>;
  timezone: 'Asia/Tehran';
};

export const IRAN_WEEKDAYS: Array<{ id: IranWeekday; label: string }> = [
  { id: 'SATURDAY', label: 'شنبه' },
  { id: 'SUNDAY', label: 'یکشنبه' },
  { id: 'MONDAY', label: 'دوشنبه' },
  { id: 'TUESDAY', label: 'سه‌شنبه' },
  { id: 'WEDNESDAY', label: 'چهارشنبه' },
  { id: 'THURSDAY', label: 'پنج‌شنبه' },
  { id: 'FRIDAY', label: 'جمعه' },
];

export const DEFAULT_AI_SCHEDULE: AiSchedule = {
  enabled: false,
  days: IRAN_WEEKDAYS.map((day) => day.id),
  startTime: '08:00',
  endTime: '18:00',
  allowedMode: 'ACTIVE',
  timezone: 'Asia/Tehran',
};

const WEEKDAY_BY_SHORT_NAME: Record<string, IranWeekday> = {
  Sat: 'SATURDAY', Sun: 'SUNDAY', Mon: 'MONDAY', Tue: 'TUESDAY', Wed: 'WEDNESDAY', Thu: 'THURSDAY', Fri: 'FRIDAY',
};

function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : -1;
}

export function validateAiSchedule(input: unknown): AiSchedule {
  if (!input || typeof input !== 'object') throw new Error('تنظیمات زمان‌بندی معتبر نیست.');
  const value = input as Partial<AiSchedule>;
  const validDays = new Set(IRAN_WEEKDAYS.map((day) => day.id));
  const days = Array.isArray(value.days) ? [...new Set(value.days.filter((day): day is IranWeekday => validDays.has(day as IranWeekday)))] : [];
  const start = timeToMinutes(String(value.startTime || ''));
  const end = timeToMinutes(String(value.endTime || ''));
  if (typeof value.enabled !== 'boolean' || !['ACTIVE', 'TEST_MODE'].includes(String(value.allowedMode))) {
    throw new Error('تنظیمات زمان‌بندی معتبر نیست.');
  }
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('ساعت پایان باید بعد از ساعت شروع باشد؛ بازهٔ عبوری از نیمه‌شب پشتیبانی نمی‌شود.');
  }
  if (value.enabled && days.length === 0) throw new Error('حداقل یک روز کاری را انتخاب کنید.');
  return {
    enabled: value.enabled,
    days,
    startTime: String(value.startTime),
    endTime: String(value.endTime),
    allowedMode: value.allowedMode as AiSchedule['allowedMode'],
    timezone: 'Asia/Tehran',
  };
}

export function iranLocalDayAndMinute(now: Date): { day: IranWeekday; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: WEEKDAY_BY_SHORT_NAME[values.weekday], minuteOfDay: Number(values.hour) * 60 + Number(values.minute) };
}

export function resolveEffectiveAiMode(manualMode: AiMode, scheduleInput: AiSchedule, now = new Date()): AiMode {
  const schedule = validateAiSchedule(scheduleInput);
  if (!schedule.enabled) return manualMode;
  const local = iranLocalDayAndMinute(now);
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  return schedule.days.includes(local.day) && local.minuteOfDay >= start && local.minuteOfDay < end
    ? schedule.allowedMode
    : 'OFF';
}

export function effectiveAiStatusLabel(mode: AiMode): string {
  if (mode === 'ACTIVE') return 'اکنون فعال است';
  if (mode === 'TEST_MODE') return 'اکنون در Test Mode است';
  return 'اکنون خارج از ساعت کاری و خاموش است';
}

export function shouldExecuteAi(mode: AiMode): boolean {
  return mode === 'ACTIVE' || mode === 'TEST_MODE';
}
