/**
 * Escapes the five HTML meta-characters so an untrusted value can be
 * interpolated into an HTML document without being parsed as markup.
 * (CodeQL models the leading `&`/`<` replacements as an XSS sanitizer.)
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
