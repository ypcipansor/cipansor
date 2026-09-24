import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Halaman Aturan Kuorum tidak boleh membocorkan suntingan antar organ.
 *
 * Regresi: `useEffect` pemuat form bergantung pada `[stored, kind]` saja.
 * `stored` bernilai `undefined` BAIK untuk "organ ini belum punya aturan"
 * maupun "aturan masih dimuat", sehingga berpindah antara dua organ yang
 * dua-duanya belum punya aturan TIDAK mengubah `stored` dan efek tak berjalan:
 * suntingan yang belum disimpan dari organ sebelumnya tertinggal, lalu
 * tersimpan ke organ yang baru. `organType` kini ada di daftar dependensi.
 *
 * Select Radix di-mock menjadi `<select>` native agar perubahan pilihan
 * deterministik di jsdom; yang diuji adalah logika state/efek halaman, bukan
 * internal Radix.
 */

const { get, put, userMock } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  userMock: { current: null as unknown },
}));

vi.mock("@/lib/api", () => {
  const api = { get, post: vi.fn(), put, patch: vi.fn(), delete: vi.fn() };
  return { api, default: api };
});

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: userMock.current,
    isAuthenticated: !!userMock.current,
    isLoading: false,
  }),
}));

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/shared", () => ({
  AccessDenied: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="mock-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import FoundationRulesPage from "./page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FoundationRulesPage />
    </QueryClientProvider>,
  );
}

/** Select organ adalah mock-select pertama; kedua = cara keputusan. */
function organSelect() {
  return screen.getAllByTestId("mock-select")[0];
}
function kindSelect() {
  return screen.getAllByTestId("mock-select")[1];
}
/** Select mode: ke-3 = kuorum hadir, ke-4 = kuorum sah. */
function presentModeSelect() {
  return screen.getAllByTestId("mock-select")[2];
}

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  userMock.current = {
    id: "u1",
    userRoles: [{ isPrimary: true, role: { code: "SUPER_ADMIN" } }],
  };
  // Tidak ada aturan tersimpan untuk organ mana pun.
  get.mockResolvedValue({ data: { data: [] } });
});

describe("halaman aturan kuorum — suntingan tidak bocor antar organ", () => {
  it("berpindah ke organ lain memuat ulang default, bukan suntingan tersisa", async () => {
    renderPage();

    // Tunggu query selesai (tabel "Belum ada aturan tersimpan").
    await waitFor(() =>
      expect(
        screen.getAllByText(/Belum ada aturan tersimpan/).length,
      ).toBeGreaterThan(0),
    );

    // Pakai cara MEETING agar mode kuorum dapat diubah (CIRCULAR dikunci MUTLAK).
    fireEvent.change(kindSelect(), { target: { value: "MEETING" } });

    const before = (presentModeSelect() as HTMLSelectElement).value;

    // Ubah mode kuorum hadir ke nilai yang BUKAN default, tanpa menyimpan.
    const notDefault = before === "TWO_THIRDS" ? "MAJORITY" : "TWO_THIRDS";
    fireEvent.change(presentModeSelect(), { target: { value: notDefault } });
    expect((presentModeSelect() as HTMLSelectElement).value).toBe(notDefault);

    // Pindah ke organ lain yang JUGA belum punya aturan (stored tetap
    // `undefined`). Efek harus berjalan karena `organType` berubah.
    fireEvent.change(organSelect(), { target: { value: "PENGURUS" } });

    await waitFor(() =>
      expect((presentModeSelect() as HTMLSelectElement).value).toBe(before),
    );
    expect((presentModeSelect() as HTMLSelectElement).value).not.toBe(
      notDefault,
    );
  });
});
