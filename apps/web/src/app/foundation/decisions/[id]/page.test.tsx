import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Detail keputusan WAJIB membedakan kelas kegagalan muat.
 *
 * Regresi yang dipaku di sini: halaman pernah memperlakukan setiap `!d`
 * sebagai "Keputusan tidak ditemukan". 403, 5xx, dan putus jaringan semuanya
 * menyamar sebagai data yang hilang — anggota yang ditolak membaca diberi tahu
 * datanya tidak ada (dan mencari URL lain), sementara gangguan peladen sesaat
 * tampak seperti keputusan yang sudah dihapus. Uji ini mengunci pemisahan
 * 404 → not-found, 403 → akses ditolak, sisanya → galat + coba lagi.
 *
 * Yang diuji perilakunya lewat hook NYATA dengan axios di-mock, bukan teks
 * sumber.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api", () => {
  const api = { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { api, default: api };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "dec-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: null }),
}));

import FoundationDecisionDetailPage from "./page";

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <FoundationDecisionDetailPage />
    </QueryClientProvider>
  );
}

/** Error axios tiruan: `parseApiError` membaca `response.status` + body. */
function axiosError(status: number, body: Record<string, unknown> = {}) {
  const err = new Error(`Request failed ${status}`) as Error & {
    response?: { status: number; data: unknown };
    isAxiosError?: boolean;
  };
  err.isAxiosError = true;
  err.response = { status, data: body };
  return err;
}

describe("halaman detail keputusan — pembedaan kegagalan", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("404 → 'Keputusan tidak ditemukan.'", async () => {
    get.mockRejectedValue(
      axiosError(404, { success: false, message: "tidak ada" })
    );
    renderPage();
    expect(
      await screen.findByText(/Keputusan tidak ditemukan\./)
    ).toBeTruthy();
  });

  it("403 → 'Akses ditolak', bukan not-found", async () => {
    get.mockRejectedValue(
      axiosError(403, { success: false, message: "dilarang" })
    );
    renderPage();
    expect(await screen.findByText("Akses ditolak")).toBeTruthy();
    expect(screen.queryByText(/Keputusan tidak ditemukan\./)).toBeNull();
  });

  it("500 → galat server dengan tombol 'Coba lagi', bukan not-found", async () => {
    get.mockRejectedValue(
      axiosError(500, { success: false, message: "server" })
    );
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Coba lagi/ })
    ).toBeTruthy();
    expect(screen.queryByText(/Keputusan tidak ditemukan\./)).toBeNull();
  });

  it("kegagalan jaringan → galat + coba lagi, bukan not-found", async () => {
    const netErr = new Error("Network Error") as Error & {
      code?: string;
      isAxiosError?: boolean;
    };
    netErr.code = "ERR_NETWORK";
    netErr.isAxiosError = true;
    get.mockRejectedValue(netErr);
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Coba lagi/ })
    ).toBeTruthy();
    expect(screen.queryByText(/Keputusan tidak ditemukan\./)).toBeNull();
  });
});
