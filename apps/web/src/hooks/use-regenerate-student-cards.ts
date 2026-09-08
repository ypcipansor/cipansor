import { useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse } from "@/lib/api";
import { toast } from "sonner";
import type { RegenerateCardsInput, RegenerateCardsResult } from "@cipansor/shared";

/**
 * Regenerate every active student ID card in the current unit/class filter.
 *
 * Wired to `POST /students/id-cards/bulk-regenerate`. This is the migration
 * path for old card QR codes: cards signed with the legacy 8-char hash are
 * deliberately rejected by verification, so admins regenerate them to the
 * 16-char HMAC before strict verification takes over. The backend enforces
 * unit scoping (non-super-admins can only regenerate their own unit).
 */
export function useRegenerateStudentCards() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ unitId, classId }: RegenerateCardsInput) => {
      const response = await api.post<ApiResponse<RegenerateCardsResult>>(
        "/students/id-cards/bulk-regenerate",
        { unitId, classId },
        { skipErrorToast: true },
      );
      return response.data.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["student-id-card-details"],
      });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success(
        `${data.totalRegenerated} kartu pelajar berhasil diregenerasi.`,
      );
    },
    onError: (error: unknown) => {
      toast.error("Gagal meregenerasi kartu pelajar.");
    },
  });
}
