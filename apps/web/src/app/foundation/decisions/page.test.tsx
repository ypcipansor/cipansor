import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Daftar keputusan WAJIB benar-benar men-paginasi.
 *
 * Regresi yang dipaku di sini: halaman pernah memanggil
 * `useFoundationDecisions({ organType, status })` tanpa `page`/`limit`, sehingga
 * hook selalu meminta halaman default dan `pagination.total` dari peladen
 * diabaikan. Keputusan ke-11 dan seterusnya tak pernah dapat ditemukan pengguna
 * — daftar tata kelola yang "berhenti pada sepuluh baris" — dan tak ada kontrol
 * apa pun untuk berpindah halaman.
 *
 * Uji ini memakai hook NYATA (`useFoundationDecisions`) dengan axios di-mock,
 * lalu memeriksa parameter yang benar-benar dikirim ke API dan bahwa tombol
 * halaman berikutnya memuat halaman 2. Yang diuji adalah perilaku, bukan teks
 * sumber.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api", () => {
  const api = { get };
  return { api, default: api };
});

vi.mock("@/components/layout/main-layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: null }),
}));

import FoundationDecisionsPage from "./page";

/** QueryClient segar per render; retry dimatikan agar error state cepat tampil. */
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<FoundationDecisionsPage />, { wrapper: Wrapper });
}

/** Satu baris keputusan sintetis untuk halaman tertentu. */
function row(page: number, i: number) {
  const id = `dec-${page}-${i}`;
  return {
    id,
    organType: "PENGAWAS",
    kind: "CIRCULAR",
    status: "VOTING",
    subject: `Keputusan ${id}`,
    decisionType: "pemberhentian-sementara-pengurus",
    quorumSnapshot: {
      organType: "PENGAWAS",
      kind: "CIRCULAR",
      activeCount: 1,
      presentMode: "MUTLAK",
      presentValue: 1,
      decisionMode: "MUTLAK",
      decisionValue: 1,
    },
    voteSummary: { approve: 0, reject: 0, abstain: 0, present: 0, active: 1, totalVotes: 0 },
    finalPdfDigest: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    memberCount: 1,
    votedCount: 0,
  };
}

/**
 * Dua puluh keputusan, dilayani per halaman sesuai `page`/`limit` yang
 * diminta — persis seperti endpoint nyata.
 */
function mockApi() {
  get.mockImplementation((_url: string, config?: { params?: Record<string, number> }) => {
    const page = config?.params?.page ?? 1;
    const limit = config?.params?.limit ?? 10;
    const all = Array.from({ length: 20 }, (_, i) => row(1, i + 1));
    const start = (page - 1) * limit;
    return Promise.resolve({
      data: {
        data: all.slice(start, start + limit),
        pagination: { page, limit, total: all.length },
      },
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
  // Radix Select memakai Pointer Capture API yang tidak disediakan jsdom;
  // tanpa shim ini membuka Select melempar `hasPointerCapture is not a
  // function` dan pilihannya tak pernah muncul.
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("daftar keputusan — pagination", () => {
  it("mengirim page & limit ke API pada permintaan pertama", async () => {
    renderPage();

    await waitFor(() => expect(get).toHaveBeenCalled());
    const [, config] = get.mock.calls[0];
    expect(config?.params).toMatchObject({ page: 1, limit: 10 });
  });

  it("menampilkan sepuluh baris pada halaman pertama dari total dua puluh", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Keputusan dec-1-1")).toBeDefined(),
    );
    expect(screen.getByText("Keputusan dec-1-10")).toBeDefined();
    // Keputusan ke-11 TIDAK ada di halaman 1.
    expect(screen.queryByText("Keputusan dec-1-11")).toBeNull();
    expect(screen.getByText(/Page/)).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
  });

  it("memuat halaman berikutnya sehingga keputusan ke-11 dapat diakses", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Keputusan dec-1-1")).toBeDefined(),
    );

    // Tombol "next" adalah kontrol ke-3 (first, prev, next, last).
    const pager = screen.getAllByRole("button");
    await userEvent.click(pager[pager.length - 2]);

    await waitFor(() =>
      expect(screen.getByText("Keputusan dec-1-11")).toBeDefined(),
    );
    // Permintaan terakhir benar-benar meminta halaman 2.
    const [, config] = get.mock.calls[get.mock.calls.length - 1];
    expect(config?.params).toMatchObject({ page: 2, limit: 10 });
  });

  it("menampilkan pesan galat saat permintaan gagal, bukan daftar kosong palsu", async () => {
    get.mockRejectedValue(new Error("network down"));
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/Gagal memuat daftar keputusan/)).toBeDefined(),
    );
  });
});
