import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Suspense, act } from "react";
import { invoiceFromApi, paymentFromApi } from "../../__fixtures__/invoice-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/hooks/use-finance", async (importOriginal) => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...(await importOriginal<typeof import("@/hooks/use-finance")>()),
    useBill: () => ({
      data: {
        ...invoiceFromApi,
        paidAmount: "200000",
        status: "PARTIAL",
        student: {
          ...invoiceFromApi.student!,
          unit: { id: "unit-smp", name: "SMP IT Cipansor" },
        },
        // GET /finance/invoices/:id carries the payments; there is no
        // /invoices/:id/payments route.
        payments: [
          { ...paymentFromApi("FINAL_APPROVED"), amount: "200000" },
          paymentFromApi("PENDING_VERIFICATION"),
        ],
      },
      isLoading: false,
    }),
    useCreatePayment: idle,
    useDeletePayment: idle,
    useDeleteBill: idle,
  };
});

import BillDetailPage from "./page";

describe("bill detail", () => {
  it("shows the bill's kind, period, santri and unit, and its payments with their status", async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <BillDetailPage params={Promise.resolve({ id: invoiceFromApi.id })} />
        </Suspense>,
      );
    });

    expect(screen.getByText("INV-202609-0412")).toBeDefined();
    expect(screen.getByText("SPP Bulanan")).toBeDefined();
    expect(screen.getByText("September 2026")).toBeDefined();
    expect(screen.getByText("Muhammad Rizky")).toBeDefined();
    expect(screen.getByText("SMP IT Cipansor")).toBeDefined();
    // 500.000 − 200.000 from Decimal strings, not string arithmetic.
    expect(screen.getByText(/300\.000/)).toBeDefined();
    expect(screen.getByText("Sah")).toBeDefined();
    expect(screen.getByText("Menunggu verifikasi TU")).toBeDefined();
    expect(screen.getAllByText("Transfer Bank").length).toBe(2);
  });
});
