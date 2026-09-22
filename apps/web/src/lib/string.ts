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
 * The scan is a single left-to-right pass that never re-reads a dropped
 * character, so the cost is linear in the input length. That is the fix for
 * code scanning alert 49 and for the quadratic re-strip the alert-27 fix first
 * introduced: the earlier `stripMarkupToFixedPoint` looped `stripMarkupOnce`
 * until the string stopped changing, and stacked tag fragments such as
 * `"<a".repeat(n) + ">".repeat(n)` took one round per layer and therefore O(n²)
 * time. Here one `>` drops the whole `<a…>` run in one move.
 *
 * The result is text, not HTML-safe markup. Do not interpolate it into HTML
 * without escaping — call `escapeHtml` at that call site for that.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return stripMarkup(html);
}

/**
 * Single left-to-right pass that drops markup runs.
 *
 * Runs are recognised by their terminator as it arrives, and the output buffer
 * doubles as the state machine. Two indexes track, for the output produced so
 * far, the most recent still-unterminated `<` and `>`; when a terminator
 * arrives it drops back to the corresponding `<`, which removes the whole run
 * in one move instead of re-scanning the string. This is what makes the pass
 * linear and what reaches the fixed point directly: dropping a run can glue its
 * neighbours into a fresh tag, but that glue is recognised from the output that
 * is already there, so no second round is needed.
 *
 * The run kinds are the ones documented on `stripHtml`:
 *   - `<!-- ... -->`  comment (may contain `<`), or `<! ... >`
 *   - `<? ... ?>`     processing instruction (body free of `<`/`>`)
 *   - `</?name ... >` opening/closing element tag (name starts a letter)
 * A `<` that starts none of these is plain text.
 */
function stripMarkup(text: string): string {
  const out: string[] = [];
  const lessThans: number[] = [];
  const greaterThans: number[] = [];
  // Starts of `<!--` runs that are still open in `out` (a fused pair such as
  // `<scr` + `ipt>` closes an element at the *later* `<`; a fused comment is
  // closed by the `-->` its neighbours supplied).
  const openComments: number[] = [];
  let searchFrom = -1;
  let searchFound = -1;

  const truncateTo = (size: number): void => {
    out.length = size;
    while (lessThans.length && lessThans[lessThans.length - 1] >= size) {
      lessThans.pop();
    }
    while (greaterThans.length && greaterThans[greaterThans.length - 1] >= size) {
      greaterThans.pop();
    }
    while (
      openComments.length &&
      openComments[openComments.length - 1] >= size
    ) {
      openComments.pop();
    }
  };

  // Memoised search for `-->` across the whole pass: the cursor only moves
  // forward, so a long run of comment starters costs one scan in total.
  const findCommentClose = (from: number): number => {
    const stale = searchFrom === -1 || from < searchFrom;
    const behind = searchFound !== -1 && searchFound < from;
    if (stale || behind) {
      searchFrom = from;
      searchFound = text.indexOf("-->", from);
    }
    return searchFound;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === "<") {
      if (text.startsWith("<!--", i)) {
        const close = findCommentClose(i + 4);
        if (close !== -1) {
          // A comment run started in the source is removed whole, exactly like
          // the single pass this replaces. Its characters never entered `out`,
          // so consuming the source range is the whole removal.
          i = close + 2;
          continue;
        }
        // No `-->`: fall through. `<!-->` (and `<!-- x >`) are still
        // declaration-shaped and are removed via `<! ... >` below.
      }
      lessThans.push(out.length);
      out.push("<");
      continue;
    }

    if (char === ">") {
      const size = out.length;

      // A fused comment: `--` sits immediately before this `>`.
      if (
        size >= 2 &&
        out[size - 1] === "-" &&
        out[size - 2] === "-" &&
        openComments.length
      ) {
        const firstDash = size - 2;
        if (firstDash >= openComments[0] + 4) {
          truncateTo(openComments[0]);
          continue;
        }
      }

      const openLt = lessThans.length ? lessThans[lessThans.length - 1] : -1;
      const openGt = greaterThans.length
        ? greaterThans[greaterThans.length - 1]
        : -1;

      if (openLt >= 0 && openGt < openLt) {
        const next = out[openLt + 1];
        if (next === "?") {
          // `<? ... ?>`: the `>` only closes it when a `?` precedes it.
          if (size - 1 >= openLt + 2 && out[size - 1] === "?") {
            truncateTo(openLt);
            continue;
          }
        } else if (next === "!") {
          truncateTo(openLt);
          continue;
        } else {
          let nameStart = openLt + 1;
          if (next === "/") nameStart++;
          const first = out[nameStart];
          if (first !== undefined && /[a-z]/i.test(first)) {
            truncateTo(openLt);
            continue;
          }
        }
      }

      greaterThans.push(out.length);
      out.push(">");
      continue;
    }

    out.push(char);
    const size = out.length;
    if (
      size >= 4 &&
      out[size - 1] === "-" &&
      out[size - 2] === "-" &&
      out[size - 3] === "!" &&
      out[size - 4] === "<"
    ) {
      openComments.push(size - 4);
    }
  }

  return out.join("");
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
