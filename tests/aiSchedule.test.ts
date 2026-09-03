import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiSchedule,
  AiTimeRange,
  IRAN_WEEKDAYS,
  iranLocalDayAndMinute,
  migrateLegacyAiSchedule,
  migrateSingleRangeAiSchedule,
  resolveEffectiveAiMode,
  shouldExecuteAi,
  validateAiSchedule,
} from '../shared/aiSchedule';

const sameDay = (startTime: string, endTime: string): AiTimeRange => ({ startTime, endTime, endDay: 'SAME_DAY', untilEndOfDay: false });
const nextDay = (startTime: string, endTime: string): AiTimeRange => ({ startTime, endTime, endDay: 'NEXT_DAY', untilEndOfDay: false });

function emptySchedule(): AiSchedule {
  return {
    enabled: true,
    weekly: Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, { ranges: [] }])) as AiSchedule['weekly'],
    allowedMode: 'ACTIVE',
    timezone: 'Asia/Tehran',
  };
}

function multiRangeSchedule(): AiSchedule {
  const schedule = emptySchedule();
  schedule.weekly.SUNDAY.ranges = [sameDay('00:00', '08:00'), nextDay('17:00', '08:00')];
  return schedule;
}

test('disabled scheduling preserves the manual AI mode', () => {
  const schedule = { ...multiRangeSchedule(), enabled: false };
  assert.equal(resolveEffectiveAiMode('TEST_MODE', schedule, new Date('2026-09-06T12:00:00Z')), 'TEST_MODE');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-06T12:00:00Z')), 'OFF');
});

test('two separate Sunday ranges activate independently', () => {
  const schedule = multiRangeSchedule();
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T20:30:00Z')), 'ACTIVE', 'Sunday 00:00 is inclusive');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-06T06:00:00Z')), 'OFF', 'Sunday 09:30 is between ranges');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-06T13:30:00Z')), 'ACTIVE', 'Sunday 17:00 is inclusive');
});

test('overnight range keeps the following morning active', () => {
  const schedule = multiRangeSchedule();
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-07T04:29:00Z')), 'ACTIVE', 'Monday 07:59 continues Sunday range');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-07T04:30:00Z')), 'OFF', 'Monday 08:00 is the exclusive end');
});

test('until end of day stops exactly at the new-day boundary', () => {
  const schedule = emptySchedule();
  schedule.weekly.SATURDAY.ranges = [{ startTime: '17:00', endTime: '24:00', endDay: 'SAME_DAY', untilEndOfDay: true }];
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T20:29:00Z')), 'ACTIVE', 'Saturday 23:59 is active');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T20:30:00Z')), 'OFF', 'Sunday 00:00 is outside Saturday range');
});

test('a day without ranges is OFF unless the previous range continues', () => {
  const schedule = emptySchedule();
  schedule.weekly.SATURDAY.ranges = [nextDay('17:00', '02:00')];
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T21:30:00Z')), 'ACTIVE', 'Sunday 01:00 continues Saturday');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T22:30:00Z')), 'OFF', 'Sunday 02:00 is the end boundary');
});

test('Tehran timezone is used across the UTC weekday boundary', () => {
  assert.deepEqual(iranLocalDayAndMinute(new Date('2026-09-04T21:00:00Z')), { day: 'SATURDAY', minuteOfDay: 30 });
});

test('overlaps within a day and from the previous overnight range are rejected', () => {
  const sameDayOverlap = emptySchedule();
  sameDayOverlap.weekly.SUNDAY.ranges = [sameDay('00:00', '08:00'), sameDay('07:00', '09:00')];
  assert.throws(() => validateAiSchedule(sameDayOverlap), /هم‌پوشانی/);

  const crossDayOverlap = emptySchedule();
  crossDayOverlap.weekly.SATURDAY.ranges = [nextDay('17:00', '08:00')];
  crossDayOverlap.weekly.SUNDAY.ranges = [sameDay('00:00', '08:00')];
  assert.throws(() => validateAiSchedule(crossDayOverlap), /هم‌پوشانی/);
});

test('connected ranges are valid and produce one effective execution decision', () => {
  const schedule = emptySchedule();
  schedule.weekly.SUNDAY.ranges = [sameDay('00:00', '08:00'), sameDay('08:00', '10:00')];
  assert.doesNotThrow(() => validateAiSchedule(schedule));
  const mode = resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-06T04:30:00Z'));
  assert.equal(mode, 'ACTIVE');
  assert.equal(shouldExecuteAi(mode), true);
});

test('current single-range weekly settings convert without losing enabled days or hours', () => {
  const weekly = Object.fromEntries(IRAN_WEEKDAYS.map(({ id }) => [id, { enabled: false, startTime: '08:00', endTime: '18:00' }])) as Record<(typeof IRAN_WEEKDAYS)[number]['id'], { enabled: boolean; startTime: string; endTime: string }>;
  weekly.SATURDAY = { enabled: true, startTime: '09:15', endTime: '17:45' };
  const converted = migrateSingleRangeAiSchedule({ enabled: true, weekly, allowedMode: 'TEST_MODE', timezone: 'Asia/Tehran' });
  assert.deepEqual(converted.weekly.SATURDAY.ranges, [sameDay('09:15', '17:45')]);
  assert.deepEqual(converted.weekly.FRIDAY.ranges, []);
  assert.equal(converted.allowedMode, 'TEST_MODE');
});

test('old shared schedule also converts to range arrays', () => {
  const converted = migrateLegacyAiSchedule({ enabled: true, days: ['SATURDAY'], startTime: '09:00', endTime: '17:00', allowedMode: 'ACTIVE' });
  assert.deepEqual(converted.weekly.SATURDAY.ranges, [sameDay('09:00', '17:00')]);
  assert.deepEqual(converted.weekly.SUNDAY.ranges, []);
});

test('invalid same-day range and an enabled schedule with no ranges are rejected', () => {
  const invalid = emptySchedule();
  invalid.weekly.SATURDAY.ranges = [sameDay('18:00', '08:00')];
  assert.throws(() => validateAiSchedule(invalid), /بعد از ساعت شروع/);
  assert.throws(() => validateAiSchedule(emptySchedule()), /حداقل یک بازه/);
});
