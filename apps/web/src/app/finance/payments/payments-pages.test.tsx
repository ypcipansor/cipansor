import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { paymentFromApi } from "../__fixtures__/invoice-api";

const { usePayment, usePayments } = vi.hoisted(() => ({
  usePayment: vi.fn(),
  usePayments: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/layout/main-layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ data: { institutionName: "Yayasan Cipansor" } }),
}));
vi.mock("@/hooks/use-finance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-finance")>()),
  usePayment,
  usePayments,
}));

import { Suspense, act } from "react";
import PaymentsPage from "./page";
import PaymentReceiptPage from "./[id]/receipt/page";

async function renderReceipt() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PaymentReceiptPage params={Promise.resolve({ id: "p1" })} />
      </Suspense>,
    );
  });
}

describe("payment receipt", () => {
  it("prints the santri, class, bill and method of an approved payment", async () => {
    usePayment.mockReturnValue({
      data: paymentFromApi("FINAL_APPROVED"),
      isLoading: false,
      error: null,
    });
    await renderReceipt();

    expect(screen.getByText("KUITANSI PEMBAYARAN")).toBeDefined();
    expect(screen.getByText("Muhammad Rizky")).toBeDefined();
    expect(screen.getByText(/VIII A/)).toBeDefined();
    expect(screen.getByText(/SPP Bulanan - September 2026/)).toBeDefined();
    expect(screen.getByText(/Transfer Bank \(Ref\. TRX-88120\)/)).toBeDefined();
    expect(screen.getByText(/Lima Ratus Ribu/)).toBeDefined();
  });

  it.each(["PENDING_VERIFICATION", "TU_APPROVED", "REJECTED"] as const)(
    "does not issue a receipt for a proof that is %s",
    async (status) => {
      usePayment.mockReturnValue({
        data: paymentFromApi(status),
        isLoading: false,
        error: null,
      });
      await renderReceipt();

      expect(screen.queryByText("KUITANSI PEMBAYARAN")).toBeNull();
      expect(
        screen.queryByText("Kuitansi ini merupakan bukti pembayaran yang sah."),
      ).toBeNull();
      expect(screen.getByText(/Kuitansi belum dapat dicetak/)).toBeDefined();
    },
  );
});

describe("payment history", () => {
  beforeEach(() => {
    usePayments.mockReturnValue({
      data: {
        data: [paymentFromApi("PENDING_VERIFICATION")],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
      isLoading: false,
    });
  });

  it("shows who paid for what, and marks a proof still in review", () => {
    render(<PaymentsPage />);

    expect(screen.getByText("Muhammad Rizky")).toBeDefined();
    expect(screen.getByText("INV-202609-0412")).toBeDefined();
    expect(screen.getByText("SPP Bulanan")).toBeDefined();
    expect(screen.getByText("Transfer Bank")).toBeDefined();
    expect(screen.getByText("Menunggu verifikasi TU")).toBeDefined();
  });

  it("asks the API with its own parameter names", () => {
    render(<PaymentsPage />);
    expect(usePayments).toHaveBeenCalledWith(
      expect.objectContaining({ method: undefined }),
    );
    expect(usePayments.mock.calls[0][0]).not.toHaveProperty("paymentMethod");
  });
});
