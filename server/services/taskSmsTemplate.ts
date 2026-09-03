export const TASK_SMS_TEMPLATE_VARIABLES = [
  'taskType',
  'taskTitle',
  'priority',
  'customerFullName',
  'taskId',
  'taskLink',
] as const;

export type TaskSmsTemplateVariable = typeof TASK_SMS_TEMPLATE_VARIABLES[number];
export type TaskSmsTemplateValues = Record<TaskSmsTemplateVariable, string>;

export const DEFAULT_TASK_SMS_TEMPLATE =
  'بیمه جم: وظیفه «{{taskType}}» برای {{customerFullName}} ثبت شد. عنوان: {{taskTitle}} | اولویت: {{priority}} | شناسه: {{taskId}} | {{taskLink}}';

const TEMPLATE_TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

export function validateTaskSmsTemplate(input: unknown): string {
  if (typeof input !== 'string') throw new Error('قالب پیامک باید متن باشد.');
  const template = input.trim();
  if (template.length > 500) throw new Error('قالب پیامک حداکثر می‌تواند ۵۰۰ کاراکتر باشد.');

  const allowed = new Set<string>(TASK_SMS_TEMPLATE_VARIABLES);
  for (const match of template.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    if (!allowed.has(match[1])) throw new Error(`متغیر غیرمجاز در قالب پیامک: {{${match[1]}}}`);
  }
  if (/{{|}}/.test(template.replace(TEMPLATE_TOKEN_PATTERN, ''))) {
    throw new Error('ساختار یکی از متغیرهای قالب پیامک معتبر نیست.');
  }
  return template;
}

export function renderTaskSmsTemplate(templateInput: unknown, values: TaskSmsTemplateValues): string {
  const template = validateTaskSmsTemplate(templateInput) || DEFAULT_TASK_SMS_TEMPLATE;
  return template.replace(TEMPLATE_TOKEN_PATTERN, (_token, key: TaskSmsTemplateVariable) => values[key]);
}
