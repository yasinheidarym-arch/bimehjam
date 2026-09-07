const ALIAS_LABEL = 'نام‌های جایگزین برای تشخیص AI:';

export function productDetectionAliases(description: string | null | undefined): string[] {
  const line = String(description || '').split(/\r?\n/).find(item => item.trim().startsWith(ALIAS_LABEL));
  if (!line) return [];
  return [...new Set(line.slice(line.indexOf(ALIAS_LABEL) + ALIAS_LABEL.length)
    .split('|')
    .map(item => item.trim())
    .filter(Boolean))];
}

export function productDetectionTerms(name: string, description: string | null | undefined): string[] {
  return [name.trim(), ...productDetectionAliases(description)].filter(Boolean);
}

