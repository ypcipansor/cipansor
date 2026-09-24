/**
 * Responses in the shape the API actually sends (captured from
 * GET /finance/invoices and /finance/payments/:id, 2026-09-24).
 *
 * The finance pages were written against a `Bill` the API never sent
 * (`billType`, `student.name`, `receiptNumber`), so they rendered blanks.
 * Tests render them against these instead of against the page's own
 * assumptions. The API side of the contract is pinned in
 * apps/api/src/modules/finance/service.test.ts ("bill and payment reads").
 */
import type { Bill, Payment } from "@/hooks/use-finance";

export const invoiceFromApi: Bill = {
  id: "a7e2f9a2-23b1-48f0-bc86-26e910e6e36a",
  invoiceNumber: "INV-202609-0412",
  studentId: "3d2f951d-7122-40c8-a1e0-abb4fdcc4c0a",
  student: {
    id: "3d2f951d-7122-40c8-a1e0-abb4fdcc4c0a",
    nis: "20240001",
    unitId: "d721a4c9-36c4-4f3d-9da9-6e4a7753a9c2",
    user: {
      id: "25489a68-ec16-485e-98b9-7e30203d4728",
      name: "Muhammad Rizky",
    },
  },
  paymentTypeId: "0ceca3e3-3890-46b8-9bf8-2e8e9a8b6e01",
  paymentType: {
    id: "0ceca3e3-3890-46b8-9bf8-2e8e9a8b6e01",
    name: "SPP Bulanan",
    code: "SPP",
  },
  // Prisma Decimal serialises as a string.
  amount: "500000",
  paidAmount: "0",
  dueDate: "2026-09-10T00:00:00.000Z",
  status: "PENDING",
  period: "September 2026",
  notes: "Tagihan SPP untuk bulan September",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

export function paymentFromApi(
  verificationStatus: Payment["verificationStatus"],
): Payment {
  return {
    id: "9f1c2b7e-0000-4000-8000-000000000001",
    invoiceId: invoiceFromApi.id,
    invoice: {
      ...invoiceFromApi,
      student: {
        ...invoiceFromApi.student!,
        enrollments: [{ class: { id: "c-8a", name: "VIII A" } }],
      },
    },
    amount: "500000",
    method: "BANK_TRANSFER",
    referenceNo: "TRX-88120",
    proofUrl: null,
    paidAt: "2026-09-08T03:00:00.000Z",
    notes: null,
    verificationStatus,
    createdAt: "2026-09-08T03:00:00.000Z",
    updatedAt: "2026-09-08T03:00:00.000Z",
  };
}
