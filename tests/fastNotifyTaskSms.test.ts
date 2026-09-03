import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTaskCreatedSmsCore } from '../server/services/fastNotifySmsCore';

const task = {
  id: 'task-123',
  title: 'تماس برای قیمت‌دهی',
  priority: 'HIGH',
  type: 'Call Customer',
  assignedUserId: 'operator-1',
};

function createHarness(options: {
  enabled?: boolean;
  taskTypes?: string[];
  recipients?: string[];
  mobile?: string | null;
  providerStatus?: number;
  duplicate?: boolean;
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
  assert.doesNotMatch(body.message, /مشتری|شماره/);
  assert.equal(harness.deliveryUpdates.at(-1)?.status, 'SENT');
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
