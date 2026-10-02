const HONORIFICS = new Set(["ustadz", "ustadzah", "bunda", "ibu", "bapak"]);

/**
 * Two initials for a person's avatar, from the name itself rather than the
 * titles around it: "K.H. Drs. Tetep Abdullatip, M.Ag." is "TA", not "KD".
 * Degrees follow the first comma; titles are abbreviations ("H.", "K.H.",
 * "Drs.") or honorifics ("Ustadz").
 */
export function personInitials(name: string): string {
  const words = name
    .split(",")[0]
    .split(/\s+/)
    .filter((w) => w && !w.includes(".") && !HONORIFICS.has(w.toLowerCase()));
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
