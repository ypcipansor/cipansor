import { useQuery } from "@tanstack/react-query";
import type { EnvironmentInfo } from "@cipansor/shared";
import api, { ApiResponse } from "@/lib/api";

/**
 * What the API says about the copy of the system this page runs against
 * (GET /api/environment). Staging and production run the same web build, so
 * whether this is a test copy is asked at run time, once per visit.
 */
export function useEnvironment() {
  return useQuery({
    queryKey: ["environment"],
    queryFn: async () => {
      const response =
        await api.get<ApiResponse<EnvironmentInfo>>("/environment");
      return response.data.data;
    },
    staleTime: Infinity,
    retry: false,
  });
}
