import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export type PaymentVerificationStatus =
  | "PENDING_VERIFICATION"
  | "TU_APPROVED"
  | "FINAL_APPROVED"
  | "REJECTED";

export interface VerifiablePayment {
  id: string;
  amount: string | number;
  method: string;
  referenceNo?: string | null;
  proofUrl?: string | null;
  verificationStatus: PaymentVerificationStatus;
  rejectionReason?: string | null;
  createdAt: string;
  tuVerifiedBy?: { id: string; name: string } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    amount: string | number;
    paidAmount: string | number;
    student: {
      id: string;
      nisn: string;
      user: { name: string };
    };
    paymentType: { name: string };
  };
}

interface VerificationQueue {
  success: boolean;
  data: VerifiablePayment[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** TU verification queue (GET /finance/payments/verifications). */
export function usePaymentVerifications(
  status: PaymentVerificationStatus = "PENDING_VERIFICATION",
  page = 1,
) {
  return useQuery({
    queryKey: ["finance", "payment-verifications", status, page],
    queryFn: async () => {
      const response = await api.get<VerificationQueue>(
        "/finance/payments/verifications",
        { params: { status, page, limit: 20 } },
      );
      return response.data;
    },
  });
}

/** Advance the verification state machine (POST /finance/payments/:id/verify). */
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      paymentId: string;
      action: "TU_APPROVE" | "FINAL_APPROVE" | "REJECT";
      rejectionReason?: string;
    }) => {
      const response = await api.post(
        `/finance/payments/${input.paymentId}/verify`,
        { action: input.action, rejectionReason: input.rejectionReason },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["finance", "payment-verifications"],
      });
    },
  });
}
