import { normalizeProductIdentity } from '../../shared/productCanonicalIdentity';

export const PRODUCT_ALIAS_LABEL = 'نام‌های جایگزین برای تشخیص AI:';

function normalizeDetectionText(value: string): string {
  return normalizeProductIdentity(value);
}

export function productDetectionAliases(description: string | null | undefined): string[] {
  const line = String(description || '').split(/\r?\n/).find(item => item.trim().startsWith(PRODUCT_ALIAS_LABEL));
  if (!line) return [];
  return [...new Set(line.slice(line.indexOf(PRODUCT_ALIAS_LABEL) + PRODUCT_ALIAS_LABEL.length)
    .split('|')
    .map(item => item.trim())
    .filter(Boolean))];
}

export function productDescriptionWithoutAliases(description: string | null | undefined): string {
  return String(description || '').split(/\r?\n/)
    .filter(line => !line.trim().startsWith(PRODUCT_ALIAS_LABEL))
    .join('\n')
    .trim();
}

export function withProductDetectionAliases(description: string | null | undefined, aliases: unknown): string {
  const cleanAliases = [...new Set((Array.isArray(aliases) ? aliases : String(aliases || '').split(/[|،,\n]/))
    .map(item => String(item).trim())
    .filter(Boolean))];
  const lines = productDescriptionWithoutAliases(description).split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (cleanAliases.length) lines.push(`${PRODUCT_ALIAS_LABEL} ${cleanAliases.join(' | ')}`);
  return lines.join('\n').trim();
}

export function productDetectionTerms(name: string, description: string | null | undefined): string[] {
  return [name.trim(), ...productDetectionAliases(description)].filter(Boolean);
}

export function uniqueProductDetectionMatch<T extends { id: string; name: string; description?: string | null }>(
  message: string,
  products: T[],
): T | null {
  const normalizedMessage = ` ${normalizeDetectionText(message)} `;
  const matches = products.flatMap(product => productDetectionTerms(product.name, product.description)
    .map(term => normalizeDetectionText(term))
    .filter(term => term.length >= 3 && normalizedMessage.includes(` ${term} `))
    .map(term => ({ product, termLength: term.length })));
  if (!matches.length) return null;
  const longest = Math.max(...matches.map(match => match.termLength));
  const productIds = [...new Set(matches.filter(match => match.termLength === longest).map(match => match.product.id))];
  return productIds.length === 1 ? products.find(product => product.id === productIds[0]) || null : null;
}
