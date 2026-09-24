import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Halaman "Buat Keputusan Baru" — dua regresi finding 1.
 *
 * 1. Naskah dengan aksara yang tidak dapat dicetak (emoji) ditolak peladen
 *    dengan 400 yang menyebut field + aksara. Formulir dulu menelannya menjadi
 *    "Gagal menyimpan keputusan. Periksa kembali isian Anda." — pengguna tidak
 *    pernah tahu aksara mana yang salah, sementara keputusan dengan aksara itu
 *    TERIKAT ke naskah (tidak dapat diedit) dan menggantung VOTING.
 *
 * 2. Petunjuk lembut (`pdf-glyph-hint`) harus muncul saat mengetik aksara
 *    berisiko, supaya pengguna tidak menulis naskah panjang lalu ditolak.
 *
 * Keduanya diuji lewat hook NYATA dengan axios di-mock, bukan teks sumber.
 */

const { get, post, routerPush } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("@/lib/api", () => {
  const api = { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { api, default: api };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared", () => ({
  AccessDenied: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: {
      id: "u1",
      userRoles: [{ role: { code: "YAYASAN_PEMBINA" }, isActive: true }],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Select Radix di-mock menjadi `<select>` native agar perubahan pilihan
// deterministik di jsdom; yang diuji adalah logika state/pesan, bukan Radix.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => (
    <select
      data-testid="mock-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import NewFoundationDecisionPage from "./page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NewFoundationDecisionPage />
    </QueryClientProvider>,
  );
}

/** Opsi create dari peladen: satu organ saja, agar form langsung operasional. */
function createOptions() {
  return {
    data: {
      data: {
        allowedOrgans: [
          {
            organType: "PEMBINA",
            decisionTypes: ["pengesahan-rencana-kerja"],
          },
        ],
      },
    },
  };
}

function axiosError(status: number, body: Record<string, unknown>) {
  const err = new Error(`Request failed ${status}`) as Error & {
    response?: { status: number; data: unknown };
    isAxiosError?: boolean;
  };
  err.isAxiosError = true;
  err.response = { status, data: body };
  return err;
}

async function fillAndSubmit(subject?: string) {
  fireEvent.change(
    await screen.findByPlaceholderText(/Pengesahan Rencana Kerja/),
    { target: { value: subject ?? "Pengesahan Rencana Kerja 2026" } },
  );
  fireEvent.change(screen.getByPlaceholderText(/Uraian keputusan/), {
    target: { value: "Rencana kerja tahunan yayasan disahkan." },
  });
  fireEvent.click(screen.getByRole("button", { name: /Buka Voting/ }));
}

describe("Buat Keputusan Baru — aksara tak-tercetak", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    routerPush.mockReset();
    get.mockResolvedValue(createOptions());
  });

  /**
   * Regresi: pesan 400 PELADEN (yang menyebut aksara tak-tercetak) harus
   * tampil apa adanya, bukan diganti kalimat generik.
   */
  it("menampilkan pesan peladen yang menyebut aksara tak-tercetak", async () => {
    post.mockRejectedValue(
      axiosError(400, {
        success: false,
        message:
          "Naskah memuat aksara yang tidak dapat dicetak ke risalah: subject (🎉). Hapus aksara tersebut lalu buat ulang keputusan.",
      }),
    );
    renderPage();
    await fillAndSubmit();

    expect(
      await screen.findByText(/aksara yang tidak dapat dicetak ke risalah/),
    ).toBeTruthy();
    // Bukan kalimat generik yang menyembunyikan penyebabnya.
    expect(screen.queryByText(/Periksa kembali isian Anda/)).toBeNull();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("menampilkan pesan galat server (bukan pesan generik formulir) pada 5xx", async () => {
    post.mockRejectedValue(axiosError(500, {}));
    renderPage();
    await fillAndSubmit();
    expect(
      await screen.findByText(/Terjadi kesalahan pada server/),
    ).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });

  /**
   * Regresi: petunjuk lembut muncul saat aksara berisiko diketik, dan TIDAK
   * muncul untuk teks biasa. Ini mencegah pengguna menemukan masalah hanya di
   * penolakan 400 setelah naskah panjang.
   */
  it("menampilkan petunjuk aksara berisiko saat emoji diketik", async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(
      /Pengesahan Rencana Kerja/,
    );
    expect(screen.queryByTestId("pdf-glyph-hint")).toBeNull();
    fireEvent.change(input, { target: { value: "Pengesahan 🎉 2026" } });
    const hint = await screen.findByTestId("pdf-glyph-hint");
    expect(hint.textContent).toMatch(/tidak dapat dicetak/);
    expect(hint.textContent).toContain("🎉");
  });

  it("tidak menampilkan petunjuk untuk teks ASCII biasa", async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(
      /Pengesahan Rencana Kerja/,
    );
    fireEvent.change(input, {
      target: { value: "Pengesahan Rencana Kerja 2026" },
    });
    await waitFor(() =>
      expect(screen.queryByTestId("pdf-glyph-hint")).toBeNull(),
    );
  });
});