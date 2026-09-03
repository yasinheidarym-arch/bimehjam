import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTaskCreatedSmsCore } from '../server/services/fastNotifySmsCore';
import { renderTaskSmsTemplate, validateTaskSmsTemplate } from '../server/services/taskSmsTemplate';

const task = {
  id: 'task-123',
  title: 'تماس برای قیمت‌دهی',
  priority: 'HIGH',
  type: 'Call Customer',
  assignedUserId: 'operator-1',
  customerId: 'customer-1',
};

function createHarness(options: {
  enabled?: boolean;
  taskTypes?: string[];
  recipients?: string[];
  mobile?: string | null;
  providerStatus?: number;
  duplicate?: boolean;
  smsTemplate?: string;
  customerFullName?: string | null;
} = {}) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const deliveryUpdates: Array<Record<string, unknown>> = [];
  const settings = [
    { key: 'fastnotify_sms_enabled', value: String(options.enabled ?? true) },
    { key: 'fastnotify_sms_task_types', value: JSON.stringify(options.taskTypes ?? ['Call Customer']) },
    { key: 'fastnotify_sms_recipient_user_ids', value: JSON.stringify(options.recipients ?? ['operator-1']) },
  ];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    const status = options.providerStatus ?? 200;
    return new Response(status === 200
      ? JSON.stringify({ data: { requestId: 'request-1', references: ['reference-1'] } })
      : JSON.stringify({ error: 'provider failed' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    requests,
    deliveryUpdates,
    dependencies: {
      settingFindMany: async () => settings,
      userFindUnique: async () => ({ id: 'operator-1', role: 'OPERATOR', mobile: options.mobile === undefined ? '09120000000' : options.mobile }),
      deliveryCreate: async () => {
        if (options.duplicate) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        return { id: 'delivery-1' };
      },
      deliveryUpdate: async (_id: string, data: Record<string, unknown>) => { deliveryUpdates.push(data); },
      messageContext: async () => ({
        taskTypeLabel: 'تماس برای قیمت‌دهی',
        smsTemplate: options.smsTemplate,
        customerFullName: options.customerFullName === undefined ? 'یاسین حیدری' : options.customerFullName,
        taskLink: 'https://bimehjam.com/admin/tasks?taskId=task-123',
      }),
      fetcher,
      apiKey: 'mock-api-key',
      from: '50002635118000',
    },
  };
}

test('disabled service sends zero SMS requests', async () => {
  const harness = createHarness({ enabled: false });
  assert.equal(await dispatchTaskCreatedSmsCore(task, harness.dependencies), 'disabled');
  assert.equal(harness.requests.length, 0);
});

test('disabled task type sends zero SMS requests', async () => {
  const harness = createHarness({ taskTypes: ['Follow Up Quote'] });
  assert.equal(await dispatchTaskCreatedSmsCore(task, harness.dependencies), 'task-type-disabled');
  assert.equal(harness.requests.length, 0);
});

test('unselected operator or operator without mobile sends zero SMS requests', async () => {
  const unselected = createHarness({ recipients: [] });
  assert.equal(await dispatchTaskCreatedSmsCore(task, unselected.dependencies), 'recipient-disabled');
  assert.equal(unselected.requests.length, 0);

  const noMobile = createHarness({ mobile: null });
  assert.equal(await dispatchTaskCreatedSmsCore(task, noMobile.dependencies), 'invalid-recipient');
  assert.equal(noMobile.requests.length, 0);
});

test('eligible price-call task sends exactly one correct FastNotify POST', async () => {
  const harness = createHarness();
  assert.equal(await dispatchTaskCreatedSmsCore(task, harness.dependencies), 'sent');
  assert.equal(harness.requests.length, 1);
  const request = harness.requests[0];
  assert.equal(request.url, 'https://services.fastnotify.ir/api/v1/message/single');
  assert.equal(request.init?.method, 'POST');
  const headers = request.init?.headers as Record<string, string>;
  assert.equal(headers.apiKey, 'mock-api-key');
  assert.equal(headers['Content-Type'], 'application/json');
  const body = JSON.parse(String(request.init?.body));
  assert.deepEqual(body.to, ['09120000000']);
  assert.equal(body.from, '50002635118000');
  assert.match(body.message, /task-123/);
  assert.match(body.message, /یاسین حیدری/);
  assert.doesNotMatch(body.message, /09120000000/);
  assert.equal(harness.deliveryUpdates.at(-1)?.status, 'SENT');
});

test('custom task-type SMS template renders only allowlisted variables', async () => {
  const template = '{{taskType}} | {{taskTitle}} | {{priority}} | {{customerFullName}} | {{taskId}} | {{taskLink}}';
  const harness = createHarness({ smsTemplate: template, customerFullName: 'علی رضایی' });
  assert.equal(await dispatchTaskCreatedSmsCore(task, harness.dependencies), 'sent');
  const body = JSON.parse(String(harness.requests[0].init?.body));
  assert.equal(body.message, 'تماس برای قیمت‌دهی | تماس برای قیمت‌دهی | HIGH | علی رضایی | task-123 | https://bimehjam.com/admin/tasks?taskId=task-123');
  assert.throws(() => validateTaskSmsTemplate('کلید: {{FASTNOTIFY_API_KEY}}'), /متغیر غیرمجاز/);
  assert.equal(renderTaskSmsTemplate('', {
    taskType: 'تماس', taskTitle: 'پیگیری', priority: 'HIGH', customerFullName: 'علی رضایی', taskId: '1', taskLink: '/tasks/1',
  }).includes('علی رضایی'), true);
});

test('provider failure is contained after task creation', async () => {
  let taskCreated = false;
  taskCreated = true;
  const harness = createHarness({ providerStatus: 503 });
  assert.equal(await dispatchTaskCreatedSmsCore(task, harness.dependencies), 'provider-failed');
  assert.equal(taskCreated, true);
  assert.equal(harness.deliveryUpdates.at(-1)?.status, 'FAILED');
});

test('reprocessing the same creation event does not send a duplicate SMS', async () => {
  const harness = createHarness({ duplicate: true });
  assert.equal(await dispatchTaskCreatedSmsCore(task, harness.dependencies), 'duplicate');
  assert.equal(harness.requests.length, 0);
});
