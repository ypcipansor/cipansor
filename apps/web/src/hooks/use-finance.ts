import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";

// Bill types (tagihan)
export interface Bill {
  id: string;
  studentId: string;
  student?: {
    id: string;
    name: string;
    nisn: string;
    class?: {
      id: string;
      name: string;
    };
  };
  academicYearId: string;
  academicYear?: {
    id: string;
    name: string;
  };
  billType: BillType;
  amount: number;
  dueDate: string;
  paidAmount: number;
  status: BillStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type BillType =
  | "SPP"
  | "REGISTRATION"
  | "BUILDING"
  | "UNIFORM"
  | "BOOK"
  | "ACTIVITY"
  | "OTHER";

export const BILL_TYPES: { value: BillType; label: string }[] = [
  { value: "SPP", label: "SPP Bulanan" },
  { value: "REGISTRATION", label: "Biaya Pendaftaran" },
  { value: "BUILDING", label: "Biaya Gedung" },
  { value: "UNIFORM", label: "Seragam" },
  { value: "BOOK", label: "Buku" },
  { value: "ACTIVITY", label: "Kegiatan" },
  { value: "OTHER", label: "Lainnya" },
];

export type BillStatus =
  | "PENDING"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export const BILL_STATUSES: {
  value: BillStatus;
  label: string;
  color: string;
}[] = [
  {
    value: "PENDING",
    label: "Menunggu",
    color: "bg-yellow-100 text-yellow-800",
  },
  {
    value: "PARTIAL",
    label: "Dibayar Sebagian",
    color: "bg-blue-100 text-blue-800",
  },
  { value: "PAID", label: "Lunas", color: "bg-green-100 text-green-800" },
  { value: "OVERDUE", label: "Jatuh Tempo", color: "bg-red-100 text-red-800" },
  {
    value: "CANCELLED",
    label: "Dibatalkan",
    color: "bg-gray-100 text-gray-800",
  },
];

// Payment types (pembayaran)
export interface Payment {
  id: string;
  billId: string;
  bill?: Bill;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  receiptNumber: string;
  notes?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod =
  | "CASH"
  | "TRANSFER"
  | "QRIS"
  | "VIRTUAL_ACCOUNT"
  | "DEBIT_CARD";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Tunai" },
  { value: "TRANSFER", label: "Transfer Bank" },
  { value: "QRIS", label: "QRIS" },
  { value: "VIRTUAL_ACCOUNT", label: "Virtual Account" },
  { value: "DEBIT_CARD", label: "Kartu Debit" },
];

// Bill hooks
export interface BillParams {
  page?: number;
  limit?: number;
  studentId?: string;
  academicYearId?: string;
  billType?: BillType;
  status?: BillStatus;
}

export function useBills(params: BillParams = {}) {
  return useQuery({
    queryKey: ["bills", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Bill>>("/finance/invoices", {
        params,
      });
      return response.data;
    },
  });
}

export function useBill(id: string) {
  return useQuery({
    queryKey: ["bills", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Bill>>(`/finance/invoices/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useStudentBills(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "bills"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Bill[]>>(
        `/students/${studentId}/bills`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

export interface CreateBillData {
  studentId: string;
  academicYearId: string;
  billType: BillType;
  amount: number;
  dueDate: string;
  description?: string;
}

export function useCreateBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBillData) => {
      const response = await api.post<ApiResponse<Bill>>("/finance/invoices", data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({
        queryKey: ["students", variables.studentId, "bills"],
      });
    },
  });
}

export function useCreateBulkBills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentIds: string[];
      academicYearId: string;
      billType: BillType;
      amount: number;
      dueDate: string;
      description?: string;
    }) => {
      const response = await api.post<ApiResponse<Bill[]>>("/finance/invoices/bulk", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
  });
}

export function useUpdateBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateBillData>;
    }) => {
      const response = await api.patch<ApiResponse<Bill>>(`/finance/invoices/${id}`, data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills", variables.id] });
    },
  });
}

export function useDeleteBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/finance/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
  });
}

// Payment hooks
export interface PaymentParams {
  page?: number;
  limit?: number;
  billId?: string;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
}

export function usePayments(params: PaymentParams = {}) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Payment>>("/finance/payments", {
        params,
      });
      return response.data;
    },
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: ["payments", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Payment>>(`/finance/payments/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useBillPayments(billId: string) {
  return useQuery({
    queryKey: ["bills", billId, "payments"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Payment[]>>(
        `/finance/invoices/${billId}/payments`,
      );
      return response.data.data;
    },
    enabled: !!billId,
  });
}

export interface CreatePaymentData {
  billId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  notes?: string;
}

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePaymentData) => {
      const response = await api.post<ApiResponse<Payment>>("/finance/payments", data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({
        queryKey: ["bills", variables.billId, "payments"],
      });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/finance/payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
  });
}

// Financial summary/reports
export interface FinancialSummary {
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  billsByType: {
    type: BillType;
    total: number;
    paid: number;
    outstanding: number;
  }[];
  recentPayments: Payment[];
}

export function useFinancialSummary(academicYearId?: string) {
  return useQuery({
    queryKey: ["financial-summary", academicYearId],
    queryFn: async () => {
      const params = academicYearId ? { academicYearId } : {};
      const response = await api.get<ApiResponse<FinancialSummary>>(
        "/finance/summary",
        { params },
      );
      return response.data.data;
    },
  });
}

export function useStudentFinancialSummary(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "financial-summary"],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          totalBilled: number;
          totalPaid: number;
          totalOutstanding: number;
          bills: Bill[];
        }>
      >(`/students/${studentId}/financial-summary`);
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// =====================================
// SPP MATRIX HOOKS
// =====================================

export interface SppMatrixMonth {
  invoiceId?: string;
  status: "PAID" | "PARTIAL" | "PENDING" | "OVERDUE" | "NOT_BILLED";
  amount: number;
  paidAmount: number;
  dueDate?: string;
}

export interface StudentSppRow {
  studentId: string;
  studentName: string;
  nisn: string;
  className: string;
  months: {
    [month: string]: SppMatrixMonth;
  };
  totalAmount: number;
  totalPaid: number;
}

export interface SppMatrixSummary {
  totalStudents: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
}

export interface SppMatrixData {
  students: StudentSppRow[];
  sppRate: number;
  paymentTypeId: string;
  year: number;
  months: string[];
  summary: SppMatrixSummary;
}

export interface SppMatrixParams {
  unitId?: string;
  classId?: string;
  year?: number;
  paymentTypeId?: string;
}

export function useSppMatrix(params: SppMatrixParams = {}) {
  return useQuery({
    queryKey: ["spp-matrix", params],
    queryFn: async () => {
      const response = await api.get<ApiResponse<SppMatrixData>>(
        "/finance/spp-matrix",
        { params },
      );
      return response.data.data;
    },
  });
}

export interface GenerateSppInvoicesData {
  unitId?: string;
  classId?: string;
  paymentTypeId: string;
  year: number;
  month: number;
  dueDay?: number;
}

export function useGenerateSppInvoices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GenerateSppInvoicesData) => {
      const response = await api.post<
        ApiResponse<{
          created: number;
          skipped: number;
          total: number;
        }>
      >("/finance/spp-matrix/generate", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spp-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
  });
}
