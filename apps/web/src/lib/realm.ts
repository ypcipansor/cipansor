/**
 * How a role's realm (the Prisma `Realm` enum) reads on its badge: the header
 * role switcher and the sidebar's account card.
 *
 * Both used to keep their own map, keyed `TK` and `SMA_ALQURAN` — names the
 * enum no longer has — and neither knew `PESANTREN` or `UNIT_USAHA`. Every TK
 * Qur'an, SMA Qur'an, pesantren and business role showed an empty, colourless
 * pill. One map now, and `realm.test.ts` fails when the enum gains a value it
 * does not cover. The realm itself is to be retired (Model A,
 * `decisions/struktur-organisasi-dan-identitas.md`); until then it reads right.
 */
export const REALM_LABELS: Readonly<Record<string, string>> = {
  GLOBAL: "Global",
  YAYASAN: "Yayasan",
  TK_QURAN: "TK Qur'an",
  SD_IT: "SD IT",
  SMP_IT: "SMP IT",
  SMA_QURAN: "SMA Qur'an",
  PESANTREN: "Pesantren",
  UNIT_USAHA: "Unit Usaha",
};

export const REALM_COLORS: Readonly<Record<string, string>> = {
  GLOBAL: "bg-purple-500",
  YAYASAN: "bg-amber-500",
  TK_QURAN: "bg-pink-500",
  SD_IT: "bg-green-500",
  SMP_IT: "bg-blue-500",
  SMA_QURAN: "bg-emerald-500",
  PESANTREN: "bg-teal-600",
  UNIT_USAHA: "bg-orange-500",
};

/** The badge text; an unknown realm shows its code rather than nothing. */
export function realmLabel(realm: string): string {
  return REALM_LABELS[realm] ?? realm;
}

/** The badge colour; an unknown realm falls back to a neutral one. */
export function realmColor(realm: string): string {
  return REALM_COLORS[realm] ?? "bg-slate-500";
}
