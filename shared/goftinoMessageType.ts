export function goftinoMessageType(...candidates: unknown[]): 'IMAGE' | 'TEXT' {
  const raw = candidates.map(value => String(value || '')).join(' ').toUpperCase();
  return /IMAGE|PHOTO|PICTURE/.test(raw) ? 'IMAGE' : 'TEXT';
}
