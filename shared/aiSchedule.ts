export type AiMode = 'OFF' | 'TEST_MODE' | 'ACTIVE';
export type IranWeekday = 'SATURDAY' | 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';
export type AiDaySchedule = { enabled: boolean; startTime: string; endTime: string };

export type AiSchedule = {
  enabled: boolean;
  weekly: Record<IranWeekday, AiDaySchedule>;
  allowedMode: Exclude<AiMode, 'OFF'>;
  timezone: 'Asia/Tehran';
};

export type LegacyAiSchedule = {
  enabled: boolean;
  days: IranWeekday[];
  startTime: string;
  endTime: string;
  allowedMode: Exclude<AiMode, 'OFF'>;
  timezone?: string;
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
  weekly: Object.fromEntries(IRAN_WEEKDAYS.map((day) => [day.id, { enabled: true, startTime: '08:00', endTime: '18:00' }])) as Record<IranWeekday, AiDaySchedule>,
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

export function isLegacyAiSchedule(input: unknown): input is LegacyAiSchedule {
  return Boolean(input && typeof input === 'object' && Array.isArray((input as LegacyAiSchedule).days) && !('weekly' in input));
}

export function migrateLegacyAiSchedule(input: LegacyAiSchedule): AiSchedule {
  const validDays = new Set(IRAN_WEEKDAYS.map((day) => day.id));
  const selectedDays = new Set(input.days.filter((day) => validDays.has(day)));
  return validateAiSchedule({
    enabled: input.enabled,
    weekly: Object.fromEntries(IRAN_WEEKDAYS.map((day) => [day.id, {
      enabled: selectedDays.has(day.id),
      startTime: input.startTime,
      endTime: input.endTime,
    }])),
    allowedMode: input.allowedMode,
    timezone: 'Asia/Tehran',
  });
}

export function validateAiSchedule(input: unknown): AiSchedule {
  if (!input || typeof input !== 'object') throw new Error('تنظیمات زمان‌بندی معتبر نیست.');
  if (isLegacyAiSchedule(input)) return migrateLegacyAiSchedule(input);
  const value = input as Partial<AiSchedule>;
  if (typeof value.enabled !== 'boolean' || !value.weekly || typeof value.weekly !== 'object' || !['ACTIVE', 'TEST_MODE'].includes(String(value.allowedMode))) {
    throw new Error('تنظیمات زمان‌بندی معتبر نیست.');
  }
  const weekly = {} as Record<IranWeekday, AiDaySchedule>;
  for (const day of IRAN_WEEKDAYS) {
    const entry = value.weekly[day.id];
    if (!entry || typeof entry.enabled !== 'boolean') throw new Error(`تنظیمات روز ${day.label} معتبر نیست.`);
    const startTime = String(entry.startTime || '');
    const endTime = String(entry.endTime || '');
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (start < 0 || end < 0 || end <= start) {
      throw new Error(`ساعت پایان ${day.label} باید بعد از ساعت شروع باشد؛ بازهٔ عبوری از نیمه‌شب پشتیبانی نمی‌شود.`);
    }
    weekly[day.id] = { enabled: entry.enabled, startTime, endTime };
  }
  if (value.enabled && !Object.values(weekly).some((day) => day.enabled)) throw new Error('حداقل یک روز کاری را فعال کنید.');
  return {
    enabled: value.enabled,
    weekly,
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
  const today = schedule.weekly[local.day];
  const start = timeToMinutes(today.startTime);
  const end = timeToMinutes(today.endTime);
  return today.enabled && local.minuteOfDay >= start && local.minuteOfDay < end
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
