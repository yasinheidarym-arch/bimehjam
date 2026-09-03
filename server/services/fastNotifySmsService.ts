import prisma from '../db/client';
import { CreatedTaskForSms, dispatchTaskCreatedSmsCore, FASTNOTIFY_SETTING_KEYS, SmsDispatchResult } from './fastNotifySmsCore';
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
