export type AiMode = 'OFF' | 'TEST_MODE' | 'ACTIVE';

export type IranWeekday =
  | 'SATURDAY'
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY';

export interface AiTimeRange {
  startTime: string;
  endTime: string;
}

export interface AiDaySchedule {
  ranges: AiTimeRange[];
}

export interface AiSchedule {
  enabled: boolean;
  weekly: Record<IranWeekday, AiDaySchedule>;
  allowedMode: 'ACTIVE' | 'TEST_MODE';
  timezone: 'Asia/Tehran';
}

export interface LegacyAiSchedule {
  enabled: boolean;
  days: IranWeekday[];
  startTime: string;
  endTime: string;
  allowedMode: 'ACTIVE' | 'TEST_MODE';
}

interface SingleRangeDaySchedule {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface SingleRangeWeeklySchedule {
  enabled: boolean;
  weekly: Record<IranWeekday, SingleRangeDaySchedule>;
  allowedMode: 'ACTIVE' | 'TEST_MODE';
  timezone?: 'Asia/Tehran';
}

interface PreviousTimeRange {
  startTime: string;
  endTime: string;
  endDay: 'SAME_DAY' | 'NEXT_DAY';
  untilEndOfDay: boolean;
}

interface PreviousMultiRangeSchedule {
  enabled: boolean;
  weekly: Record<IranWeekday, { ranges: PreviousTimeRange[] }>;
  allowedMode: 'ACTIVE' | 'TEST_MODE';
  timezone?: 'Asia/Tehran';
}

export const IRAN_WEEKDAYS: ReadonlyArray<{ id: IranWeekday; label: string }> = [
  { id: 'SATURDAY', label: 'شنبه' },
  { id: 'SUNDAY', label: 'یکشنبه' },
  { id: 'MONDAY', label: 'دوشنبه' },
  { id: 'TUESDAY', label: 'سه‌شنبه' },
  { id: 'WEDNESDAY', label: 'چهارشنبه' },
  { id: 'THURSDAY', label: 'پنج‌شنبه' },
  { id: 'FRIDAY', label: 'جمعه' },
];

const WEEK_MINUTES = 7 * 24 * 60;
const DEFAULT_RANGE: AiTimeRange = { startTime: '08:00', endTime: '18:00' };

function makeWeekly(factory: () => AiDaySchedule): AiSchedule['weekly'] {
  return Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, factory()])) as AiSchedule['weekly'];
}

export const DEFAULT_AI_SCHEDULE: AiSchedule = {
  enabled: false,
  weekly: makeWeekly(() => ({ ranges: [{ ...DEFAULT_RANGE }] })),
  allowedMode: 'ACTIVE',
  timezone: 'Asia/Tehran',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllowedMode(value: unknown): value is AiSchedule['allowedMode'] {
  return value === 'ACTIVE' || value === 'TEST_MODE';
}

export function isLegacyAiSchedule(input: unknown): input is LegacyAiSchedule {
  return isRecord(input) && Array.isArray(input.days) && typeof input.startTime === 'string' && typeof input.endTime === 'string' && !('weekly' in input);
}

export function isSingleRangeAiSchedule(input: unknown): input is SingleRangeWeeklySchedule {
  if (!isRecord(input) || !isRecord(input.weekly)) return false;
  return IRAN_WEEKDAYS.every(({ id }) => {
    const day = input.weekly[id];
    return isRecord(day) && typeof day.enabled === 'boolean' && typeof day.startTime === 'string' && typeof day.endTime === 'string' && !('ranges' in day);
  });
}

export function isPreviousMultiRangeSchedule(input: unknown): input is PreviousMultiRangeSchedule {
  if (!isRecord(input) || !isRecord(input.weekly)) return false;
  let foundPreviousRange = false;
  const valid = IRAN_WEEKDAYS.every(({ id }) => {
    const day = input.weekly[id];
    if (!isRecord(day) || !Array.isArray(day.ranges)) return false;
    return day.ranges.every((range) => {
      if (!isRecord(range)) return false;
      if ('endDay' in range || 'untilEndOfDay' in range || range.endTime === '24:00') foundPreviousRange = true;
      return typeof range.startTime === 'string' && typeof range.endTime === 'string';
    });
  });
  return valid && foundPreviousRange;
}

export function needsAiScheduleUpgrade(input: unknown): boolean {
  return isLegacyAiSchedule(input) || isSingleRangeAiSchedule(input) || isPreviousMultiRangeSchedule(input);
}

function rangeFromSingle(startTime: string, endTime: string): AiTimeRange {
  return { startTime, endTime };
}

export function migrateLegacyAiSchedule(input: LegacyAiSchedule): AiSchedule {
  const selected = new Set(input.days.filter((day): day is IranWeekday => IRAN_WEEKDAYS.some(({ id }) => id === day)));
  return validateAiSchedule({
    enabled: input.enabled,
    weekly: Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, { ranges: selected.has(id) ? [rangeFromSingle(input.startTime, input.endTime)] : [] }])),
    allowedMode: input.allowedMode,
    timezone: 'Asia/Tehran',
  });
}

export function migrateSingleRangeAiSchedule(input: SingleRangeWeeklySchedule): AiSchedule {
  return validateAiSchedule({
    enabled: input.enabled,
    weekly: Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, { ranges: input.weekly[id].enabled ? [rangeFromSingle(input.weekly[id].startTime, input.weekly[id].endTime)] : [] }])),
    allowedMode: input.allowedMode,
    timezone: 'Asia/Tehran',
  });
}

export function migratePreviousMultiRangeSchedule(input: PreviousMultiRangeSchedule): AiSchedule {
  const weekly = makeWeekly(() => ({ ranges: [] }));
  IRAN_WEEKDAYS.forEach(({ id }, dayIndex) => {
    for (const previous of input.weekly[id].ranges) {
      const endTime = previous.untilEndOfDay || previous.endTime === '24:00' ? '00:00' : previous.endTime;
      const startMinute = parseTime(previous.startTime);
      const endMinute = parseTime(endTime);
      if (previous.endDay === 'NEXT_DAY' && endMinute > startMinute) {
        weekly[id].ranges.push({ startTime: previous.startTime, endTime: '00:00' });
        const nextDay = IRAN_WEEKDAYS[(dayIndex + 1) % IRAN_WEEKDAYS.length].id;
        weekly[nextDay].ranges.push({ startTime: '00:00', endTime });
      } else {
        weekly[id].ranges.push({ startTime: previous.startTime, endTime });
      }
    }
  });
  return validateAiSchedule({ enabled: input.enabled, weekly, allowedMode: input.allowedMode, timezone: 'Asia/Tehran' });
}

function parseTime(value: unknown): number {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('ساعت باید با قالب معتبر HH:mm ثبت شود.');
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function normalizeRange(input: unknown): AiTimeRange {
  if (!isRecord(input)) throw new Error('ساختار بازهٔ زمانی نامعتبر است.');
  parseTime(input.startTime);
  parseTime(input.endTime);
  return { startTime: String(input.startTime), endTime: String(input.endTime) };
}

function endsNextDay(range: AiTimeRange): boolean {
  return parseTime(range.endTime) <= parseTime(range.startTime);
}

function assertNoOverlap(weekly: AiSchedule['weekly']): void {
  const segments: Array<{ start: number; end: number }> = [];
  IRAN_WEEKDAYS.forEach(({ id }, dayIndex) => {
    for (const range of weekly[id].ranges) {
      const start = dayIndex * 1440 + parseTime(range.startTime);
      const endMinute = parseTime(range.endTime);
      const end = dayIndex * 1440 + (endsNextDay(range) ? 1440 + endMinute : endMinute);
      if (end <= WEEK_MINUTES) segments.push({ start, end });
      else segments.push({ start, end: WEEK_MINUTES }, { start: 0, end: end - WEEK_MINUTES });
    }
  });
  segments.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index].start < segments[index - 1].end) {
      throw new Error('بازه‌های زمانی نباید با یکدیگر هم‌پوشانی داشته باشند.');
    }
  }
}

export function validateAiSchedule(input: unknown): AiSchedule {
  if (isLegacyAiSchedule(input)) return migrateLegacyAiSchedule(input);
  if (isSingleRangeAiSchedule(input)) return migrateSingleRangeAiSchedule(input);
  if (isPreviousMultiRangeSchedule(input)) return migratePreviousMultiRangeSchedule(input);
  if (!isRecord(input) || typeof input.enabled !== 'boolean' || !isRecord(input.weekly) || !isAllowedMode(input.allowedMode)) {
    throw new Error('تنظیمات زمان‌بندی نامعتبر است.');
  }
  const weekly = Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => {
    const day = input.weekly[id];
    if (!isRecord(day) || !Array.isArray(day.ranges)) throw new Error(`بازه‌های روز ${id} نامعتبر است.`);
    return [id, { ranges: day.ranges.map(normalizeRange) }];
  })) as AiSchedule['weekly'];
  if (input.enabled && IRAN_WEEKDAYS.every(({ id }) => weekly[id].ranges.length === 0)) {
    throw new Error('برای زمان‌بندی فعال، حداقل یک بازهٔ زمانی ثبت کنید.');
  }
  assertNoOverlap(weekly);
  return { enabled: input.enabled, weekly, allowedMode: input.allowedMode, timezone: 'Asia/Tehran' };
}

export function describeAiRange(day: IranWeekday, range: AiTimeRange): string {
  const dayIndex = IRAN_WEEKDAYS.findIndex(({ id }) => id === day);
  const endDay = endsNextDay(range) ? IRAN_WEEKDAYS[(dayIndex + 1) % IRAN_WEEKDAYS.length] : IRAN_WEEKDAYS[dayIndex];
  return `${IRAN_WEEKDAYS[dayIndex].label} ${range.startTime} تا ${endDay.label} ${range.endTime}`;
}

export function iranLocalDayAndMinute(now = new Date()): { day: IranWeekday; minuteOfDay: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, IranWeekday> = {
    Saturday: 'SATURDAY', Sunday: 'SUNDAY', Monday: 'MONDAY', Tuesday: 'TUESDAY',
    Wednesday: 'WEDNESDAY', Thursday: 'THURSDAY', Friday: 'FRIDAY',
  };
  return { day: weekdayMap[parts.weekday], minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute) };
}

function rangeActiveOnStartDay(range: AiTimeRange, minute: number): boolean {
  const start = parseTime(range.startTime);
  return minute >= start && (endsNextDay(range) || minute < parseTime(range.endTime));
}

function rangeActiveFromPreviousDay(range: AiTimeRange, minute: number): boolean {
  return endsNextDay(range) && minute < parseTime(range.endTime);
}

export function resolveEffectiveAiMode(manualMode: AiMode, rawSchedule: unknown, now = new Date()): AiMode {
  const schedule = validateAiSchedule(rawSchedule);
  if (!schedule.enabled) return manualMode;
  const { day, minuteOfDay } = iranLocalDayAndMinute(now);
  const dayIndex = IRAN_WEEKDAYS.findIndex(({ id }) => id === day);
  const previousDay = IRAN_WEEKDAYS[(dayIndex + IRAN_WEEKDAYS.length - 1) % IRAN_WEEKDAYS.length].id;
  const active = schedule.weekly[day].ranges.some((range) => rangeActiveOnStartDay(range, minuteOfDay))
    || schedule.weekly[previousDay].ranges.some((range) => rangeActiveFromPreviousDay(range, minuteOfDay));
  return active ? schedule.allowedMode : 'OFF';
}

export function shouldExecuteAi(mode: AiMode): boolean {
  return mode !== 'OFF';
}

export function effectiveAiStatusLabel(mode: AiMode): string {
  if (mode === 'ACTIVE') return 'اکنون فعال است';
  if (mode === 'TEST_MODE') return 'اکنون در Test Mode است';
  return 'اکنون خارج از ساعت کاری و خاموش است';
}
