import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { invoiceFromApi } from "./__fixtures__/invoice-api";

const { useBills } = vi.hoisted(() => ({ useBills: vi.fn() }));

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/finance/tunggakan-panel", () => ({
  TunggakanPanel: () => null,
}));
vi.mock("@/hooks/use-academic-years", () => ({
  useActiveAcademicYear: () => ({ data: { id: "ay-2627", name: "2026/2027" } }),
  useAcademicYears: () => ({
    data: { data: [{ id: "ay-2627", name: "2026/2027" }] },
  }),
}));
vi.mock("@/hooks/use-finance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-finance")>()),
  useBills,
  useFinancialSummary: () => ({ data: undefined }),
  usePaymentTypeOptions: () => ({
    data: [{ code: "SPP", name: "SPP Bulanan" }],
  }),
}));

import FinancePage from "./page";

beforeEach(() => {
  useBills.mockReturnValue({
    data: {
      data: [invoiceFromApi],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
    isLoading: false,
  });
});

describe("Tagihan & SPP list", () => {
  it("shows the kind of bill, the santri's name and the invoice number the API sends", () => {
    render(<FinancePage />);

    // "Jenis" was blank: the page read `billType`, which the API never sends.
    expect(screen.getAllByText("SPP Bulanan").length).toBeGreaterThan(0);
    expect(screen.getByText("September 2026")).toBeDefined();
    // The santri column showed only the NIS: it read `student.name`.
    expect(screen.getByText("Muhammad Rizky")).toBeDefined();
    expect(screen.getByText("20240001")).toBeDefined();
    expect(screen.getByText("INV-202609-0412")).toBeDefined();
  });

  it("asks the API for the active academic year's bills", () => {
    render(<FinancePage />);
    expect(useBills).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: "ay-2627",
        paymentTypeCode: undefined,
        search: undefined,
      }),
    );
    expect(screen.getByText("tahun ajaran 2026/2027")).toBeDefined();
  });
});
