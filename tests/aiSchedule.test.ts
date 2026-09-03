import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiSchedule,
  AiTimeRange,
  describeAiRange,
  IRAN_WEEKDAYS,
  iranLocalDayAndMinute,
  migratePreviousMultiRangeSchedule,
  migrateSingleRangeAiSchedule,
  resolveEffectiveAiMode,
  validateAiSchedule,
} from '../shared/aiSchedule';

const range = (startTime: string, endTime: string): AiTimeRange => ({ startTime, endTime });

function emptySchedule(): AiSchedule {
  return {
    enabled: true,
    weekly: Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, { ranges: [] }])) as AiSchedule['weekly'],
    allowedMode: 'ACTIVE',
    timezone: 'Asia/Tehran',
  };
}

test('end after start creates a same-day range with a clear summary', () => {
  const schedule = emptySchedule();
  schedule.weekly.SUNDAY.ranges = [range('08:00', '18:00')];
  assert.equal(describeAiRange('SUNDAY', schedule.weekly.SUNDAY.ranges[0]), 'یکشنبه 08:00 تا یکشنبه 18:00');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-06T08:30:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-06T14:30:00Z')), 'OFF');
});

test('end before start automatically continues to the next day', () => {
  const schedule = emptySchedule();
  schedule.weekly.SATURDAY.ranges = [range('17:00', '08:00')];
  assert.equal(describeAiRange('SATURDAY', schedule.weekly.SATURDAY.ranges[0]), 'شنبه 17:00 تا یکشنبه 08:00');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T13:30:00Z')), 'ACTIVE', 'Saturday 17:00 is inclusive');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-06T04:29:00Z')), 'ACTIVE', 'Sunday 07:59 continues the range');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-06T04:30:00Z')), 'OFF', 'Sunday 08:00 is exclusive');
});

test('00:00 and the new-day boundary follow Tehran time', () => {
  const schedule = emptySchedule();
  schedule.weekly.SATURDAY.ranges = [range('17:00', '00:00')];
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T20:29:00Z')), 'ACTIVE', 'Saturday 23:59 is active');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T20:30:00Z')), 'OFF', 'Sunday 00:00 is the exclusive end');
  assert.deepEqual(iranLocalDayAndMinute(new Date('2026-09-04T21:00:00Z')), { day: 'SATURDAY', minuteOfDay: 30 });
});

test('equal start and end represents a full 24-hour range', () => {
  const schedule = emptySchedule();
  schedule.weekly.SUNDAY.ranges = [range('00:00', '00:00')];
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T20:30:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-06T20:29:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-06T20:30:00Z')), 'OFF');
});

test('multiple ranges remain independent and a day without coverage is OFF', () => {
  const schedule = emptySchedule();
  schedule.weekly.SUNDAY.ranges = [range('00:00', '08:00'), range('17:00', '23:00')];
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T20:30:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-06T06:00:00Z')), 'OFF');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-06T13:30:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-07T08:30:00Z')), 'OFF');
});

test('same-day and cross-day overlaps are rejected while connected ranges are accepted', () => {
  const sameDayOverlap = emptySchedule();
  sameDayOverlap.weekly.SUNDAY.ranges = [range('00:00', '08:00'), range('07:00', '09:00')];
  assert.throws(() => validateAiSchedule(sameDayOverlap), /هم‌پوشانی/);

  const crossDayOverlap = emptySchedule();
  crossDayOverlap.weekly.SATURDAY.ranges = [range('17:00', '08:00')];
  crossDayOverlap.weekly.SUNDAY.ranges = [range('00:00', '08:00')];
  assert.throws(() => validateAiSchedule(crossDayOverlap), /هم‌پوشانی/);

  const connected = emptySchedule();
  connected.weekly.SUNDAY.ranges = [range('00:00', '08:00'), range('08:00', '10:00')];
  assert.doesNotThrow(() => validateAiSchedule(connected));
});

test('previous explicit end-day settings migrate without losing coverage', () => {
  const weekly = Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, { ranges: [] as Array<{ startTime: string; endTime: string; endDay: 'SAME_DAY' | 'NEXT_DAY'; untilEndOfDay: boolean }> }])) as Record<(typeof IRAN_WEEKDAYS)[number]['id'], { ranges: Array<{ startTime: string; endTime: string; endDay: 'SAME_DAY' | 'NEXT_DAY'; untilEndOfDay: boolean }> }>;
  weekly.SATURDAY.ranges = [{ startTime: '17:00', endTime: '24:00', endDay: 'SAME_DAY', untilEndOfDay: true }];
  weekly.SUNDAY.ranges = [{ startTime: '08:00', endTime: '17:00', endDay: 'NEXT_DAY', untilEndOfDay: false }];
  const converted = migratePreviousMultiRangeSchedule({ enabled: true, weekly, allowedMode: 'ACTIVE', timezone: 'Asia/Tehran' });
  assert.deepEqual(converted.weekly.SATURDAY.ranges, [range('17:00', '00:00')]);
  assert.deepEqual(converted.weekly.SUNDAY.ranges, [range('08:00', '00:00')]);
  assert.deepEqual(converted.weekly.MONDAY.ranges, [range('00:00', '17:00')]);
});

test('older single-range daily settings convert to one simple range', () => {
  const weekly = Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, { enabled: false, startTime: '08:00', endTime: '18:00' }])) as Record<(typeof IRAN_WEEKDAYS)[number]['id'], { enabled: boolean; startTime: string; endTime: string }>;
  weekly.SATURDAY = { enabled: true, startTime: '09:15', endTime: '17:45' };
  const converted = migrateSingleRangeAiSchedule({ enabled: true, weekly, allowedMode: 'TEST_MODE', timezone: 'Asia/Tehran' });
  assert.deepEqual(converted.weekly.SATURDAY.ranges, [range('09:15', '17:45')]);
  assert.deepEqual(converted.weekly.FRIDAY.ranges, []);
});

test('enabled schedule with no ranges is rejected', () => {
  assert.throws(() => validateAiSchedule(emptySchedule()), /حداقل یک بازه/);
});
