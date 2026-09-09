import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";

/**
 * SSO configuration (Google Workspace & Microsoft 365) fetched through a
 * React Query hook so the login page follows the app's data-layer convention
 * instead of calling the Axios instance directly.
 */
export const useSSOConfig = () => {
  return useQuery({
    queryKey: ["sso-config"],
    queryFn: async () => {
      const res = await authApi.getSSOConfig();
      return res.data.data;
    },
    // Config rarely changes; avoid refetching on every focus/mount.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
};
