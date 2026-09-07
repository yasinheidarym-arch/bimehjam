import prisma from '../db/client';
import { createSystemTaskWithOutcome } from './taskService';
import { dispatchTaskCreatedSms, resolveFastNotifyAssignee } from './fastNotifySmsService';
import type { CreatedTaskForSms, SmsDispatchResult } from './fastNotifySmsCore';
import type { QuotationDeliveryChoice, QuotationSubmissionAnswer } from './quotationSubmissionFlow';

export const QUOTATION_CALL_SUCCESS = 'اوکی، کارشناس حداکثر تا ۵ دقیقهٔ دیگر با شما تماس می‌گیرد.';
export const QUOTATION_CHAT_SUCCESS = 'اوکی، کارشناس قیمت را بررسی می‌کند و به‌محض آماده‌شدن همین‌جا به شما اعلام می‌کنیم.';
export const QUOTATION_COMPLETION_FAILURE = 'در تکمیل ثبت درخواست و اعلان به کارشناس مشکلی پیش آمد. فعلاً نمی‌توانم زمان تماس یا اعلام قیمت را تأیید کنم؛ اطلاعات شما محفوظ است.';

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
};

export type QuotationCompletionDependencies = {
  resolveAssignee: (preferredUserId: string | null | undefined, taskType: string) => Promise<{ id: string; name: string } | null>;
  findLead: (conversationId: string) => Promise<CompletionLead | null>;
  createLead: (data: Record<string, unknown>) => Promise<CompletionLead>;
  updateLead: (id: string, data: Record<string, unknown>) => Promise<CompletionLead>;
  findTask: (conversationId: string, titles: string[]) => Promise<CompletionTask | null>;
  createTask: (data: Record<string, unknown>) => Promise<{ task: CompletionTask; smsResult: SmsDispatchResult }>;
  dispatchSms: (task: CompletionTask) => Promise<SmsDispatchResult>;
  findDelivery: (eventKey: string) => Promise<Delivery>;
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
  return route === 'CALL'
    ? { title: 'تماس برای قیمت‌دهی - ' + productName, type: 'Call Customer' }
    : { title: 'بررسی و آماده‌سازی قیمت - ' + productName, type: 'Prepare Quotation' };
}

export async function finalizeQuotationCompletionCore(
  input: QuotationCompletionInput,
  deps: QuotationCompletionDependencies,
) {
  const selected = taskDefinition(input.route, input.productName);
  const allTitles = [
    taskDefinition('CALL', input.productName).title,
    taskDefinition('CHAT', input.productName).title,
  ];
  const assignee = await deps.resolveAssignee(input.preferredAssignedUserId, selected.type);
  if (!assignee) return { ok: false as const, error: 'SMS_ASSIGNEE_UNAVAILABLE', smsStatus: 'unassigned' };

  try {
    let lead = await deps.findLead(input.conversationId);
    const leadData = {
      customerId: input.customerId,
      conversationId: input.conversationId,
      insuranceType: insuranceType(input.productCategory, input.productName),
      score: 95,
      status: 'QUALIFIED',
      intent: 'Insurance Quotation',
      notes: quotationTaskDescription(input),
    };
    lead = lead ? await deps.updateLead(lead.id, leadData) : await deps.createLead(leadData);

    let task = await deps.findTask(input.conversationId, allTitles);
    let smsResult: SmsDispatchResult;
    if (task) {
      const delivery = await deps.findDelivery('task-created:' + task.id);
      if (delivery?.status === 'SENT') smsResult = 'duplicate';
      else if (delivery) smsResult = 'provider-failed';
      else smsResult = await deps.dispatchSms(task);
    } else {
      const created = await deps.createTask({
        customerId: input.customerId,
        leadId: lead.id,
        conversationId: input.conversationId,
        assignedUser: assignee.name,
        assignedUserId: assignee.id,
        title: selected.title,
        description: quotationTaskDescription(input),
        type: selected.type,
        priority: 'HIGH',
      });
      task = created.task;
      smsResult = created.smsResult;
    }

    const smsSucceeded = smsResult === 'sent' || smsResult === 'duplicate';
    if (!smsSucceeded) {
      return { ok: false as const, error: 'SMS_QUEUE_FAILED', taskId: task.id, leadId: lead.id, smsStatus: smsResult };
    }
    return {
      ok: true as const,
      taskId: task.id,
      leadId: lead.id,
      smsStatus: smsResult,
      replyText: input.route === 'CALL' ? QUOTATION_CALL_SUCCESS : QUOTATION_CHAT_SUCCESS,
    };
  } catch {
    return { ok: false as const, error: 'TASK_OR_LEAD_FAILED', smsStatus: 'not-queued' };
  }
}

const productionDependencies: QuotationCompletionDependencies = {
  resolveAssignee: async (preferred, taskType) => resolveFastNotifyAssignee(preferred, taskType),
  findLead: (conversationId) => prisma.lead.findFirst({ where: { conversationId }, select: { id: true } }),
  createLead: (data) => prisma.lead.create({ data: data as never, select: { id: true } }),
  updateLead: (id, data) => prisma.lead.update({ where: { id }, data: data as never, select: { id: true } }),
  findTask: (conversationId, titles) => prisma.task.findFirst({
    where: { conversationId, source: 'AI', title: { in: titles } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, priority: true, type: true, customerId: true, assignedUserId: true },
  }),
  createTask: async (data) => createSystemTaskWithOutcome(data as never),
  dispatchSms: async (task) => dispatchTaskCreatedSms(task as never),
  findDelivery: (eventKey) => prisma.fastNotifySmsDelivery.findUnique({ where: { eventKey }, select: { status: true } }),
};

export async function finalizeQuotationCompletion(input: QuotationCompletionInput) {
  return finalizeQuotationCompletionCore(input, productionDependencies);
}



