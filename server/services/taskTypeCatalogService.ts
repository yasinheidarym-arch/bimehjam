import { randomUUID } from 'node:crypto';
import prisma from '../db/client';
import { DEFAULT_TASK_SMS_TEMPLATE, validateTaskSmsTemplate } from './taskSmsTemplate';
import { taskTypeRemovalMode } from '../../shared/taskTypeLifecycle';

const SETTING_KEY = 'task_type_catalog';

export type TaskTypeDefinition = {
  id: string;
  label: string;
  active: boolean;
  builtin: boolean;
  smsTemplate: string;
};

export type ManagedTaskTypeDefinition = TaskTypeDefinition & {
  usageCount: number;
  automationUsage: boolean;
  canDelete: boolean;
};

const INITIAL_TASK_TYPES: TaskTypeDefinition[] = [
  { id: 'Call Customer', label: 'تماس برای قیمت‌دهی', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Send Message', label: 'ارسال پیام', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Prepare Quotation', label: 'آماده‌سازی قیمت', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Collect Documents', label: 'دریافت مدارک', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Review Request', label: 'بررسی استعلام', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Follow Up Quote', label: 'پیگیری صدور', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Renewal Reminder', label: 'یادآوری تمدید', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Complaint Follow Up', label: 'پیگیری شکایت', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
  { id: 'Other', label: 'سایر', active: true, builtin: true, smsTemplate: DEFAULT_TASK_SMS_TEMPLATE },
];

function parseCatalog(value?: string | null): TaskTypeDefinition[] {
  if (!value) return INITIAL_TASK_TYPES;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return INITIAL_TASK_TYPES;
    const valid = parsed.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.id === 'string' && typeof value.label === 'string' && typeof value.active === 'boolean' && typeof value.builtin === 'boolean';
    });
    return valid.length ? valid.map((item) => ({
      ...item,
      smsTemplate: typeof (item as Record<string, unknown>).smsTemplate === 'string'
        ? validateTaskSmsTemplate((item as Record<string, unknown>).smsTemplate)
        : DEFAULT_TASK_SMS_TEMPLATE,
    })) as TaskTypeDefinition[] : INITIAL_TASK_TYPES;
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

async function taskTypeDependencies() {
  const [taskGroups, automationRules] = await Promise.all([
    prisma.task.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.automationRule.findMany({ select: { action: true, actionPayload: true } }),
  ]);
  const usageCounts = new Map(taskGroups.map((group) => [group.type, group._count._all]));
  const automationTypeIds = new Set<string>();
  for (const rule of automationRules) {
    if (rule.action !== 'CREATE_TASK') continue;
    try {
      const taskType = JSON.parse(rule.actionPayload || '{}')?.taskType;
      if (typeof taskType === 'string') automationTypeIds.add(taskType);
    } catch { /* Invalid legacy automation payloads are ignored here. */ }
  }
  return { usageCounts, automationTypeIds };
}

export async function getManagedTaskTypeCatalog(): Promise<ManagedTaskTypeDefinition[]> {
  const [catalog, dependencies] = await Promise.all([
    getTaskTypeCatalog({ includeArchived: true }),
    taskTypeDependencies(),
  ]);
  return catalog.map((item) => {
    const usageCount = dependencies.usageCounts.get(item.id) || 0;
    const automationUsage = dependencies.automationTypeIds.has(item.id);
    return { ...item, usageCount, automationUsage, canDelete: taskTypeRemovalMode({ builtin: item.builtin, usageCount, automationUsage }) === 'deleted' };
  });
}

export async function addTaskType(labelInput: unknown, smsTemplateInput: unknown = DEFAULT_TASK_SMS_TEMPLATE) {
  const label = typeof labelInput === 'string' ? labelInput.trim().replace(/\s+/g, ' ') : '';
  if (label.length < 2 || label.length > 80) throw new Error('عنوان نوع وظیفه باید بین ۲ تا ۸۰ کاراکتر باشد.');
  const catalog = await getTaskTypeCatalog({ includeArchived: true });
  if (catalog.some((item) => item.label.localeCompare(label, 'fa', { sensitivity: 'base' }) === 0)) {
    throw new Error('این نوع وظیفه قبلاً ثبت شده است.');
  }
  const created: TaskTypeDefinition = { id: `CUSTOM_${randomUUID()}`, label, active: true, builtin: false, smsTemplate: validateTaskSmsTemplate(smsTemplateInput) };
  await saveCatalog([...catalog, created]);
  return created;
}

export async function updateTaskType(id: string, input: { label?: unknown; smsTemplate?: unknown }) {
  const catalog = await getTaskTypeCatalog({ includeArchived: true });
  const target = catalog.find((item) => item.id === id);
  if (!target) throw new Error('نوع وظیفه یافت نشد.');
  const label = input.label === undefined ? target.label : String(input.label).trim().replace(/\s+/g, ' ');
  if (label.length < 2 || label.length > 80) throw new Error('عنوان نوع وظیفه باید بین ۲ تا ۸۰ کاراکتر باشد.');
  if (catalog.some((item) => item.id !== id && item.label.localeCompare(label, 'fa', { sensitivity: 'base' }) === 0)) {
    throw new Error('این نوع وظیفه قبلاً ثبت شده است.');
  }
  const smsTemplate = input.smsTemplate === undefined ? target.smsTemplate : validateTaskSmsTemplate(input.smsTemplate);
  const updated = { ...target, label, smsTemplate };
  await saveCatalog(catalog.map((item) => item.id === id ? updated : item));
  return updated;
}

export async function removeOrArchiveTaskType(id: string) {
  const catalog = await getTaskTypeCatalog({ includeArchived: true });
  const target = catalog.find((item) => item.id === id);
  if (!target) throw new Error('نوع وظیفه یافت نشد.');
  const dependencies = await taskTypeDependencies();
  const taskUsage = dependencies.usageCounts.get(id) || 0;
  const automationUsage = dependencies.automationTypeIds.has(id);
  const mode = taskTypeRemovalMode({ builtin: target.builtin, usageCount: taskUsage, automationUsage });
  const next = mode === 'archived'
    ? catalog.map((item) => item.id === id ? { ...item, active: false } : item)
    : catalog.filter((item) => item.id !== id);
  await saveCatalog(next);
  return { mode, usageCount: taskUsage, automationUsage, item: { ...target, active: false } };
}

export async function restoreTaskType(id: string) {
  const catalog = await getTaskTypeCatalog({ includeArchived: true });
  const target = catalog.find((item) => item.id === id);
  if (!target) throw new Error('نوع وظیفه یافت نشد.');
  const restored = { ...target, active: true };
  await saveCatalog(catalog.map((item) => item.id === id ? restored : item));
  return restored;
}

export async function assertActiveTaskType(id: unknown) {
  const normalized = typeof id === 'string' && id ? id : 'Call Customer';
  const active = await getTaskTypeCatalog();
  if (!active.some((item) => item.id === normalized)) throw new Error('نوع وظیفه انتخاب‌شده فعال نیست.');
  return normalized;
}
