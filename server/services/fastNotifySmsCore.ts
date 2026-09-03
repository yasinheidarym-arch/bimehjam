import { DEFAULT_TASK_SMS_TEMPLATE, renderTaskSmsTemplate } from './taskSmsTemplate';

const FASTNOTIFY_ENDPOINT = 'https://services.fastnotify.ir/api/v1/message/single';
export const FASTNOTIFY_SETTING_KEYS = { enabled: 'fastnotify_sms_enabled', taskTypes: 'fastnotify_sms_task_types', recipientUserIds: 'fastnotify_sms_recipient_user_ids' } as const;

export function normalizeIranianMobile(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s()-]/g, '');
  const local = digits.startsWith('+98') ? `0${digits.slice(3)}` : digits.startsWith('0098') ? `0${digits.slice(4)}` : digits;
  return /^09\d{9}$/.test(local) ? local : null;
}

function list(value?: string): string[] {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []; } catch { return []; }
}

export type CreatedTaskForSms = { id: string; title: string; priority: string; type: string; customerId?: string | null; assignedUserId?: string | null };
export type TaskSmsMessageContext = { taskTypeLabel: string; smsTemplate?: string | null; customerFullName?: string | null; taskLink: string };
export type SmsDependencies = {
  settingFindMany: () => Promise<Array<{ key: string; value: string }>>;
  userFindUnique: (id: string) => Promise<{ id: string; role: string; mobile: string | null } | null>;
  deliveryCreate: (data: Record<string, unknown>) => Promise<{ id: string }>;
  deliveryUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  messageContext: (task: CreatedTaskForSms) => Promise<TaskSmsMessageContext>;
  fetcher: typeof fetch; apiKey?: string; from?: string;
};
export type SmsDispatchResult = 'sent' | 'disabled' | 'task-type-disabled' | 'unassigned' | 'recipient-disabled' | 'invalid-recipient' | 'configuration-missing' | 'duplicate' | 'provider-failed';

export async function dispatchTaskCreatedSmsCore(task: CreatedTaskForSms, deps: SmsDependencies): Promise<SmsDispatchResult> {
  try {
    const settings = new Map((await deps.settingFindMany()).map(item => [item.key, item.value]));
    if (settings.get(FASTNOTIFY_SETTING_KEYS.enabled) !== 'true') return 'disabled';
    if (!list(settings.get(FASTNOTIFY_SETTING_KEYS.taskTypes)).includes(task.type)) return 'task-type-disabled';
    if (!task.assignedUserId) return 'unassigned';
    if (!list(settings.get(FASTNOTIFY_SETTING_KEYS.recipientUserIds)).includes(task.assignedUserId)) return 'recipient-disabled';
    const user = await deps.userFindUnique(task.assignedUserId);
    const mobile = normalizeIranianMobile(user?.mobile);
    if (!user || !['ADMIN', 'OPERATOR'].includes(user.role) || !mobile) return 'invalid-recipient';
    let delivery: { id: string };
    try {
      delivery = await deps.deliveryCreate({ eventKey: `task-created:${task.id}`, taskId: task.id, recipientUserId: user.id, status: 'PENDING' });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return 'duplicate';
      throw error;
    }
    if (!deps.apiKey || !deps.from || !/^\d{5,20}$/.test(deps.from)) {
      await deps.deliveryUpdate(delivery.id, { status: 'FAILED', attemptCount: 1, lastErrorCode: 'CONFIGURATION_MISSING' });
      return 'configuration-missing';
    }
    const context = await deps.messageContext(task);
    const message = renderTaskSmsTemplate(context.smsTemplate || DEFAULT_TASK_SMS_TEMPLATE, {
      taskType: context.taskTypeLabel,
      taskTitle: task.title,
      priority: task.priority,
      customerFullName: context.customerFullName?.trim() || 'ثبت نشده',
      taskId: task.id,
      taskLink: context.taskLink,
    });
    const response = await deps.fetcher(FASTNOTIFY_ENDPOINT, {
      method: 'POST', headers: { apiKey: deps.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: deps.from, to: [mobile], message }),
      signal: AbortSignal.timeout(5000),
    });
    const body = response.ok ? await response.json() as { data?: { requestId?: unknown; references?: unknown } } : null;
    if (!response.ok || !body?.data?.requestId || !body.data.references) {
      await deps.deliveryUpdate(delivery.id, { status: 'FAILED', attemptCount: 1, lastErrorCode: `HTTP_${response.status}` });
      return 'provider-failed';
    }
    await deps.deliveryUpdate(delivery.id, { status: 'SENT', attemptCount: 1, providerRequestId: String(body.data.requestId), providerReferences: JSON.stringify(body.data.references), sentAt: new Date(), lastErrorCode: null });
    return 'sent';
  } catch { return 'provider-failed'; }
}
