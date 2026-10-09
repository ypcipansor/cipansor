import { describe, it, expect } from "vitest";
import { dateFormatterFor } from "./locale-format";

/**
 * Dates on the public site are fixed to the pesantren's timezone. An intake
 * opening at 00:00 WIB is stored by the API as 17:00 UTC the day before, so a
 * formatter without `timeZone: "Asia/Jakarta"` prints it one day early for a
 * reader outside WIB — "31 Desember" for a registration that opens on
 * "1 Januari".
 */
describe("dateFormatterFor", () => {
  it("renders a WIB midnight without slipping to the previous day", () => {
    // 2026-12-31T17:00:00.000Z === 2027-01-01T00:00 WIB.
    const opened = new Date("2026-12-31T17:00:00.000Z");
    expect(dateFormatterFor("id").format(opened)).toBe("1 Januari 2027");
  });
});
