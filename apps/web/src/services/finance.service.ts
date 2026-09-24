/**
 * Finance API Service
 * Centralized API calls for finance management
 */

import { api } from "@/lib/api";
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  DateRangeParams,
  UnitFilterParams,
} from "./types";

export type InvoiceStatus =
  "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentMethod = "CASH" | "TRANSFER" | "WALLET" | "VIRTUAL_ACCOUNT";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: InvoiceStatus;
  dueDate: string;
  description: string;
  items: InvoiceItem[];
  payments: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  amount: number;
  quantity: number;
  total: number;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
  processedById: string;
  createdAt: string;
}

export interface CreateInvoiceInput {
  studentId: string;
  dueDate: string;
  description: string;
  items: Array<{
    description: string;
    amount: number;
    quantity: number;
  }>;
}

export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface FinanceSummary {
  totalBilled: number;
  totalPaid: number;
  totalUnpaid: number;
  totalOverdue: number;
  overdueInvoiceCount: number;
  collectionRate: number;
}

export interface ListInvoiceParams
  extends PaginationParams, DateRangeParams, UnitFilterParams {
  studentId?: string;
  status?: InvoiceStatus;
  search?: string;
}

export interface ListPaymentParams
  extends PaginationParams, DateRangeParams, UnitFilterParams {
  invoiceId?: string;
  paymentMethod?: PaymentMethod;
}

/**
 * Finance Service
 */
export const financeService = {
  // Invoice Methods

  /**
   * Get paginated list of invoices
   */
  async listInvoices(
    params?: ListInvoiceParams,
  ): Promise<PaginatedResponse<Invoice>> {
    const response = await api.get<PaginatedResponse<Invoice>>(
      "/finance/invoices",
      {
        params,
      },
    );
    return response.data;
  },

  /**
   * Get single invoice by ID
   */
  async getInvoice(id: string): Promise<Invoice> {
    const response = await api.get<ApiResponse<Invoice>>(
      `/finance/invoices/${id}`,
    );
    return response.data.data;
  },

  /**
   * Create new invoice
   */
  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const response = await api.post<ApiResponse<Invoice>>(
      "/finance/invoices",
      input,
    );
    return response.data.data;
  },

  /**
   * Update invoice
   */
  async updateInvoice(
    id: string,
    input: Partial<CreateInvoiceInput>,
  ): Promise<Invoice> {
    const response = await api.patch<ApiResponse<Invoice>>(
      `/finance/invoices/${id}`,
      input,
    );
    return response.data.data;
  },

  /**
   * Cancel invoice
   */
  async cancelInvoice(id: string, reason?: string): Promise<Invoice> {
    const response = await api.post<ApiResponse<Invoice>>(
      `/finance/invoices/${id}/cancel`,
      { reason },
    );
    return response.data.data;
  },

  /**
   * Send invoice reminder
   */
  async sendReminder(id: string): Promise<{ sent: boolean; method: string }> {
    const response = await api.post<
      ApiResponse<{ sent: boolean; method: string }>
    >(`/finance/invoices/${id}/remind`);
    return response.data.data;
  },

  // Payment Methods

  /**
   * Get paginated list of payments
   */
  async listPayments(
    params?: ListPaymentParams,
  ): Promise<PaginatedResponse<PaymentRecord>> {
    const response = await api.get<PaginatedResponse<PaymentRecord>>(
      "/finance/payments",
      {
        params,
      },
    );
    return response.data;
  },

  /**
   * Create payment for invoice
   */
  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const response = await api.post<ApiResponse<PaymentRecord>>(
      "/finance/payments",
      input,
    );
    return response.data.data;
  },

  /**
   * Get payment by ID
   */
  async getPayment(id: string): Promise<PaymentRecord> {
    const response = await api.get<ApiResponse<PaymentRecord>>(
      `/finance/payments/${id}`,
    );
    return response.data.data;
  },

  // Summary Methods

  /**
   * Get finance summary statistics
   */
  async getSummary(
    params?: UnitFilterParams & DateRangeParams,
  ): Promise<FinanceSummary> {
    const response = await api.get<ApiResponse<FinanceSummary>>(
      "/finance/summary",
      {
        params,
      },
    );
    return response.data.data;
  },

  /**
   * Get student finance summary
   */
  async getStudentSummary(studentId: string): Promise<{
    totalBilled: number;
    totalPaid: number;
    totalUnpaid: number;
    invoices: Invoice[];
  }> {
    const response = await api.get<
      ApiResponse<{
        totalBilled: number;
        totalPaid: number;
        totalUnpaid: number;
        invoices: Invoice[];
      }>
    >(`/finance/students/${studentId}/summary`);
    return response.data.data;
  },

  // Report Methods

  /**
   * Generate finance report
   */
  async generateReport(params: {
    type: "daily" | "monthly" | "yearly" | "custom";
    startDate?: string;
    endDate?: string;
    unitId?: string;
    format?: "json" | "csv" | "pdf";
  }): Promise<Blob | object> {
    const response = await api.get("/finance/reports", {
      params,
      responseType: params.format === "json" ? "json" : "blob",
    });
    return response.data;
  },

  /**
   * Export invoices
   */
  async exportInvoices(
    params?: ListInvoiceParams & { format?: "csv" | "pdf" },
  ): Promise<Blob> {
    const response = await api.get("/finance/invoices/export", {
      params,
      responseType: "blob",
    });
    return response.data;
  },
};
