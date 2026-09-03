import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiSchedule,
  IRAN_WEEKDAYS,
  iranLocalDayAndMinute,
  migrateLegacyAiSchedule,
  resolveEffectiveAiMode,
  shouldExecuteAi,
  validateAiSchedule,
} from '../shared/aiSchedule';

function weeklySchedule(): AiSchedule {
  const weekly = Object.fromEntries(IRAN_WEEKDAYS.map((day) => [day.id, { enabled: false, startTime: '08:00', endTime: '18:00' }])) as AiSchedule['weekly'];
  weekly.SATURDAY = { enabled: true, startTime: '08:00', endTime: '12:00' };
  weekly.THURSDAY = { enabled: true, startTime: '14:00', endTime: '20:00' };
  return { enabled: true, weekly, allowedMode: 'ACTIVE', timezone: 'Asia/Tehran' };
}

test('disabled weekly schedule preserves the current manual mode', () => {
  const schedule = { ...weeklySchedule(), enabled: false };
  assert.equal(resolveEffectiveAiMode('TEST_MODE', schedule, new Date('2026-09-04T12:00:00Z')), 'TEST_MODE');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T05:00:00Z')), 'OFF');
});

test('Saturday uses its independent interval', () => {
  const schedule = weeklySchedule();
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-05T05:00:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T09:00:00Z')), 'OFF');
});

test('Thursday uses a different independent interval', () => {
  const schedule = weeklySchedule();
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-03T09:00:00Z')), 'OFF');
  assert.equal(resolveEffectiveAiMode('OFF', schedule, new Date('2026-09-03T11:00:00Z')), 'ACTIVE');
});

test('disabled Friday resolves to OFF before any AI execution', () => {
  const mode = resolveEffectiveAiMode('ACTIVE', weeklySchedule(), new Date('2026-09-04T08:00:00Z'));
  assert.equal(mode, 'OFF');
  assert.equal(shouldExecuteAi(mode), false, 'OFF gate must stop LLM, Goftino response, task and AI automation execution');
});

test('shared Test Mode applies inside each enabled day interval', () => {
  const schedule = { ...weeklySchedule(), allowedMode: 'TEST_MODE' as const };
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-03T11:00:00Z')), 'TEST_MODE');
});

test('daily start boundary is inclusive and end boundary is exclusive', () => {
  const schedule = weeklySchedule();
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T04:30:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T08:29:59Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T08:30:00Z')), 'OFF');
});

test('weekday and clock are calculated in Asia/Tehran across UTC day boundary', () => {
  assert.deepEqual(iranLocalDayAndMinute(new Date('2026-09-04T21:00:00Z')), { day: 'SATURDAY', minuteOfDay: 30 });
});

test('legacy shared interval converts selected days without losing hours', () => {
  const converted = migrateLegacyAiSchedule({
    enabled: true,
    days: ['SATURDAY', 'THURSDAY'],
    startTime: '09:15',
    endTime: '17:45',
    allowedMode: 'TEST_MODE',
  });
  assert.deepEqual(converted.weekly.SATURDAY, { enabled: true, startTime: '09:15', endTime: '17:45' });
  assert.deepEqual(converted.weekly.THURSDAY, { enabled: true, startTime: '09:15', endTime: '17:45' });
  assert.deepEqual(converted.weekly.FRIDAY, { enabled: false, startTime: '09:15', endTime: '17:45' });
  assert.equal(converted.allowedMode, 'TEST_MODE');
});

test('overnight daily interval or no enabled day is rejected', () => {
  const overnight = weeklySchedule();
  overnight.weekly.SATURDAY = { enabled: true, startTime: '18:00', endTime: '08:00' };
  assert.throws(() => validateAiSchedule(overnight), /بعد از ساعت شروع/);
  const empty = weeklySchedule();
  for (const day of IRAN_WEEKDAYS) empty.weekly[day.id].enabled = false;
  assert.throws(() => validateAiSchedule(empty), /حداقل یک روز/);
});
