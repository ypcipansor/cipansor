import { describe, it, expect } from "vitest";
import {
  calendarDay,
  formatAge,
  formatDays,
  formatRupiah,
  requirementLines,
  wibDay,
} from "./admission-intake";
import {
  periodChange,
  periodFormValues,
  periodPayload,
} from "@/components/admissions/period-form";
import { waveFormValues, wavePayload } from "@/components/admissions/wave-form";

describe("an intake's days", () => {
  it("reads a stored registration moment on the WIB clock", () => {
    // The end of 20 December in Tasikmalaya is still the 20th, although it is
    // the 20th's afternoon in UTC; the start of 1 October is the 30th in UTC.
    expect(wibDay("2026-12-20T16:59:59.999Z")).toBe("2026-12-20");
    expect(wibDay("2026-09-30T17:00:00.000Z")).toBe("2026-10-01");
    expect(wibDay(null)).toBe("");
  });

  it("reads a session's calendar day as stored", () => {
    expect(calendarDay("2026-12-20T00:00:00.000Z")).toBe("2026-12-20");
  });

  it.each([
    ["2027-02-28", undefined, "28 Feb 2027"],
    ["2026-12-20", "2026-12-25", "20–25 Des 2026"],
    ["2027-03-08", "2027-05-31", "8 Mar – 31 Mei 2027"],
    ["2026-12-28", "2027-01-03", "28 Des 2026 – 3 Jan 2027"],
    ["", "", "—"],
  ])("writes %s–%s as the brochure does", (start, end, text) => {
    expect(formatDays(start, end)).toBe(text);
  });

  it("writes ages and money the Indonesian way", () => {
    expect(formatAge(84)).toBe("7 tahun");
    expect(formatAge(66)).toBe("5 tahun 6 bulan");
    expect(formatRupiah("1000000.00")).toBe("Rp1.000.000");
    expect(formatRupiah(null)).toBe("");
  });

  it("takes one requirement per line, dropping empty ones", () => {
    expect(requirementLines(" NISN \n\nSKL\n  \nSKKB")).toEqual([
      "NISN",
      "SKL",
      "SKKB",
    ]);
  });
});

describe("the period form", () => {
  const values = {
    ...periodFormValues(),
    unitId: "u",
    academicYearId: "y",
    name: "SPMB 2027/2028 SD IT",
    startDate: "2026-10-01",
    endDate: "2027-07-10",
    requirements: "Tes seleksi\nFotokopi ijazah TK\n",
    minAgeYears: "7",
    minAgeExtraMonths: "",
    contactName: "",
    contactPhone: "",
  };

  it("sends the minimum age in months, and empty text as none", () => {
    expect(periodPayload(values)).toMatchObject({
      requirements: ["Tes seleksi", "Fotokopi ijazah TK"],
      minAgeMonths: 84,
      ageReferenceDate: null,
      contactName: null,
      contactPhone: null,
    });
    expect(
      periodPayload({ ...values, minAgeYears: "", minAgeExtraMonths: "" })
        .minAgeMonths,
    ).toBeNull();
  });

  it("never sends the unit or the year on an edit", () => {
    expect(periodChange(values)).not.toHaveProperty("unitId");
    expect(periodChange(values)).not.toHaveProperty("academicYearId");
  });

  it("fills an edit with what was stored, on the WIB clock", () => {
    const form = periodFormValues({
      id: "p",
      unitId: "u",
      academicYearId: "y",
      name: "SPMB",
      startDate: "2026-09-30T17:00:00.000Z",
      endDate: "2027-07-10T16:59:59.999Z",
      quota: 0,
      registrationFee: "200000.00",
      isActive: true,
      requirements: ["NISN", "SKL"],
      minAgeMonths: 66,
      ageReferenceDate: "2027-07-01T00:00:00.000Z",
      contactName: null,
      contactPhone: null,
    });
    expect(form).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2027-07-10",
      registrationFee: "200000",
      requirements: "NISN\nSKL",
      minAgeYears: "5",
      minAgeExtraMonths: "6",
      ageReferenceDate: "2027-07-01",
    });
  });
});

describe("the wave form", () => {
  it("sends an empty session or discount as none", () => {
    const payload = wavePayload({
      ...waveFormValues(undefined, 4),
      startDate: "2027-06-01",
      endDate: "2027-07-10",
      quota: "20",
    });
    expect(payload).toMatchObject({
      name: "Gelombang 4",
      waveNumber: 4,
      quota: 20,
      testStartDate: null,
      reRegistrationEndDate: null,
      fullPaymentDiscount: null,
      notes: null,
    });
  });

  it("leaves a new wave's status to the API, which reads it from the dates", () => {
    const values = {
      ...waveFormValues(undefined, 1),
      startDate: "2026-10-01",
      endDate: "2026-12-20",
      quota: "60",
    };
    expect(wavePayload(values, true).status).toBeUndefined();
    expect(wavePayload(values).status).toBe("UPCOMING");
  });

  it("fills an edit with the stored days and discount", () => {
    const form = waveFormValues(
      {
        id: "w",
        periodId: "p",
        waveNumber: 1,
        name: "Gelombang 1",
        startDate: "2026-09-30T17:00:00.000Z",
        endDate: "2026-12-20T16:59:59.999Z",
        quota: 60,
        registeredCount: 0,
        acceptedCount: 0,
        status: "OPEN",
        registrationFee: null,
        testStartDate: "2026-12-20T00:00:00.000Z",
        testEndDate: "2026-12-25T00:00:00.000Z",
        resultsStartDate: null,
        resultsEndDate: null,
        reRegistrationStartDate: null,
        reRegistrationEndDate: null,
        fullPaymentDiscount: "1000000.00",
        notes: null,
      },
      2,
    );
    expect(form).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2026-12-20",
      testEndDate: "2026-12-25",
      fullPaymentDiscount: "1000000",
      waveNumber: "1",
    });
  });
});
