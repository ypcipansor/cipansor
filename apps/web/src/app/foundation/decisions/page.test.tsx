import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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

/**
 * Rekam PROP yang halaman teruskan ke `Pagination`, sambil tetap merender
 * komponen ASLI (tombol halaman sungguhan tetap diuji). Memilih item Radix
 * Select lewat event pointer tidak deterministik di jsdom, sedangkan yang
 * diregresikan adalah kontrak yang halaman berikan ke komponen.
 */
const paginationProps = vi.hoisted(() => ({
  last: null as null | { pageSizeOptions?: number[]; onPageSizeChange?: (n: number) => void },
}));
vi.mock("@/components/shared/pagination", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shared/pagination")>();
  return {
    Pagination: (props: Parameters<typeof actual.Pagination>[0]) => {
      paginationProps.last = props;
      return actual.Pagination(props);
    },
  };
});

import FoundationDecisionsPage from "./page";
import {
  listFoundationDecisionsQuerySchema,
  FOUNDATION_DECISIONS_MAX_PAGE_SIZE,
  FOUNDATION_DECISIONS_PAGE_SIZE_OPTIONS,
} from "@cipansor/shared";

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

  /**
   * Regresi: opsi ukuran halaman terbesar WAJIB valid menurut kontrak API.
   *
   * `Pagination` default-nya menawarkan 100, sedangkan
   * `listFoundationDecisionsQuerySchema` membatasi `limit` maksimum 50. Memilih
   * "100" dulu mengirim `limit=100`, ditolak Zod di edge, dan SELURUH daftar
   * berubah menjadi galat. Kontrak ukuran halaman kini berasal dari
   * `@cipansor/shared`, dan uji ini mengunci bahwa setiap opsi yang ditampilkan
   * lolos schema.
   */
  it("semua opsi ukuran halaman lolos schema API (regresi limit=100)", () => {
    for (const size of FOUNDATION_DECISIONS_PAGE_SIZE_OPTIONS) {
      expect(
        listFoundationDecisionsQuerySchema.safeParse({ page: 1, limit: size })
          .success,
        `limit=${size} harus valid`,
      ).toBe(true);
    }
    expect(Math.max(...FOUNDATION_DECISIONS_PAGE_SIZE_OPTIONS)).toBe(
      FOUNDATION_DECISIONS_MAX_PAGE_SIZE,
    );
    // Nilai default lama (100) memang DITOLAK — inilah bug regresinya.
    expect(
      listFoundationDecisionsQuerySchema.safeParse({ page: 1, limit: 100 })
        .success,
    ).toBe(false);
  });

  it("memilih ukuran halaman terbesar memuat data tanpa galat", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Keputusan dec-1-1")).toBeDefined(),
    );

    const largest = Math.max(...FOUNDATION_DECISIONS_PAGE_SIZE_OPTIONS);

    // Opsi yang halaman teruskan harus lolos schema API (regresi limit=100).
    const opts = paginationProps.last?.pageSizeOptions ?? [];
    expect(opts).toEqual([...FOUNDATION_DECISIONS_PAGE_SIZE_OPTIONS]);
    expect(opts).not.toContain(100);

    // Memilih opsi terbesar benar-benar mengirim `limit` valid ke API.
    act(() => paginationProps.last?.onPageSizeChange?.(largest));

    await waitFor(() => {
      const [, config] = get.mock.calls[get.mock.calls.length - 1];
      expect(config?.params).toMatchObject({ page: 1, limit: largest });
    });
    expect(screen.queryByText(/Gagal memuat daftar keputusan/)).toBeNull();
    expect(await screen.findByText("Keputusan dec-1-1")).toBeDefined();
  });
});
