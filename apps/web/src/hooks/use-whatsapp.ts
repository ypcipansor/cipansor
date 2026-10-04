"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// ============================================
// TYPES
// ============================================

export interface WhatsAppMessage {
  to: string;
  message: string;
  type: "text" | "template";
  templateName?: string;
  templateParams?: string[];
}

export interface WhatsAppStatus {
  provider: string;
  configured: boolean;
  testResult?: {
    success: boolean;
    messageId?: string;
    error?: string;
  };
}

// ============================================
// QUERY KEYS
// ============================================

export const whatsappKeys = {
  all: ["whatsapp"] as const,
  status: () => [...whatsappKeys.all, "status"] as const,
};

// ============================================
// HOOKS
// ============================================

// Get WhatsApp provider status
export function useWhatsAppStatus() {
  return useQuery({
    queryKey: whatsappKeys.status(),
    queryFn: async () => {
      const response = await apiClient.get("/notifications/whatsapp/status");
      return response.data as WhatsAppStatus;
    },
  });
}

// Send single WhatsApp message
export function useSendWhatsApp() {
  return useMutation({
    mutationFn: async (data: WhatsAppMessage) => {
      const response = await apiClient.post(
        "/notifications/whatsapp/send",
        data,
      );
      return response.data;
    },
  });
}

// Send daily report via WhatsApp
export function useSendDailyReportWhatsApp() {
  return useMutation({
    mutationFn: async (reportId: string) => {
      const response = await apiClient.post(
        `/daily-report/${reportId}/send-whatsapp`,
      );
      return response.data;
    },
  });
}

// Send tahfidz progress via WhatsApp
export function useSendTahfidzWhatsApp() {
  return useMutation({
    mutationFn: async (progressId: string) => {
      const response = await apiClient.post(
        `/tahfidz/${progressId}/send-whatsapp`,
      );
      return response.data;
    },
  });
}
