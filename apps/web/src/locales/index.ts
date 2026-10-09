import { id } from "./id";
import { en } from "./en";
import { ar } from "./ar";

/**
 * Locale dictionaries. `id` (Bahasa Indonesia) is the source of truth for the
 * key structure; `en` and `ar` must mirror it exactly (enforced by the
 * TranslationKeys type below — a missing/extra key fails the build).
 */
export const translations: Record<Locale, TranslationKeys> = {
  id,
  en,
  ar,
};

export type Locale = "id" | "en" | "ar";
export type TranslationKeys = typeof id;

export const LOCALES: readonly Locale[] = ["id", "en", "ar"];

export const LOCALE_LABELS: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
  ar: "العربية",
};

/** RTL locales — drives the <html dir> attribute. */
export const RTL_LOCALES: readonly Locale[] = ["ar"];

/** Cookie that persists the locale; read server-side by the root layout. */
export const LOCALE_COOKIE = "app-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/**
 * Fills `{name}` placeholders in a translated string.
 *
 * Placeholders live in the translation so word order stays with the translator
 * — English and Arabic order a sentence differently from Indonesian, and
 * assembling it in code would freeze Indonesian grammar into all three. A
 * placeholder with no matching key is left as written, so a missing value shows
 * the gap instead of printing "undefined".
 */
export function fillPlaceholders(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * All valid dot-paths into the translation tree, e.g. "common.save".
 * Using these as the `t()` argument type makes typos a compile error.
 */
type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationPath = Paths<TranslationKeys>;

/** Resolve a dot-path against a dictionary without `any`. */
export function resolvePath(
  dict: TranslationKeys,
  path: string,
): string | undefined {
  let current: unknown = dict;
  for (const key of path.split(".")) {
    if (
      current !== null &&
      typeof current === "object" &&
      key in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}
