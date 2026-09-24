import { useQuery } from "@tanstack/react-query";
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
 * It used to be an invented institution — "Yayasan Pendidikan
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

/**
 * Institution settings for printed documents (the payment receipt).
 *
 * Deliberately local: there is no GET /settings route, and calling it made
 * every receipt open with a "Route GET /api/settings not found" error toast.
 * Kept as a query so callers need not change if a settings API arrives.
 */
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => defaultSettings,
    staleTime: Infinity,
  });
}
