import assert from 'node:assert/strict';
import test from 'node:test';
import {
  finalizeQuotationCompletionCore,
  QUOTATION_CALL_SUCCESS,
  QUOTATION_CHAT_SUCCESS,
  quotationTaskDescription,
  runQuotationCompletionOnce,
  type QuotationCompletionDependencies,
  type QuotationCompletionInput,
} from '../server/services/quotationCompletionService';
import { handleTerminalQuotationSubmission, type QuotationSubmissionState } from '../server/services/quotationSubmissionFlow';
import { resolveQuotationOptionSelection } from '../server/services/quotationOptionMatchingService';
import { numberedQuestionOrder, uniqueQuestionOrder } from '../shared/quotationQuestionOrder';
import { buildConversationQuotationPresentation } from '../server/services/conversationQuotationPresentation';

const input: QuotationCompletionInput = {
  conversationId: 'conversation-1',
  customerId: 'customer-1',
  sessionId: 'session-1',
  productId: 'product-1',
  productName: 'بیمه مسئولیت مدیر ساختمان',
  productCategory: 'RESPONSIBILITY',
  route: 'CALL',
  profile: { fullName: 'کاربر آزمایشی', mobile: '09120000000', city: 'تهران' },
  answers: [
    { order: 1, fieldLabel: 'کاربری ساختمان', fieldName: 'type', value: 'مجتمع مسکونی' },
    { order: 2, fieldLabel: 'متراژ کل ساختمان', fieldName: 'majmuemetraj', value: '2500' },
    { order: 3, fieldLabel: 'تعداد آسانسور', fieldName: 'asansor', value: 'یک دستگاه' },
    { order: 4, fieldLabel: 'امکانات ایمنی و حفاظتی', fieldName: 'emkanat', value: 'دوربین مدار بسته' },
  ],
};

function harness(options: { deliveryStatus?: string | null; smsResult?: import('../server/services/fastNotifySmsCore').SmsDispatchResult; failTask?: boolean; noAssignee?: boolean } = {}) {
  const calls = { leads: 0, tasks: 0, sms: 0 };
  let taskData: Record<string, unknown> | null = null;
  const task = {
    id: 'task-1', title: 'تماس برای قیمت‌دهی - بیمه مسئولیت مدیر ساختمان',
    type: 'Call Customer', priority: 'HIGH', customerId: 'customer-1', assignedUserId: 'operator-1',
  };
  const deps: QuotationCompletionDependencies = {
    resolveAssignee: async () => options.noAssignee ? null : ({ id: 'operator-1', name: 'اپراتور آزمایشی' }),
    persistBusinessRecords: async (_input, selected, assignee) => {
      if (options.failTask) throw new Error('task failed');
      calls.leads++;
      calls.tasks++;
      taskData = { ...selected, assignedUserId: assignee?.id || null };
      return { lead: { id: 'lead-1' }, task: { ...task, ...selected, assignedUserId: assignee?.id || null } };
    },
    dispatchSms: async () => { calls.sms++; return options.smsResult || 'sent'; },
    findDelivery: async () => options.deliveryStatus ? { status: options.deliveryStatus } : null,
  };
  return { calls, deps, get taskData() { return taskData; } };
}

test('call route promises only after Lead and Task persist', async () => {
  const h = harness();
  const result = await finalizeQuotationCompletionCore(input, h.deps);
  assert.equal(result.ok, true);
  assert.equal(result.replyText, QUOTATION_CALL_SUCCESS);
  assert.equal(h.calls.leads, 1);
  assert.equal(h.calls.tasks, 1);
});

test('chat route creates the quotation-review task and returns chat-specific text', async () => {
  const h = harness();
  const result = await finalizeQuotationCompletionCore({ ...input, route: 'CHAT' }, h.deps);
  assert.equal(result.ok, true);
  assert.equal(result.replyText, QUOTATION_CHAT_SUCCESS);
  assert.match(String(h.taskData?.title), /بررسی و آماده‌سازی قیمت/);
  assert.equal(h.taskData?.type, 'Prepare Quotation');
});

test('task failure never returns a promise and does not loop into another creation', async () => {
  const h = harness({ failTask: true });
  const result = await finalizeQuotationCompletionCore(input, h.deps);
  assert.equal(result.ok, false);
  assert.equal(h.calls.tasks, 0);
  assert.equal('replyText' in result, false);
});

test('SMS queue/provider failure does not roll back Lead or Task', async () => {
  const h = harness({ smsResult: 'provider-failed' });
  const result = await finalizeQuotationCompletionCore(input, h.deps);
  assert.equal(result.ok, true);
  assert.equal(result.smsStatus, 'provider-failed');
  assert.equal(h.calls.tasks, 1);
  assert.equal(result.replyText, QUOTATION_CALL_SUCCESS);
});
test('existing outbox delivery suppresses duplicate SMS dispatch', async () => {
  const h = harness({ deliveryStatus: 'SENT' });
  const first = await finalizeQuotationCompletionCore(input, h.deps);
  const repeated = await finalizeQuotationCompletionCore(input, h.deps);
  assert.equal(first.ok, true);
  assert.equal(repeated.ok, true);
  assert.equal(h.calls.tasks, 2);
  assert.equal(h.calls.sms, 0);
});

test('missing SMS recipient still preserves Lead and Task', async () => {
  const h = harness({ noAssignee: true, smsResult: 'skipped-no-recipient' });
  const result = await finalizeQuotationCompletionCore(input, h.deps);
  assert.equal(result.ok, true);
  assert.equal(result.smsStatus, 'skipped-no-recipient');
  assert.equal(h.calls.leads, 1);
  assert.equal(h.calls.tasks, 1);
});

const failedSubmission: QuotationSubmissionState = {
  pending: false, status: 'FAILED', step: 'DELIVERY_CHOICE', sessionId: 'session-1',
  productId: 'product-1', productName: 'محصول آزمایشی', answers: [], profile: {},
  choicePrompt: 'تماس یا چت؟', deliveryChoice: 'CHAT', idempotencyKey: 'quotation-completion:conversation-1:session-1',
  failureReason: 'TASK_OR_LEAD_FAILED',
};

test('FAILED explanation preserves the same submission and does not release a new session', () => {
  const result = handleTerminalQuotationSubmission(failedSubmission, 'ASK_FAILURE_REASON');
  assert.equal(result.action, 'REPLY');
  assert.equal(result.state.sessionId, failedSubmission.sessionId);
  assert.equal(result.state.idempotencyKey, failedSubmission.idempotencyKey);
});

test('FAILED retry uses the same session, route and idempotency key', () => {
  const result = handleTerminalQuotationSubmission(failedSubmission, 'RETRY_SUBMISSION');
  assert.equal(result.action, 'RETRY');
  if (result.action !== 'RETRY') return;
  assert.equal(result.route, 'CHAT');
  assert.equal(result.state.sessionId, failedSubmission.sessionId);
  assert.equal(result.state.idempotencyKey, failedSubmission.idempotencyKey);
});

test('a new quotation is released only for explicit semantic START_NEW_QUOTATION', () => {
  assert.equal(handleTerminalQuotationSubmission(failedSubmission, 'OTHER').action, 'REPLY');
  assert.equal(handleTerminalQuotationSubmission(failedSubmission, 'START_NEW_QUOTATION').action, 'RELEASE');
});

test('concurrent retries share one completion operation', async () => {
  let operations = 0;
  const operation = () => runQuotationCompletionOnce('conversation-1:session-1', async () => {
    operations += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    return 'done';
  });
  const results = await Promise.all([operation(), operation(), operation()]);
  assert.deepEqual(results, ['done', 'done', 'done']);
  assert.equal(operations, 1);
});

test('operator task description uses Persian labels and never raw field names or JSON', () => {
  const description = quotationTaskDescription(input);
  assert.match(description, /محصول: بیمه مسئولیت مدیر ساختمان/);
  assert.match(description, /نام مشتری: کاربر آزمایشی/);
  assert.match(description, /شماره تماس: 09120000000/);
  assert.match(description, /شهر: تهران/);
  for (const label of ['کاربری ساختمان', 'متراژ کل ساختمان', 'تعداد آسانسور', 'امکانات ایمنی و حفاظتی']) {
    assert.match(description, new RegExp(label));
  }
  assert.doesNotMatch(description, /majmuemetraj|asansor|emkanat|\{|\}/);
});

test('classifier and validator share canonical option ids and values', async () => {
  const elevator = {
    title: 'تعداد آسانسور', fieldName: 'asansor', type: 'select', required: true, order: 1,
    options: ['ساختمان آسانسور ندارد', 'یکدستگاه', 'دو دستگاه'],
  };
  for (const answer of ['۱', '1', 'یک دستگاه']) {
    const selection = await resolveQuotationOptionSelection({ question: elevator, message: answer });
    assert.equal(selection.status, 'MATCHED', answer);
    assert.equal(selection.selectedOptionId, 'option-2', answer);
    assert.equal(selection.selectedOptionValue, 'یکدستگاه', answer);
  }

  const age = {
    title: 'سن ساختمان', fieldName: 'omre_bana', type: 'select', required: true, order: 1,
    options: ['تا یک سال از شروع بیمه نامه', 'تا دو سال از شروع بیمه نامه', 'تا سه سال از شروع بیمه نامه'],
  };
  for (const answer of ['دو سال', 'تا دو سال']) {
    const selection = await resolveQuotationOptionSelection({ question: age, message: answer });
    assert.equal(selection.status, 'MATCHED', answer);
    assert.equal(selection.selectedOptionId, 'option-2', answer);
  }
});

test('panel reorder, insertion and movement always produce unique consecutive orders', () => {
  assert.deepEqual(
    numberedQuestionOrder(uniqueQuestionOrder(['q1', 'q2', 'q3'], { movedQuestion: { id: 'q3', requestedOrder: 2 } })),
    [{ id: 'q1', order: 1 }, { id: 'q3', order: 2 }, { id: 'q2', order: 3 }],
  );
  assert.deepEqual(
    numberedQuestionOrder(uniqueQuestionOrder(['q1', 'q2', 'q3'], { preferredIds: ['q3', 'q1', 'q3', 'q2'] })),
    [{ id: 'q3', order: 1 }, { id: 'q1', order: 2 }, { id: 'q2', order: 3 }],
  );
});

test('conversation panel exposes Persian question labels and separates structured technical metadata', () => {
  const presentation = buildConversationQuotationPresentation({
    majmuemetraj: '2500', tabaghat: '11', tedad_vahed: '22',
    purchaseLinkState: { status: 'DONE' },
    quotationTurnState: { currentQuestion: null },
    quotationSubmission: { status: 'SUBMITTED' },
    quotationAnswerValidation: null,
    quotationTechnical: { validation: { status: 'SAVED', fieldName: 'tedad_vahed', fieldLabel: 'تعداد واحدها', canonicalValue: '22', reason: 'valid' } },
  }, [
    { fieldName: 'majmuemetraj', title: 'متراژ کل ساختمان', order: 1 },
    { fieldName: 'tabaghat', title: 'تعداد طبقات', order: 2 },
    { fieldName: 'tedad_vahed', title: 'تعداد واحدها', order: 3 },
  ]);
  assert.deepEqual(presentation.fields.map(field => field.label), ['متراژ کل ساختمان', 'تعداد طبقات', 'تعداد واحدها']);
  assert.equal(JSON.stringify(presentation.fields).includes('majmuemetraj'), true); // transport identity is retained but never rendered
  assert.equal(presentation.fields.some(field => field.value === '[object Object]'), false);
  assert.equal('quotationAnswerValidation' in presentation.technical, false);
  assert.deepEqual((presentation.technical.quotationTechnical as any).validation, {
    status: 'SAVED', fieldName: 'tedad_vahed', fieldLabel: 'تعداد واحدها', canonicalValue: '22', reason: 'valid',
  });
});


