import prisma from '../db/client';
import { CreatedTaskForSms, dispatchTaskCreatedSmsCore, FASTNOTIFY_SETTING_KEYS, normalizeIranianMobile, SmsDispatchResult } from './fastNotifySmsCore';
import { getTaskTypeCatalog } from './taskTypeCatalogService';

export { FASTNOTIFY_SETTING_KEYS, normalizeIranianMobile } from './fastNotifySmsCore';

function parseMetadata(value?: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function normalizeShortId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim()
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  return /^\d{1,8}$/.test(normalized) ? normalized : null;
}

/** Use a real short display identifier only; never shorten or expose Goftino hashes. */
export function resolveGoftinoDisplayId(input: { metadata?: string | null; goftinoUserId?: string | null; goftinoChatId?: string | null }): string | null {
  const metadata = parseMetadata(input.metadata);
  const candidates = [
    ...Object.entries(metadata)
      .filter(([key]) => /display.?id|short.?id|user.?number|display.?number|goftino.?number/i.test(key))
      .map(([, value]) => value),
    input.goftinoUserId,
    input.goftinoChatId,
  ];
  return candidates.map(normalizeShortId).find(Boolean) || null;
}

export async function dispatchTaskCreatedSms(task: CreatedTaskForSms): Promise<SmsDispatchResult> {
  return dispatchTaskCreatedSmsCore(task, {
    settingFindMany: () => prisma.systemSetting.findMany({
      where: { key: { in: Object.values(FASTNOTIFY_SETTING_KEYS) } },
      select: { key: true, value: true },
    }),
    userFindUnique: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, role: true, mobile: true } }),
    deliveryCreate: (data) => prisma.fastNotifySmsDelivery.create({ data: data as never, select: { id: true } }),
    deliveryUpdate: async (id, data) => { await prisma.fastNotifySmsDelivery.update({ where: { id }, data: data as never }); },
    messageContext: async (createdTask) => {
      const [catalog, customer, conversation] = await Promise.all([
        getTaskTypeCatalog({ includeArchived: true }),
        createdTask.customerId
          ? prisma.customer.findUnique({
              where: { id: createdTask.customerId },
              select: { name: true, phone: true, goftinoUserId: true, goftinoChatId: true, metadata: true },
            })
          : Promise.resolve(null),
        createdTask.conversationId
          ? prisma.conversation.findUnique({
              where: { id: createdTask.conversationId },
              select: { currentProductId: true, currentProductName: true },
            })
          : Promise.resolve(null),
      ]);
      const product = conversation?.currentProductId
        ? await prisma.insuranceProduct.findUnique({ where: { id: conversation.currentProductId }, select: { name: true } })
        : null;
      const displayId = resolveGoftinoDisplayId({ metadata: customer?.metadata, goftinoUserId: customer?.goftinoUserId, goftinoChatId: customer?.goftinoChatId });
      const type = catalog.find((item) => item.id === createdTask.type);
      return {
        taskTypeLabel: type?.label || createdTask.type,
        smsTemplate: type?.smsTemplate,
        customerFullName: customer?.name,
        customerMobile: customer?.phone,
        customerPhone: customer?.phone,
        // Legacy field is kept display-safe for old templates.
        goftinoUserId: displayId,
        goftinoDisplayId: displayId,
        confirmedProductName: product?.name,
        insuranceName: product?.name || 'ثبت نشده',
        taskLink: `https://bimehjam.com/admin/tasks?taskId=${encodeURIComponent(createdTask.id)}`,
      };
    },
    fetcher: fetch,
    apiKey: process.env.FASTNOTIFY_API_KEY,
    from: process.env.FASTNOTIFY_FROM,
  });
}
function settingList(value?: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function resolveFastNotifyAssignee(preferredUserId: string | null | undefined, taskType: string) {
  const settings = new Map((await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(FASTNOTIFY_SETTING_KEYS) } },
    select: { key: true, value: true },
  })).map(item => [item.key, item.value]));
  if (settings.get(FASTNOTIFY_SETTING_KEYS.enabled) !== 'true') return null;
  if (!settingList(settings.get(FASTNOTIFY_SETTING_KEYS.taskTypes)).includes(taskType)) return null;

  const selected = settingList(settings.get(FASTNOTIFY_SETTING_KEYS.recipientUserIds));
  const ordered = preferredUserId && selected.includes(preferredUserId)
    ? [preferredUserId, ...selected.filter(id => id !== preferredUserId)]
    : selected;
  if (!ordered.length) return null;
  const users = await prisma.user.findMany({
    where: { id: { in: ordered }, role: { in: ['ADMIN', 'OPERATOR'] } },
    select: { id: true, name: true, role: true, mobile: true },
  });
  const byId = new Map(users.map(user => [user.id, user]));
  return ordered.map(id => byId.get(id)).find(user => user && normalizeIranianMobile(user.mobile)) || null;
}

/** Assignment is a business decision and must not depend on SMS enablement or
 * on whether a task type is selected for FastNotify. */
export async function resolveOperationalAssignee(preferredUserId: string | null | undefined) {
  const configured = new Map((await prisma.systemSetting.findMany({
    where: { key: { in: [FASTNOTIFY_SETTING_KEYS.recipientUserIds] } },
    select: { key: true, value: true },
  })).map(item => [item.key, item.value]));
  const selected = settingList(configured.get(FASTNOTIFY_SETTING_KEYS.recipientUserIds));
  const ordered = preferredUserId
    ? [preferredUserId, ...selected.filter(id => id !== preferredUserId)]
    : selected;
  if (!ordered.length) return null;
  const users = await prisma.user.findMany({
    where: { id: { in: ordered }, role: { in: ['ADMIN', 'OPERATOR'] } },
    select: { id: true, name: true, role: true, mobile: true },
  });
  const byId = new Map(users.map(user => [user.id, user]));
  return ordered.map(id => byId.get(id)).find(Boolean) || null;
}
