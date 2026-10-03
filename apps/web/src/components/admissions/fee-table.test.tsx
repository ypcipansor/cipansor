import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AdmissionFeeItemDTO } from "@cipansor/shared";
import { FeeTableView, feeTableFormValues, feeTablePayload } from "./fee-table";

/**
 * An intake's fee table on the period page, as the brochure's "Rincian Biaya"
 * prints it — SD IT's, which has a boarding and a non-boarding total.
 */
let n = 0;
const line = (
  label: string,
  amount: number,
  residency: AdmissionFeeItemDTO["residency"] = "ALL",
  isMonthly = false,
): AdmissionFeeItemDTO => ({
  id: `f${n++}`,
  periodId: "p",
  sortOrder: n,
  label,
  maleAmount: `${amount}.00`,
  femaleAmount: `${amount}.00`,
  residency,
  isMonthly,
});

const SD_IT = [
  line("Infaq Bangunan", 1_500_000),
  line("Penyediaan Ranjang, Kasur, Lemari", 1_750_000, "BOARDING"),
  line("Seragam", 500_000),
  line("Buku Pelajaran Umum dan Kepesantrenan", 600_000),
  line("Infaq Pendidikan 1 Tahun", 500_000),
  line("Pendaftaran", 200_000),
  line("SPP Bulanan", 800_000, "BOARDING", true),
  line("SPP Bulanan", 350_000, "NON_BOARDING", true),
];

describe("the fee table", () => {
  it("prints the brochure's totals for mukim and tidak mukim", () => {
    render(<FeeTableView items={SD_IT} />);

    const totals = screen.getAllByTestId("fee-total");
    expect(totals).toHaveLength(2);
    expect(within(totals[0]).getByText(/Jumlah mukim/)).toBeTruthy();
    expect(within(totals[0]).getAllByText("Rp5.850.000")).toHaveLength(2);
    expect(within(totals[1]).getByText(/Jumlah tidak mukim/)).toBeTruthy();
    expect(within(totals[1]).getAllByText("Rp3.650.000")).toHaveLength(2);
    // A line for one residency, or a monthly one, says so.
    expect(screen.getByText(/\(mukim, per bulan\)/)).toBeTruthy();
  });

  it("says so when the unit has published no fees yet", () => {
    render(<FeeTableView items={[]} />);
    expect(screen.getByText("Rincian biaya belum diisi.")).toBeTruthy();
  });

  it("edits what is stored and sends whole rupiah back", () => {
    const form = feeTableFormValues(SD_IT.slice(0, 2));
    expect(form.items[1]).toEqual({
      label: "Penyediaan Ranjang, Kasur, Lemari",
      maleAmount: "1750000",
      femaleAmount: "1750000",
      residency: "BOARDING",
      isMonthly: false,
    });
    expect(feeTablePayload(form).items[0]).toEqual({
      label: "Infaq Bangunan",
      maleAmount: 1_500_000,
      femaleAmount: 1_500_000,
      residency: "ALL",
      isMonthly: false,
    });
  });
});
