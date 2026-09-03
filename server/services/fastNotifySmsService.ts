import prisma from '../db/client';
import { CreatedTaskForSms, dispatchTaskCreatedSmsCore, FASTNOTIFY_SETTING_KEYS, SmsDispatchResult } from './fastNotifySmsCore';

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
    fetcher: fetch,
    apiKey: process.env.FASTNOTIFY_API_KEY,
    from: process.env.FASTNOTIFY_FROM,
  });
}
