import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiSchedule,
  iranLocalDayAndMinute,
  resolveEffectiveAiMode,
  shouldExecuteAi,
  validateAiSchedule,
} from '../shared/aiSchedule';

const activeSchedule: AiSchedule = {
  enabled: true,
  days: ['SATURDAY'],
  startTime: '08:00',
  endTime: '18:00',
  allowedMode: 'ACTIVE',
  timezone: 'Asia/Tehran',
};

test('disabled schedule preserves the current manual mode', () => {
  assert.equal(resolveEffectiveAiMode('TEST_MODE', { ...activeSchedule, enabled: false }, new Date('2026-09-04T12:00:00Z')), 'TEST_MODE');
  assert.equal(resolveEffectiveAiMode('OFF', { ...activeSchedule, enabled: false }, new Date('2026-09-05T05:00:00Z')), 'OFF');
});

test('unselected Iran weekday resolves to OFF before any AI execution', () => {
  const mode = resolveEffectiveAiMode('ACTIVE', activeSchedule, new Date('2026-09-04T08:00:00Z'));
  assert.equal(mode, 'OFF');
  assert.equal(shouldExecuteAi(mode), false, 'OFF gate must stop LLM, Goftino response, task and AI automation execution');
});

test('times before and after the allowed interval resolve to OFF', () => {
  assert.equal(resolveEffectiveAiMode('ACTIVE', activeSchedule, new Date('2026-09-05T04:29:00Z')), 'OFF');
  assert.equal(resolveEffectiveAiMode('ACTIVE', activeSchedule, new Date('2026-09-05T14:30:00Z')), 'OFF');
});

test('selected day and time runs ACTIVE mode', () => {
  assert.equal(resolveEffectiveAiMode('OFF', activeSchedule, new Date('2026-09-05T05:00:00Z')), 'ACTIVE');
});

test('selected Test Mode is effective only inside the interval', () => {
  const schedule = { ...activeSchedule, allowedMode: 'TEST_MODE' as const };
  assert.equal(resolveEffectiveAiMode('ACTIVE', schedule, new Date('2026-09-05T05:00:00Z')), 'TEST_MODE');
});

test('start boundary is inclusive and end boundary is exclusive', () => {
  assert.equal(resolveEffectiveAiMode('ACTIVE', activeSchedule, new Date('2026-09-05T04:30:00Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', activeSchedule, new Date('2026-09-05T14:29:59Z')), 'ACTIVE');
  assert.equal(resolveEffectiveAiMode('ACTIVE', activeSchedule, new Date('2026-09-05T14:30:00Z')), 'OFF');
});

test('weekday and clock are calculated in Asia/Tehran across UTC day boundary', () => {
  assert.deepEqual(iranLocalDayAndMinute(new Date('2026-09-04T21:00:00Z')), { day: 'SATURDAY', minuteOfDay: 30 });
});

test('overnight or empty enabled schedules are rejected', () => {
  assert.throws(() => validateAiSchedule({ ...activeSchedule, startTime: '18:00', endTime: '08:00' }), /بعد از ساعت شروع/);
  assert.throws(() => validateAiSchedule({ ...activeSchedule, days: [] }), /حداقل یک روز/);
});
