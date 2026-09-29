import { useQuery } from "@tanstack/react-query";
import type { TwoFactorStatus } from "@cipansor/shared";
import { authApi } from "@/lib/api";

/**
 * The account's 2FA state: on or off, mandatory for its roles, and invited to
 * turn it on after signing in. Keyed by user, so a different account signing
 * in on the same tab never reads the previous one's answer.
 */
export function useTwoFactorStatus(userId: string | undefined, enabled = true) {
  return useQuery<TwoFactorStatus>({
    queryKey: ["auth", "2fa-status", userId],
    queryFn: async () => (await authApi.get2FAStatus()).data.data,
    enabled: enabled && !!userId,
    staleTime: 0,
  });
}
