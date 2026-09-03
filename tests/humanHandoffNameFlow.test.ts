import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceHumanHandoffName,
  FULL_NAME_REQUEST_MESSAGE,
  LAST_NAME_REQUEST_MESSAGE,
} from '../server/services/humanHandoffNameFlow';
import { renderTaskSmsTemplate } from '../server/services/taskSmsTemplate';

test('completed quotation asks for missing name, stores full name, then builds task SMS with the name', () => {
  const ask = advanceHumanHandoffName({ reason: 'QUOTATION_COMPLETED', existingCustomerName: 'مشتری گفتینو' });
  assert.equal(ask.action, 'ASK_NAME');
  if (ask.action !== 'ASK_NAME') return;
  assert.equal(ask.replyText, FULL_NAME_REQUEST_MESSAGE);

  const complete = advanceHumanHandoffName({ reason: 'QUOTATION_COMPLETED', state: ask.state, message: 'علی رضایی' });
  assert.deepEqual(complete, { action: 'CREATE_TASK', fullName: 'علی رضایی', reason: 'QUOTATION_COMPLETED', nameStatus: 'RECORDED' });
  const message = renderTaskSmsTemplate('{{customerFullName}} - {{taskTitle}}', {
    taskType: 'آماده‌سازی قیمت', taskTitle: 'محاسبه قیمت', priority: 'HIGH', customerFullName: complete.fullName || 'ثبت نشده', taskId: 'task-1', taskLink: '/tasks/task-1',
  });
  assert.equal(message, 'علی رضایی - محاسبه قیمت');
});

test('direct expert request asks for name and then creates the handoff task', () => {
  const ask = advanceHumanHandoffName({ reason: 'DIRECT_HUMAN_REQUEST', existingCustomerName: null });
  assert.equal(ask.action, 'ASK_NAME');
  if (ask.action !== 'ASK_NAME') return;
  const firstName = advanceHumanHandoffName({ reason: 'DIRECT_HUMAN_REQUEST', state: ask.state, message: 'اسمم سارا است' });
  assert.equal(firstName.action, 'ASK_NAME');
  if (firstName.action !== 'ASK_NAME') return;
  assert.equal(firstName.replyText, LAST_NAME_REQUEST_MESSAGE);
  const complete = advanceHumanHandoffName({ reason: 'DIRECT_HUMAN_REQUEST', state: firstName.state, message: 'احمدی' });
  assert.equal(complete.action, 'CREATE_TASK');
  if (complete.action === 'CREATE_TASK') assert.equal(complete.fullName, 'سارا احمدی');
});

test('existing full name skips repeat question and creates task immediately', () => {
  const result = advanceHumanHandoffName({ reason: 'DIRECT_HUMAN_REQUEST', existingCustomerName: 'مریم کریمی' });
  assert.deepEqual(result, { action: 'CREATE_TASK', fullName: 'مریم کریمی', reason: 'DIRECT_HUMAN_REQUEST', nameStatus: 'RECORDED' });
});

test('refusing to provide a name still creates a task marked not provided', () => {
  const ask = advanceHumanHandoffName({ reason: 'QUOTATION_COMPLETED' });
  assert.equal(ask.action, 'ASK_NAME');
  if (ask.action !== 'ASK_NAME') return;
  const result = advanceHumanHandoffName({ reason: 'QUOTATION_COMPLETED', state: ask.state, message: 'مایل نیستم نامم را بگویم' });
  assert.deepEqual(result, { action: 'CREATE_TASK', fullName: null, reason: 'QUOTATION_COMPLETED', nameStatus: 'NOT_PROVIDED' });
});
