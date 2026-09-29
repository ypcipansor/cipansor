"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { toast } from "sonner";
import { AxiosError } from "axios";

/**
 * Global error handler for API errors
 */
function handleQueryError(error: unknown) {
  // A request that opted out of the error toast (it shows the reason itself,
  // e.g. on a form field) opts out here too; the axios interceptor honours the
  // same flag. Without this the flag silenced one toast and left the other.
  if (error instanceof AxiosError && error.config?.skipErrorToast) return;
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    // Handle specific status codes
    switch (status) {
      case 401:
        toast.error("Sesi Anda telah berakhir. Silakan login kembali.");
        break;
      case 403:
        toast.error("Anda tidak memiliki akses untuk melakukan tindakan ini.");
        break;
      case 404:
        toast.error("Data tidak ditemukan.");
        break;
      case 422:
        toast.error(`Validasi gagal: ${message}`);
        break;
      case 429:
        toast.error("Terlalu banyak permintaan. Silakan coba lagi nanti.");
        break;
      case 500:
      case 502:
      case 503:
        toast.error("Server sedang bermasalah. Silakan coba lagi nanti.");
        break;
      default:
        toast.error(message || "Terjadi kesalahan. Silakan coba lagi.");
    }
  } else if (error instanceof Error) {
    toast.error(error.message);
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            // This is a server-backed admin app with no offline-first
            // behaviour. The default networkMode "online" pauses every query
            // whenever navigator.onLine is false — a flag that is unreliable
            // (false negatives in headless/CI browsers, VMs and some
            // networks), which freezes the whole UI behind the offline
            // banner even when the backend is reachable. "always" makes
            // queries attempt regardless and surface real errors normally.
            networkMode: "always",
            retry: (failureCount, error) => {
              // Don't retry on 4xx errors
              if (error instanceof AxiosError) {
                const status = error.response?.status;
                if (status && status >= 400 && status < 500) {
                  return false;
                }
              }
              // Retry up to 2 times for other errors
              return failureCount < 2;
            },
          },
          mutations: {
            networkMode: "always",
            onError: handleQueryError,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
