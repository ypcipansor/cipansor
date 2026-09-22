/**
 * String utilities
 */

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Capitalize each word
 */
export function capitalizeWords(str: string): string {
  if (!str) return "";
  return str
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

/**
 * Convert to title case (handle common abbreviations)
 */
export function toTitleCase(str: string): string {
  if (!str) return "";

  const lowerCaseWords = ["dan", "atau", "di", "ke", "dari", "untuk", "yang"];
  const uppercaseWords = [
    "SD",
    "SMP",
    "SMA",
    "MA",
    "MTs",
    "MI",
    "SMK",
    "RA",
    "TK",
    "PAUD",
  ];

  return str
    .split(" ")
    .map((word, index) => {
      const upper = word.toUpperCase();

      if (uppercaseWords.includes(upper)) {
        return upper;
      }

      const lower = word.toLowerCase();
      if (index > 0 && lowerCaseWords.includes(lower)) {
        return lower;
      }

      return capitalize(word);
    })
    .join(" ");
}

/**
 * Generate initials from name
 */
export function getInitials(name: string, maxLength = 2): string {
  if (!name) return "";

  return name
    .split(" ")
    .filter((word) => word.length > 0)
    .slice(0, maxLength)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * Slugify string
 */
export function slugify(str: string): string {
  if (!str) return "";

  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Remove HTML markup, keeping the text content.
 *
 * Plain-text extraction, not escaping: `<b>Hello</b>` becomes `Hello`.
 * Element tags, comments (`<!-- -->`), declarations/doctype (`<!DOCTYPE html>`)
 * and processing instructions (`<?xml ... ?>`) are all removed. Tags are
 * stripped to a fixed point, so removing one tag can never concatenate its
 * neighbours into a new one (`<<script>script>` -> `<script>`). Entities are
 * left alone, so `a &lt; b` stays `a &lt; b`.
 *
 * The scan is a hand-written left-to-right pass, not a regex. Every character
 * is consumed once and no alternative backtracks, so the cost is linear in the
 * input length. The regexes this replaced were polynomial: the generic
 * `<[^>]*>` body rescanned to end-of-string from every unmatched `<`, and
 * `<!--(?:[^-]|-(?!->))*-->` restarted its body scan at every `<!--`; both are
 * gone (code scanning alert 49).
 *
 * The result is text, not HTML-safe markup. Do not interpolate it into HTML
 * without escaping — call `escapeHtml` at that call site for that.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return stripMarkupToFixedPoint(html);
}

/**
 * One linear pass that drops a tag-shaped run and copies everything else.
 *
 * A run starts at `<` and is one of:
 *   - `<!-- ... -->`  comment
 *   - `<! ... >`      declaration / doctype
 *   - `<? ... ?>`     processing instruction
 *   - `</?name ... >` opening/closing element tag (name starts a letter)
 * A `<` that starts none of these is plain text and is copied as-is.
 */
function stripMarkupOnce(text: string): string {
  const parts: string[] = [];
  const comments: ForwardSearch = { from: -1, found: -1 };
  let copiedUpTo = 0;
  let i = 0;

  while (i < text.length) {
    if (text.charCodeAt(i) !== 60 /* < */) {
      i++;
      continue;
    }

    const end = tagEnd(text, i, comments);
    if (end === -1) {
      // Not markup: leave this `<` in place and keep scanning after it.
      i++;
      continue;
    }

    parts.push(text.slice(copiedUpTo, i));
    copiedUpTo = end;
    i = end;
  }

  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/**
 * Memoised forward search for a fixed needle, shared across the `<` positions
 * of one pass.
 *
 * A comment body may contain `<`, so its `-->` search cannot be bounded by the
 * next `<` the way a tag body is. Without memoising, every `<!--` in a long run
 * of comment starters would rescan to end-of-string — quadratic. `from` is the
 * last position searched and `found` its result (or -1). A later caller reuses
 * it when `found` is still ahead of its own search start, or when the earlier
 * search already reached end-of-string and found nothing. Re-searches only
 * happen when `found` fell behind, and then `from` strictly advances, so the
 * total work stays linear.
 */
interface ForwardSearch {
  from: number;
  found: number;
}

function findForward(
  text: string,
  needle: string,
  searchFrom: number,
  state: ForwardSearch,
): number {
  const stale = state.from === -1 || searchFrom < state.from;
  const behind = state.found !== -1 && state.found < searchFrom;
  if (stale || behind) {
    state.from = searchFrom;
    state.found = text.indexOf(needle, searchFrom);
  }
  return state.found;
}

/**
 * End index (exclusive) of the markup run starting at `start`, or -1 when the
 * text at `start` does not begin markup. Never scans backwards.
 *
 * A tag body stops at the first `<` as well as its terminator, matching the
 * `[^<>]*` bodies this replaced, so a run can never swallow a second tag. Each
 * scan is bounded by the next `<` or terminator, so the whole pass stays linear.
 */
function tagEnd(text: string, start: number, comments: ForwardSearch): number {
  const next = text[start + 1];

  if (next === "!") {
    if (text.startsWith("<!--", start)) {
      // Comments may contain `<`, so this one scans to `-->`.
      const close = findForward(text, "-->", start + 4, comments);
      if (close !== -1) return close + 3;
      // No `-->`: fall through. `<!-->` (and `<!-- x >`) are still
      // declaration-shaped, and the pattern this replaced removed them via
      // `<! ... >`. An unterminated comment with no `>` stays literal.
    }
    const close = indexOfBeforeLt(text, start + 2, ">");
    return close === -1 ? -1 : close + 1;
  }

  if (next === "?") {
    // `<? ... ?>` — body may not contain `<` or `>` (the committed
    // `<\?[^<>]*\?>`), so stop at either, not just at `<`.
    const close = indexOfStoppingAtBrackets(text, start + 2, "?>");
    return close === -1 ? -1 : close + 2;
  }

  // `</name ...>` / `<name ...>`; anything else is a literal `<`.
  let nameStart = start + 1;
  if (next === "/") nameStart++;
  const first = text[nameStart];
  if (first === undefined || !/[a-z]/i.test(first)) return -1;

  const close = indexOfBeforeLt(text, nameStart, ">");
  return close === -1 ? -1 : close + 1;
}

/**
 * Index of `target` at or after `from`, or -1 if a `<` comes first. The `<`
 * stop is what keeps a tag body from spanning two tags.
 */
function indexOfBeforeLt(text: string, from: number, target: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "<") return -1;
    if (text.startsWith(target, i)) return i;
  }
  return -1;
}

/**
 * Index of `target` at or after `from`, or -1 if a `<` or `>` comes first.
 * Used for `<? ... ?>`, whose body the committed pattern bounded with `[^<>]`.
 */
function indexOfStoppingAtBrackets(
  text: string,
  from: number,
  target: string,
): number {
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === "<" || ch === ">") return -1;
    if (text.startsWith(target, i)) return i;
  }
  return -1;
}

/**
 * Apply `stripMarkupOnce` until the string stops changing. Removing one run can
 * concatenate its neighbours into a new one (`<<script>script>` -> `<script>`),
 * so a single pass is not enough for tag-shaped input. Each round removes at
 * least one character or the string is returned, so the loop terminates.
 */
function stripMarkupToFixedPoint(text: string): string {
  let current = text;
  for (;;) {
    const next = stripMarkupOnce(current);
    if (next === current) return current;
    current = next;
  }
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Check if string is empty or whitespace only
 */
export function isEmpty(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Check if string is valid email
 */
export function isEmail(str: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(str);
}

/**
 * Check if string is valid Indonesian phone number
 */
export function isPhoneNumber(str: string): boolean {
  const phoneRegex = /^(\+62|62|0)8[1-9][0-9]{7,10}$/;
  return phoneRegex.test(str.replace(/[\s-]/g, ""));
}

/**
 * Check if string is valid NIK
 */
export function isNIK(str: string): boolean {
  const nikRegex = /^[0-9]{16}$/;
  return nikRegex.test(str.replace(/\D/g, ""));
}

/**
 * Mask string (e.g., for sensitive data)
 */
export function mask(
  str: string,
  visibleStart = 4,
  visibleEnd = 4,
  maskChar = "*",
): string {
  if (!str || str.length <= visibleStart + visibleEnd) return str;

  const start = str.slice(0, visibleStart);
  const end = str.slice(-visibleEnd);
  const middleLength = str.length - visibleStart - visibleEnd;
  const middle = maskChar.repeat(middleLength);

  return `${start}${middle}${end}`;
}

/**
 * Mask email address
 */
export function maskEmail(email: string): string {
  if (!email || !isEmail(email)) return email;

  const [local, domain] = email.split("@");
  const maskedLocal = mask(local, 2, 1, "*");

  return `${maskedLocal}@${domain}`;
}

/**
 * Mask phone number
 */
export function maskPhone(phone: string): string {
  if (!phone) return phone;

  const digits = phone.replace(/\D/g, "");
  return mask(digits, 4, 3, "*");
}

/**
 * Highlight search term in text
 */
export function highlightText(
  text: string,
  searchTerm: string,
  highlightClass = "bg-yellow-200",
): string {
  if (!searchTerm || !text) return text;

  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, "gi");
  return text.replace(regex, `<mark class="${highlightClass}">$1</mark>`);
}

/**
 * Escape special regex characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pluralize Indonesian noun (simplified)
 */
export function pluralize(word: string, count: number): string {
  return `${count} ${word}`;
}

/**
 * Generate random string
 */
export function randomString(
  length: number,
  charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

/**
 * Join strings with separator, filtering out empty values
 */
export function joinNonEmpty(
  strings: (string | null | undefined)[],
  separator = ", ",
): string {
  return strings.filter((s) => !isEmpty(s)).join(separator);
}
