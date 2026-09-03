import { randomUUID } from 'node:crypto';
import prisma from '../db/client';

const SETTING_KEY = 'task_type_catalog';

export type TaskTypeDefinition = {
  id: string;
  label: string;
  active: boolean;
  builtin: boolean;
};

const INITIAL_TASK_TYPES: TaskTypeDefinition[] = [
  { id: 'Call Customer', label: 'تماس برای قیمت‌دهی', active: true, builtin: true },
  { id: 'Send Message', label: 'ارسال پیام', active: true, builtin: true },
  { id: 'Prepare Quotation', label: 'آماده‌سازی قیمت', active: true, builtin: true },
  { id: 'Collect Documents', label: 'دریافت مدارک', active: true, builtin: true },
  { id: 'Review Request', label: 'بررسی استعلام', active: true, builtin: true },
  { id: 'Follow Up Quote', label: 'پیگیری صدور', active: true, builtin: true },
  { id: 'Renewal Reminder', label: 'یادآوری تمدید', active: true, builtin: true },
  { id: 'Complaint Follow Up', label: 'پیگیری شکایت', active: true, builtin: true },
  { id: 'Other', label: 'سایر', active: true, builtin: true },
];

function parseCatalog(value?: string | null): TaskTypeDefinition[] {
  if (!value) return INITIAL_TASK_TYPES;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return INITIAL_TASK_TYPES;
    const valid = parsed.filter((item): item is TaskTypeDefinition => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.id === 'string' && typeof value.label === 'string' && typeof value.active === 'boolean' && typeof value.builtin === 'boolean';
    });
    return valid.length ? valid : INITIAL_TASK_TYPES;
  } catch {
    return INITIAL_TASK_TYPES;
  }
}

async function saveCatalog(catalog: TaskTypeDefinition[]) {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(catalog), description: 'فهرست پویا و وضعیت انواع وظیفه' },
    update: { value: JSON.stringify(catalog) },
  });
}

export async function getTaskTypeCatalog(options: { includeArchived?: boolean } = {}) {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } });
  const catalog = parseCatalog(setting?.value);
  return options.includeArchived ? catalog : catalog.filter((item) => item.active);
}

export async function addTaskType(labelInput: unknown) {
  const label = typeof labelInput === 'string' ? labelInput.trim().replace(/\s+/g, ' ') : '';
  if (label.length < 2 || label.length > 80) throw new Error('عنوان نوع وظیفه باید بین ۲ تا ۸۰ کاراکتر باشد.');
  const catalog = await getTaskTypeCatalog({ includeArchived: true });
  if (catalog.some((item) => item.label.localeCompare(label, 'fa', { sensitivity: 'base' }) === 0)) {
    throw new Error('این نوع وظیفه قبلاً ثبت شده است.');
  }
  const created: TaskTypeDefinition = { id: `CUSTOM_${randomUUID()}`, label, active: true, builtin: false };
  await saveCatalog([...catalog, created]);
  return created;
}

export async function removeOrArchiveTaskType(id: string) {
  const catalog = await getTaskTypeCatalog({ includeArchived: true });
  const target = catalog.find((item) => item.id === id);
  if (!target) throw new Error('نوع وظیفه یافت نشد.');
  const [taskUsage, automationRules] = await Promise.all([
    prisma.task.count({ where: { type: id } }),
    prisma.automationRule.findMany({ select: { action: true, actionPayload: true } }),
  ]);
  const automationUsage = automationRules.some((rule) => {
    if (rule.action !== 'CREATE_TASK') return false;
    try { return JSON.parse(rule.actionPayload || '{}')?.taskType === id; } catch { return false; }
  });
  const archive = target.builtin || taskUsage > 0 || automationUsage;
  const next = archive
    ? catalog.map((item) => item.id === id ? { ...item, active: false } : item)
    : catalog.filter((item) => item.id !== id);
  await saveCatalog(next);
  return { mode: archive ? 'archived' as const : 'deleted' as const, item: { ...target, active: false } };
}

export async function assertActiveTaskType(id: unknown) {
  const normalized = typeof id === 'string' && id ? id : 'Call Customer';
  const active = await getTaskTypeCatalog();
  if (!active.some((item) => item.id === normalized)) throw new Error('نوع وظیفه انتخاب‌شده فعال نیست.');
  return normalized;
}
