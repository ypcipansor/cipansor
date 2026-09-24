import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/api", () => {
  const api = { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
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
    </QueryClientProvider>,
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
      axiosError(404, { success: false, message: "tidak ada" }),
    );
    renderPage();
    expect(await screen.findByText(/Keputusan tidak ditemukan\./)).toBeTruthy();
  });

  it("403 → 'Akses ditolak', bukan not-found", async () => {
    get.mockRejectedValue(
      axiosError(403, { success: false, message: "dilarang" }),
    );
    renderPage();
    expect(await screen.findByText("Akses ditolak")).toBeTruthy();
    expect(screen.queryByText(/Keputusan tidak ditemukan\./)).toBeNull();
  });

  it("500 → galat server dengan tombol 'Coba lagi', bukan not-found", async () => {
    get.mockRejectedValue(
      axiosError(500, { success: false, message: "server" }),
    );
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Coba lagi/ }),
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
      await screen.findByRole("button", { name: /Coba lagi/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/Keputusan tidak ditemukan\./)).toBeNull();
  });
});

/**
 * Regresi: kegagalan MEMBERI SUARA tidak boleh semuanya diterjemahkan menjadi
 * "Passphrase salah".
 *
 * `submitVote` dulu menangkap tanpa argumen dan selalu menulis "Passphrase
 * salah atau kunci tidak dapat digunakan." Akibatnya 403 (bukan anggota organ
 * / sudah offboard), 400 (sudah memilih, sirkuler tanpa alasan), 409 (baris
 * suara lama tidak sah) dan 5xx tampak seperti passphrase keliru — anggota
 * yang haknya sudah dicabut disuruh menebak ulang passphrase yang tidak pernah
 * salah. Uji ini mengunci bahwa pesan SERVER ditampilkan apa adanya.
 */
function votingDecision() {
  return {
    id: "dec-1",
    subject: "Keputusan Uji",
    body: "Isi",
    organType: "PEMBINA",
    kind: "MEETING",
    decisionType: "RAPAT",
    status: "VOTING",
    quorumSnapshot: {
      activeCount: 3,
      quorumMode: "MAJORITY",
      presentRequired: 2,
      approveRequired: 2,
      snapshotAt: new Date().toISOString(),
    },
    voteSummary: { approve: 0, reject: 0, abstain: 0, total: 0 },
    finalPdfDigest: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
    createdByName: "Admin",
    decidedByName: null,
    memberCount: 3,
    votedCount: 0,
    members: [],
    votes: [],
    verificationToken: null,
    publication: "PRIVATE",
    canVote: true,
    canFinalize: true,
    canCancel: false,
    publishable: false,
    myVote: null,
  };
}

async function openVoteAndSubmit() {
  get.mockResolvedValue({ data: { data: votingDecision() } });
  renderPage();
  fireEvent.click(
    await screen.findByRole("button", { name: /Tandatangani & Suara/ }),
  );
  fireEvent.change(await screen.findByPlaceholderText(/Passphrase pribadi/), {
    target: { value: "rahasia" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Tandatangani$/ }));
}

describe("halaman detail keputusan — pesan galat pemberian suara", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("401 → pesan passphrase dari server", async () => {
    post.mockRejectedValue(
      axiosError(401, {
        success: false,
        message: "Passphrase tanda tangan salah. Sisa percobaan: 2.",
      }),
    );
    await openVoteAndSubmit();
    expect(
      await screen.findByText(
        /Passphrase tanda tangan salah\. Sisa percobaan: 2\./,
      ),
    ).toBeTruthy();
  });

  it("403 → pesan 'bukan anggota organ', BUKAN passphrase salah", async () => {
    post.mockRejectedValue(
      axiosError(403, {
        success: false,
        message: "Anda bukan anggota organ yang berhak memutus keputusan ini.",
      }),
    );
    await openVoteAndSubmit();
    expect(await screen.findByText(/bukan anggota organ/)).toBeTruthy();
    expect(screen.queryByText(/Passphrase salah atau kunci/)).toBeNull();
  });

  it("409 → pesan rekonsiliasi baris suara lama, BUKAN passphrase salah", async () => {
    post.mockRejectedValue(
      axiosError(409, {
        success: false,
        message:
          "Ada baris suara lama yang tidak sah untuk akun ini pada keputusan tersebut.",
      }),
    );
    await openVoteAndSubmit();
    expect(
      await screen.findByText(/baris suara lama yang tidak sah/),
    ).toBeTruthy();
    expect(screen.queryByText(/Passphrase salah atau kunci/)).toBeNull();
  });

  it("500 → pesan server, BUKAN passphrase salah", async () => {
    post.mockRejectedValue(
      axiosError(500, { success: false, message: "Terjadi kesalahan server." }),
    );
    await openVoteAndSubmit();
    expect(await screen.findByText(/Terjadi kesalahan server\./)).toBeTruthy();
    expect(screen.queryByText(/Passphrase salah atau kunci/)).toBeNull();
  });

  it("sukses → dialog tertutup dan tidak ada pesan galat", async () => {
    post.mockResolvedValue({
      data: {
        data: { voteId: "v1", choice: "APPROVE", outcome: "VOTING" },
      },
    });
    await openVoteAndSubmit();
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/Passphrase pribadi/)).toBeNull(),
    );
  });
});
