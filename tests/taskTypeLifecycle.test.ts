import assert from 'node:assert/strict';
import test from 'node:test';
import { taskTypeRemovalMessage, taskTypeRemovalMode } from '../shared/taskTypeLifecycle';

test('unused custom task type is physically deleted', () => {
  assert.equal(taskTypeRemovalMode({ builtin: false, usageCount: 0, automationUsage: false }), 'deleted');
  assert.equal(taskTypeRemovalMessage({ mode: 'deleted', usageCount: 0 }), 'نوع بدون استفاده برای همیشه حذف شد.');
});

test('task type used by historical tasks is archived with explicit history message', () => {
  assert.equal(taskTypeRemovalMode({ builtin: false, usageCount: 20, automationUsage: false }), 'archived');
  assert.equal(
    taskTypeRemovalMessage({ mode: 'archived', usageCount: 20 }),
    'این نوع در وظایف قبلی استفاده شده و برای حفظ تاریخچه آرشیو شد.',
  );
});

test('system or automation-dependent task types are archived', () => {
  assert.equal(taskTypeRemovalMode({ builtin: true, usageCount: 0, automationUsage: false }), 'archived');
  assert.equal(taskTypeRemovalMode({ builtin: false, usageCount: 0, automationUsage: true }), 'archived');
});
