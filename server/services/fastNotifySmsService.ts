import prisma from '../db/client';
import { CreatedTaskForSms, dispatchTaskCreatedSmsCore, FASTNOTIFY_SETTING_KEYS, normalizeIranianMobile, SmsDispatchResult } from './fastNotifySmsCore';
import { getTaskTypeCatalog } from './taskTypeCatalogService';

export { FASTNOTIFY_SETTING_KEYS, normalizeIranianMobile } from './fastNotifySmsCore';

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
      const [catalog, customer] = await Promise.all([
        getTaskTypeCatalog({ includeArchived: true }),
        createdTask.customerId
          ? prisma.customer.findUnique({ where: { id: createdTask.customerId }, select: { name: true } })
          : Promise.resolve(null),
      ]);
      const type = catalog.find((item) => item.id === createdTask.type);
      return {
        taskTypeLabel: type?.label || createdTask.type,
        smsTemplate: type?.smsTemplate,
        customerFullName: customer?.name,
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
