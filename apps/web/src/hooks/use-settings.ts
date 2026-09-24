import { useQuery } from "@tanstack/react-query";
import api, { ApiResponse } from "@/lib/api";
import { siteConfig, addressLines } from "@/config/site";

export interface Settings {
  institutionName: string;
  institutionAddress: string;
  institutionPhone: string;
  institutionEmail: string;
  institutionLogo?: string;
  currency: string;
  timezone: string;
  dateFormat: string;
}

/**
 * The yayasan's own identity, from the verified public facts in
 * `@cipansor/shared` (siteConfig).
 *
 * There is no GET /settings route, so this fallback is what every caller
 * actually gets. It used to be an invented institution — "Yayasan Pendidikan
 * Islam Al-Hidayah, Jl. Pendidikan No. 123, (021) 1234567" — and the payment
 * receipt printed it as the letterhead.
 */
const defaultSettings: Settings = {
  institutionName: siteConfig.legalName,
  institutionAddress: addressLines.join(", "),
  institutionPhone: siteConfig.contact.phone,
  institutionEmail: siteConfig.contact.email,
  institutionLogo: undefined,
  currency: "IDR",
  timezone: "Asia/Jakarta",
  dateFormat: "dd/MM/yyyy",
};

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      try {
        const response = await api.get<ApiResponse<Settings>>("/settings");
        return response.data.data;
      } catch {
        // Return default settings if API is not available
        return defaultSettings;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  });
}
