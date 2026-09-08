import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";
import { toast } from "sonner";

// =============== Types ===============

export interface Wallet {
  id: string;
  studentId: string;
  balance: number;
  spendingLimit?: number; // Daily spending limit
  lastTopUp?: string;
  lastTransaction?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    name: string;
    nisn: string;
    class?: {
      id: string;
      name: string;
    };
    unit?: {
      id: string;
      name: string;
    };
  };
}

export type TransactionType = "TOPUP" | "PURCHASE" | "REFUND" | "TRANSFER";

export const TRANSACTION_TYPES: {
  value: TransactionType;
  label: string;
  color: string;
}[] = [
  { value: "TOPUP", label: "Top Up", color: "bg-green-100 text-green-800" },
  { value: "PURCHASE", label: "Pembelian", color: "bg-red-100 text-red-800" },
  { value: "REFUND", label: "Refund", color: "bg-blue-100 text-blue-800" },
  {
    value: "TRANSFER",
    label: "Transfer",
    color: "bg-purple-100 text-purple-800",
  },
];

export type ReferenceType = "CANTEEN" | "LAUNDRY" | "TRANSFER" | "OTHER";

export const REFERENCE_TYPES: { value: ReferenceType; label: string }[] = [
  { value: "CANTEEN", label: "Kantin" },
  { value: "LAUNDRY", label: "Laundry" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "OTHER", label: "Lainnya" },
];

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "QRIS";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Tunai" },
  { value: "BANK_TRANSFER", label: "Transfer Bank" },
  { value: "QRIS", label: "QRIS" },
];

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string;
  referenceType?: ReferenceType;
  reference?: string;
  createdAt: string;
  createdBy?: string;
  wallet?: Wallet;
}

export interface WalletSummary {
  totalWallets: number;
  totalBalance: number;
  averageBalance: number;
  walletsWithLowBalance: number;
  todayTransactions: number;
  todayTopUps: number;
  todayPurchases: number;
}

// =============== Query Keys ===============

export const walletKeys = {
  all: ["wallets"] as const,
  lists: () => [...walletKeys.all, "list"] as const,
  list: (params: WalletParams) => [...walletKeys.lists(), params] as const,
  details: () => [...walletKeys.all, "detail"] as const,
  detail: (studentId: string) => [...walletKeys.details(), studentId] as const,
  transactions: () => [...walletKeys.all, "transactions"] as const,
  transactionList: (params: TransactionParams) =>
    [...walletKeys.transactions(), params] as const,
  studentTransactions: (studentId: string) =>
    [...walletKeys.transactions(), "student", studentId] as const,
  summary: (unitId?: string) => [...walletKeys.all, "summary", unitId] as const,
};

// =============== List Wallets ===============

export interface WalletParams {
  page?: number;
  limit?: number;
  search?: string;
  unitId?: string;
  classId?: string;
  minBalance?: number;
  maxBalance?: number;
}

export function useWallets(params: WalletParams = {}) {
  return useQuery({
    queryKey: walletKeys.list(params),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Wallet>>("/wallet", {
        params,
      });
      return response.data;
    },
  });
}

// =============== Get Single Wallet ===============

export function useWallet(studentId: string) {
  return useQuery({
    queryKey: walletKeys.detail(studentId),
    queryFn: async () => {
      const response = await api.get<ApiResponse<Wallet>>(
        `/wallet/${studentId}`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// =============== Wallet Summary ===============

export function useWalletSummary(unitId?: string) {
  return useQuery({
    queryKey: walletKeys.summary(unitId),
    queryFn: async () => {
      const response = await api.get<ApiResponse<WalletSummary>>(
        "/wallet/summary",
        {
          params: unitId ? { unitId } : undefined,
        },
      );
      return response.data.data;
    },
  });
}

// =============== Transactions ===============

export interface TransactionParams {
  page?: number;
  limit?: number;
  walletId?: string;
  studentId?: string;
  type?: TransactionType;
  referenceType?: ReferenceType;
  startDate?: string;
  endDate?: string;
}

export function useWalletTransactions(params: TransactionParams = {}) {
  return useQuery({
    queryKey: walletKeys.transactionList(params),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<WalletTransaction>>(
        "/wallet/transactions",
        { params },
      );
      return response.data;
    },
  });
}

export function useStudentWalletTransactions(
  studentId: string,
  params: Omit<TransactionParams, "studentId"> = {},
) {
  return useQuery({
    queryKey: walletKeys.studentTransactions(studentId),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<WalletTransaction>>(
        `/wallet/${studentId}/transactions`,
        { params },
      );
      return response.data;
    },
    enabled: !!studentId,
  });
}

// =============== Top Up ===============

export interface TopUpData {
  studentId: string;
  amount: number;
  description?: string;
  paymentMethod?: PaymentMethod;
}

export function useTopUpWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TopUpData) => {
      const response = await api.post<ApiResponse<Wallet>>(
        "/wallet/topup",
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
      queryClient.invalidateQueries({
        queryKey: walletKeys.detail(variables.studentId),
      });
      toast.success("Top up berhasil");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal melakukan top up");
    },
  });
}

// =============== Bulk Top Up ===============

export interface BulkTopUpData {
  studentIds: string[];
  amount: number;
  description?: string;
}

export interface BulkTopUpResult {
  success: number;
  failed: number;
  errors?: { studentId: string; error: string }[];
}

export function useBulkTopUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BulkTopUpData) => {
      const response = await api.post<ApiResponse<BulkTopUpResult>>(
        "/wallet/bulk-topup",
        data,
      );
      return response.data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
      toast.success(
        `Bulk top up selesai: ${result.success} berhasil, ${result.failed} gagal`,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal melakukan bulk top up");
    },
  });
}

// =============== Deduct (Purchase) ===============

export interface DeductData {
  studentId: string;
  amount: number;
  description?: string;
  referenceType?: ReferenceType;
  reference?: string;
}

export function useDeductWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: DeductData) => {
      const response = await api.post<ApiResponse<Wallet>>(
        "/wallet/deduct",
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
      queryClient.invalidateQueries({
        queryKey: walletKeys.detail(variables.studentId),
      });
      toast.success("Pengurangan saldo berhasil");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengurangi saldo");
    },
  });
}

// =============== Transfer ===============

export interface TransferData {
  fromStudentId: string;
  toStudentId: string;
  amount: number;
  description?: string;
}

export interface TransferResult {
  fromWallet: Wallet;
  toWallet: Wallet;
}

export function useTransferWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TransferData) => {
      const response = await api.post<ApiResponse<TransferResult>>(
        "/wallet/transfer",
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
      queryClient.invalidateQueries({
        queryKey: walletKeys.detail(variables.fromStudentId),
      });
      queryClient.invalidateQueries({
        queryKey: walletKeys.detail(variables.toStudentId),
      });
      toast.success("Transfer berhasil");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal melakukan transfer");
    },
  });
}

// =============== Refund ===============

export interface RefundData {
  studentId: string;
  amount: number;
  description: string;
  referenceType?: ReferenceType;
  reference?: string;
}

export function useRefundWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RefundData) => {
      const response = await api.post<ApiResponse<Wallet>>(
        "/wallet/refund",
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
      queryClient.invalidateQueries({
        queryKey: walletKeys.detail(variables.studentId),
      });
      toast.success("Refund berhasil");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal melakukan refund");
    },
  });
}

// =============== Limit Settings ===============

export interface UpdateLimitData {
  studentId: string;
  limit: number;
}

export function useUpdateWalletLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateLimitData) => {
      const response = await api.put<ApiResponse<Wallet>>(
        `/wallet/limit`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
      queryClient.invalidateQueries({
        queryKey: walletKeys.detail(variables.studentId),
      });
      toast.success("Limit belanja berhasil diperbarui");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal memperbarui limit");
    },
  });
}

// =============== Utility Functions ===============

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getTransactionTypeColor(type: TransactionType): string {
  const typeConfig = TRANSACTION_TYPES.find((t) => t.value === type);
  return typeConfig?.color || "bg-gray-100 text-gray-800";
}

export function getTransactionTypeLabel(type: TransactionType): string {
  const typeConfig = TRANSACTION_TYPES.find((t) => t.value === type);
  return typeConfig?.label || type;
}

export function getReferenceTypeLabel(type: ReferenceType): string {
  const typeConfig = REFERENCE_TYPES.find((t) => t.value === type);
  return typeConfig?.label || type;
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  const methodConfig = PAYMENT_METHODS.find((m) => m.value === method);
  return methodConfig?.label || method;
}
