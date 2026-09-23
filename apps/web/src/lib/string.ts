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
