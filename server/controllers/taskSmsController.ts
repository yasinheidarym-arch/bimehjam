import { Response } from 'express';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';
import { FASTNOTIFY_SETTING_KEYS, TASK_SMS_TYPES } from '../services/fastNotifySmsService';

function parseStringList(value: string | undefined): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export async function getTaskSmsSettings(_req: AuthRequest, res: Response) {
  try {
    const [settings, users] = await Promise.all([
      prisma.systemSetting.findMany({
        where: { key: { in: Object.values(FASTNOTIFY_SETTING_KEYS) } },
        select: { key: true, value: true },
      }),
      prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'OPERATOR'] } },
        select: { id: true, name: true, role: true, mobile: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const values = new Map(settings.map((setting) => [setting.key, setting.value]));
    return res.json({
      success: true,
      data: {
        enabled: values.get(FASTNOTIFY_SETTING_KEYS.enabled) === 'true',
        selectedTaskTypes: parseStringList(values.get(FASTNOTIFY_SETTING_KEYS.taskTypes)),
        selectedRecipientUserIds: parseStringList(values.get(FASTNOTIFY_SETTING_KEYS.recipientUserIds)),
        taskTypes: TASK_SMS_TYPES,
        users,
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'دریافت تنظیمات اعلان پیامکی ناموفق بود.' });
  }
}

export async function updateTaskSmsSettings(req: AuthRequest, res: Response) {
  try {
    const { enabled, selectedTaskTypes, selectedRecipientUserIds } = req.body || {};
    if (typeof enabled !== 'boolean' || !Array.isArray(selectedTaskTypes) || !Array.isArray(selectedRecipientUserIds)) {
      return res.status(400).json({ success: false, error: 'تنظیمات اعلان پیامکی نامعتبر است.' });
    }
    const allowedTypes = new Set(TASK_SMS_TYPES.map((item) => item.id as string));
    const taskTypes = [...new Set(selectedTaskTypes.filter((item): item is string => typeof item === 'string' && allowedTypes.has(item)))];
    const requestedUserIds = [...new Set(selectedRecipientUserIds.filter((item): item is string => typeof item === 'string'))];
    const eligibleUsers = await prisma.user.findMany({
      where: { id: { in: requestedUserIds }, role: { in: ['ADMIN', 'OPERATOR'] }, mobile: { not: null } },
      select: { id: true },
    });
    const recipientIds = eligibleUsers.map((user) => user.id);
    const entries = [
      [FASTNOTIFY_SETTING_KEYS.enabled, String(enabled), 'فعال‌بودن اعلان پیامکی وظایف'],
      [FASTNOTIFY_SETTING_KEYS.taskTypes, JSON.stringify(taskTypes), 'نوع وظایف مشمول اعلان پیامکی'],
      [FASTNOTIFY_SETTING_KEYS.recipientUserIds, JSON.stringify(recipientIds), 'کاربران مجاز دریافت اعلان پیامکی'],
    ] as const;
    await prisma.$transaction(entries.map(([key, value, description]) => prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, description },
      update: { value },
    })));
    return res.json({ success: true, data: { enabled, selectedTaskTypes: taskTypes, selectedRecipientUserIds: recipientIds } });
  } catch {
    return res.status(500).json({ success: false, error: 'ذخیره تنظیمات اعلان پیامکی ناموفق بود.' });
  }
}
