import prisma from '../db/client';
import { dispatchTaskCreatedSms, resolveOperationalAssignee } from './fastNotifySmsService';
import { assertActiveTaskType } from './taskTypeCatalogService';
import type { CreatedTaskForSms, SmsDispatchResult } from './fastNotifySmsCore';
import type { QuotationDeliveryChoice, QuotationSubmissionAnswer } from './quotationSubmissionFlow';

export const QUOTATION_CALL_SUCCESS = 'حتماً، درخواست تماس با کارشناس ثبت شد.';
export const QUOTATION_CHAT_SUCCESS = 'حتماً، کارشناس قیمت را بررسی می‌کند و همین‌جا در چت با شما در ارتباط خواهد بود.';
export const QUOTATION_COMPLETION_FAILURE = 'در تکمیل ثبت درخواست و اعلان به کارشناس مشکلی پیش آمد. فعلاً نمی‌توانم زمان تماس یا اعلام قیمت را تأیید کنم؛ اطلاعات شما محفوظ است.';
export const QUOTATION_OPERATOR_TASK_TYPE = 'Call Customer';

type CompletionTask = CreatedTaskForSms;
type CompletionLead = { id: string };
type Delivery = { status: string } | null;

export type QuotationCompletionInput = {
  conversationId: string;
  customerId: string;
  sessionId: string;
  productId: string;
  productName: string;
  productCategory?: string | null;
  route: QuotationDeliveryChoice;
  preferredAssignedUserId?: string | null;
  profile: { fullName?: string; mobile?: string; city?: string };
  answers: QuotationSubmissionAnswer[];
  successReply?: string;
};

export type QuotationCompletionDependencies = {
  resolveAssignee: (preferredUserId: string | null | undefined) => Promise<{ id: string; name: string } | null>;
  persistBusinessRecords: (input: QuotationCompletionInput, selected: { title: string; type: string }, assignee: { id: string; name: string } | null) => Promise<{ lead: CompletionLead; task: CompletionTask }>;
  dispatchSms: (task: CompletionTask) => Promise<SmsDispatchResult>;
  findDelivery: (eventKey: string) => Promise<Delivery>;
  logFailure?: (details: {
    conversationId: string;
    sessionId: string;
    deliveryMode: QuotationDeliveryChoice;
    errorType: string;
  }) => void;
};

function insuranceType(category: string | null | undefined, productName: string): string {
  const value = String(category || '') + ' ' + productName;
  if (/THIRD_PARTY|ثالث/i.test(value)) return 'THIRD_PARTY';
  if (/BODY|بدنه/i.test(value)) return 'BODY';
  if (/HEALTH|درمان/i.test(value)) return 'HEALTH';
  if (/FIRE|آتش/i.test(value)) return 'FIRE';
  if (/LIFE|عمر/i.test(value)) return 'LIFE';
  if (/LIABILITY|RESPONSIBILITY|مسئولیت/i.test(value)) return 'LIABILITY';
  return 'GENERAL';
}

export function quotationTaskDescription(input: Pick<QuotationCompletionInput, 'productName' | 'profile' | 'answers'>): string {
  const answerLines = [...input.answers]
    .sort((a, b) => a.order - b.order)
    .map((answer, index) => String(index + 1) + '. ' + (answer.fieldLabel || (answer as QuotationSubmissionAnswer & { question?: string }).question || 'پاسخ استعلام') + ': ' + answer.value);
  return [
    'محصول: ' + input.productName,
    'نام مشتری: ' + (input.profile.fullName || 'ثبت نشده'),
    'شماره تماس: ' + (input.profile.mobile || 'ثبت نشده'),
    'شهر: ' + (input.profile.city || 'ثبت نشده'),
    'پاسخ‌های استعلام:',
    ...answerLines,
  ].join('\n');
}

function taskDefinition(route: QuotationDeliveryChoice, productName: string) {
  return {
    title: route === 'CALL'
      ? 'تماس برای قیمت‌دهی - ' + productName
      : 'بررسی و اعلام قیمت در چت - ' + productName,
    type: QUOTATION_OPERATOR_TASK_TYPE,
  };
}

function taskTitles(productName: string) {
  return [
    taskDefinition('CALL', productName).title,
    taskDefinition('CHAT', productName).title,
    'بررسی و آماده‌سازی قیمت - ' + productName,
  ];
}

export async function finalizeQuotationCompletionCore(
  input: QuotationCompletionInput,
  deps: QuotationCompletionDependencies,
) {
  const selected = taskDefinition(input.route, input.productName);

  try {
    const assignee = await deps.resolveAssignee(input.preferredAssignedUserId);
    const { lead, task } = await deps.persistBusinessRecords(input, selected, assignee);
    const delivery = await deps.findDelivery('task-created:' + task.id);
    const smsResult: SmsDispatchResult = delivery ? 'duplicate' : await deps.dispatchSms(task);
    return {
      ok: true as const,
      taskId: task.id,
      leadId: lead.id,
      smsStatus: smsResult,
      replyText: input.successReply || (input.route === 'CALL' ? QUOTATION_CALL_SUCCESS : QUOTATION_CHAT_SUCCESS),
    };
  } catch (error) {
    deps.logFailure?.({
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      deliveryMode: input.route,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return { ok: false as const, error: 'TASK_OR_LEAD_FAILED', smsStatus: 'not-queued' };
  }
}

const productionDependencies: QuotationCompletionDependencies = {
  resolveAssignee: resolveOperationalAssignee,
  persistBusinessRecords: async (input, selected, assignee) => {
    await assertActiveTaskType(selected.type);
    return prisma.$transaction(async (tx) => {
      const notes = [
        'نحوه اعلام نتیجه: ' + (input.route === 'CALL' ? 'تماس کارشناس' : 'اعلام قیمت در همین چت'),
        quotationTaskDescription(input),
      ].join('\n');
      const leadData = {
        customerId: input.customerId, conversationId: input.conversationId,
        insuranceType: insuranceType(input.productCategory, input.productName),
        score: 95, status: 'QUALIFIED', intent: 'Insurance Quotation', notes,
      };
      const existingLead = await tx.lead.findFirst({ where: { conversationId: input.conversationId }, select: { id: true } });
      const lead = existingLead
        ? await tx.lead.update({ where: { id: existingLead.id }, data: leadData, select: { id: true } })
        : await tx.lead.create({ data: leadData, select: { id: true } });
      const existingTask = await tx.task.findFirst({
        where: { conversationId: input.conversationId, source: 'AI', title: { in: taskTitles(input.productName) } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, title: true, priority: true, type: true, customerId: true, assignedUserId: true },
      });
      const task = existingTask || await tx.task.create({
        data: {
          customerId: input.customerId, leadId: lead.id, conversationId: input.conversationId,
          assignedUser: assignee?.name || 'کارشناس فروش', assignedUserId: assignee?.id || null,
          title: selected.title, description: notes, type: selected.type, priority: 'HIGH',
          status: 'New', source: 'AI', dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        select: { id: true, title: true, priority: true, type: true, customerId: true, assignedUserId: true },
      });
      return { lead, task };
    });
  },
  dispatchSms: async (task) => dispatchTaskCreatedSms(task as never),
  findDelivery: (eventKey) => prisma.fastNotifySmsDelivery.findUnique({ where: { eventKey }, select: { status: true } }),
  logFailure: (details) => console.error('[quotation-completion] business record persistence failed', details),
};

const completionLocks = new Map<string, Promise<unknown>>();

export async function runQuotationCompletionOnce<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const running = completionLocks.get(key);
  if (running) return running as Promise<T>;
  const promise = operation().finally(() => completionLocks.delete(key));
  completionLocks.set(key, promise);
  return promise;
}

export async function finalizeQuotationCompletion(input: QuotationCompletionInput) {
  const key = `${input.conversationId}:${input.sessionId}`;
  return runQuotationCompletionOnce(key, () => finalizeQuotationCompletionCore(input, productionDependencies));
}



