export type TaskTypeRemovalMode = 'archived' | 'deleted';

export function taskTypeRemovalMode(input: { builtin: boolean; usageCount: number; automationUsage: boolean }): TaskTypeRemovalMode {
  return input.builtin || input.usageCount > 0 || input.automationUsage ? 'archived' : 'deleted';
}

export function taskTypeRemovalMessage(input: { mode: TaskTypeRemovalMode; usageCount: number }): string {
  if (input.mode === 'archived' && input.usageCount > 0) {
    return 'این نوع در وظایف قبلی استفاده شده و برای حفظ تاریخچه آرشیو شد.';
  }
  return input.mode === 'archived'
    ? 'این نوع برای حفظ وابستگی‌های سیستم آرشیو شد.'
    : 'نوع بدون استفاده برای همیشه حذف شد.';
}
