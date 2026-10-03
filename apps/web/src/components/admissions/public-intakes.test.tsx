import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { PublicIntakeDTO } from "@cipansor/shared";
import { PublicIntakes } from "./public-intakes";

/**
 * Each unit's intake on the public SPMB page: one tab per unit, the open one
 * first, with the brochure's waves, fee totals, requirements and contact, in
 * the reader's language around the data the unit's admin entered.
 */
function intake(
  type: string,
  name: string,
  window: PublicIntakeDTO["period"]["window"],
): PublicIntakeDTO {
  return {
    unit: { id: type, name, officialName: `${name} Pesantren Cipansor`, type },
    period: {
      id: `p-${type}`,
      name: `SPMB 2027/2028 ${name}`,
      academicYear: "2027/2028",
      startDate: "2026-09-30T17:00:00.000Z",
      endDate: "2027-07-10T16:59:59.999Z",
      window,
      opensAt: null,
      closesAt: window === "open" ? "2026-12-20T16:59:59.999Z" : null,
      registrationFee: "200000.00",
      requirements: ["Tes seleksi", "NISN"],
      minAgeMonths: 84,
      ageReferenceDate: null,
      contactName: `Panitia ${name}`,
      contactPhone: "0812-0000-0000",
    },
    waves: [
      {
        waveNumber: 1,
        name: "Gelombang 1",
        startDate: "2026-09-30T17:00:00.000Z",
        endDate: "2026-12-20T16:59:59.999Z",
        testStartDate: "2026-12-20T00:00:00.000Z",
        testEndDate: "2026-12-25T00:00:00.000Z",
        resultsStartDate: null,
        resultsEndDate: null,
        reRegistrationStartDate: null,
        reRegistrationEndDate: null,
        fullPaymentDiscount: "1000000.00",
        window,
      },
    ],
    fees: [
      {
        label: "Infaq Bangunan",
        maleAmount: "1500000.00",
        femaleAmount: "1500000.00",
        residency: "ALL",
        isMonthly: false,
      },
      {
        label: "Penyediaan Ranjang, Kasur, Lemari",
        maleAmount: "1750000.00",
        femaleAmount: "1750000.00",
        residency: "BOARDING",
        isMonthly: false,
      },
      {
        label: "SPP Bulanan",
        maleAmount: "800000.00",
        femaleAmount: "800000.00",
        residency: "BOARDING",
        isMonthly: true,
      },
      {
        label: "SPP Bulanan",
        maleAmount: "350000.00",
        femaleAmount: "350000.00",
        residency: "NON_BOARDING",
        isMonthly: true,
      },
    ],
  };
}

const INTAKES = [
  intake("TK_QURAN", "TK Qur'an", "closed"),
  intake("SD_IT", "SD IT", "open"),
];

describe("the public intakes", () => {
  it("opens on the first unit open now, with its waves, totals and contact", () => {
    render(<PublicIntakes locale="id" intakes={INTAKES} />);

    const panel = screen.getByTestId("public-intake");
    expect(within(panel).getByText("SD IT Pesantren Cipansor")).toBeTruthy();
    expect(
      within(panel).getByTestId("public-wave-table").textContent,
    ).toContain("Rp1.000.000");
    // On a phone the same schedule is one card per wave, nothing cut off.
    const card = within(panel).getByTestId("public-wave-list").textContent;
    expect(card).toContain("Tes20–25 Desember 2026");
    expect(card).toContain("Potongan lunasRp1.000.000");
    const totals = within(panel).getAllByTestId("public-fee-total");
    expect(totals.map((t) => t.textContent)).toEqual([
      expect.stringMatching(/Jumlah mukim.*Rp4\.050\.000.*Rp4\.050\.000/),
      expect.stringMatching(/Jumlah tidak mukim.*Rp1\.850\.000/),
    ]);
    expect(within(panel).getByTestId("public-min-age").textContent).toBe(
      "Usia minimal 7 tahun.",
    );
    expect(within(panel).getByText("Panitia SD IT")).toBeTruthy();
  });

  it("offers to register only where registration is open", () => {
    const onRegister = vi.fn();
    render(
      <PublicIntakes locale="id" intakes={INTAKES} onRegister={onRegister} />,
    );

    fireEvent.click(screen.getByTestId("public-intake-register"));
    expect(onRegister).toHaveBeenCalledWith("SD_IT");
  });

  it("speaks Arabic around the data, which stays as the brochure prints it", () => {
    render(<PublicIntakes locale="ar" intakes={INTAKES} />);

    expect(screen.getByText("القبول في كل وحدة")).toBeTruthy();
    // Right to left, although the form's tabs around it are left to right.
    expect(screen.getByTestId("public-intakes").getAttribute("dir")).toBe(
      "rtl",
    );
    expect(
      screen
        .getByTestId("public-intakes")
        .querySelector('[data-slot="tabs"]')
        ?.getAttribute("dir"),
    ).toBe("rtl");
    const panel = screen.getByTestId("public-intake");
    expect(within(panel).getByText("مواعيد الدفعات")).toBeTruthy();
    expect(within(panel).getByText("Infaq Bangunan")).toBeTruthy();
    expect(
      within(panel).getAllByTestId("public-fee-total")[0].textContent,
    ).toContain("المجموع للمقيمين");
  });

  it("between two waves, says when registration opens again and offers no form", () => {
    const gap = intake("SMP_IT", "SMP IT", "upcoming");
    gap.period.opensAt = "2026-12-31T17:00:00.000Z";
    const onRegister = vi.fn();
    render(
      <PublicIntakes locale="id" intakes={[gap]} onRegister={onRegister} />,
    );

    expect(screen.getByTestId("public-intake").textContent).toContain(
      "Dibuka 1 Januari 2027",
    );
    expect(screen.queryByTestId("public-intake-register")).toBeNull();
  });

  it("says so when no unit has announced an intake", () => {
    render(<PublicIntakes locale="en" intakes={[]} />);
    expect(
      screen.getByText("No admissions have been announced yet."),
    ).toBeTruthy();
  });
});
