import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  ChatbotEscalationRequest,
  ChatbotEscalationResponse,
  ChatbotUsageResponse,
  ChatbotConversationDetail,
  ChatbotConversationListResponse,
  ChatMessage,
  PublicChatRequest,
  PublicChatResponse,
} from "@cipansor/shared";

/**
 * Whether the assistant is configured and reachable.
 *
 * The widget asks before rendering anything. A disabled or unconfigured
 * assistant therefore does not appear at all, rather than appearing and then
 * failing on the visitor's first question — which is the difference between a
 * feature that is off and a feature that looks broken.
 */
export function useChatbotAvailability() {
  return useQuery({
    queryKey: ["chatbot", "status"],
    queryFn: async (): Promise<boolean> => {
      const response = await api.get("/chatbot/public/status");
      return response.data?.data?.available === true;
    },
    // The answer changes only on redeploy, and a failure here should not put
    // the widget into a retry loop on every public page view.
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function usePublicChat() {
  return useMutation({
    mutationFn: async (
      request: PublicChatRequest,
    ): Promise<PublicChatResponse> => {
      // `skipErrorToast`: widget menulis pesannya SENDIRI ke dalam gelembung
      // percakapan, jadi toast global hanya menduplikasinya — dan toast itu
      // menambahkan "Error Code: CHATBOT_BUSY" di bawahnya. Sebuah konstanta
      // teknis di layar orang tua calon santri yang sedang bertanya biaya
      // pendaftaran bukan informasi; ia hanya membuat halaman terasa rusak.
      // Ditemukan dari tangkapan layar, bukan dari uji.
      const response = await api.post("/chatbot/public/ask", request, {
        skipErrorToast: true,
      });
      return response.data.data;
    },
  });
}

/**
 * Meneruskan pertanyaan ke tim Cipansor.
 *
 * `skipErrorToast` dengan alasan yang sama seperti `usePublicChat`: alurnya
 * menulis pesannya sendiri di dalam percakapan, dan toast global hanya
 * menduplikasinya sambil menempelkan kode galat teknis di bawahnya.
 */
export function useEscalateToTeam() {
  return useMutation({
    mutationFn: async (
      request: ChatbotEscalationRequest,
    ): Promise<ChatbotEscalationResponse> => {
      const response = await api.post("/chatbot/public/escalate", request, {
        skipErrorToast: true,
      });
      return response.data.data;
    },
  });
}

/**
 * Daftar percakapan untuk halaman riwayat (super admin).
 *
 * `keepPreviousData` sengaja tidak dipakai: berpindah halaman sambil menahan
 * baris halaman sebelumnya membuat pembacanya mengira sedang melihat data baru
 * padahal belum. Riwayat percakapan dibaca untuk memutuskan sesuatu, jadi
 * keadaan "sedang memuat" lebih baik daripada keadaan yang menyesatkan.
 */
export function useChatbotConversations(params: {
  page: number;
  pageSize?: number;
  onlyRefused?: boolean;
  search?: string;
}) {
  return useQuery({
    queryKey: ["chatbot", "conversations", params],
    queryFn: async (): Promise<ChatbotConversationListResponse> => {
      const response = await api.get("/chatbot/admin/conversations", {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          onlyRefused: params.onlyRefused ? "true" : undefined,
          search: params.search || undefined,
        },
      });
      return response.data.data;
    },
  });
}

/** Satu percakapan lengkap. Tidak diambil sampai ada yang dibuka. */
export function useChatbotConversation(id: string | null) {
  return useQuery({
    queryKey: ["chatbot", "conversation", id],
    queryFn: async (): Promise<ChatbotConversationDetail> => {
      const response = await api.get(`/chatbot/admin/conversations/${id}`);
      return response.data.data;
    },
    enabled: Boolean(id),
  });
}

/**
 * Pemakaian dan taksiran biaya bulan berjalan (super admin).
 *
 * `staleTime` satu menit: angkanya bertambah sepanjang hari, tetapi tidak
 * secepat itu, dan setiap pemuatan ulang adalah kueri agregat atas seluruh
 * bulan.
 */
export function useChatbotUsage() {
  return useQuery({
    queryKey: ["chatbot", "usage"],
    queryFn: async (): Promise<ChatbotUsageResponse> => {
      const response = await api.get("/chatbot/admin/usage");
      return response.data.data;
    },
    staleTime: 60 * 1000,
  });
}

export type { ChatMessage, PublicChatResponse };
