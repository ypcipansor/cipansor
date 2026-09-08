import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mutateAsync = vi.fn();

vi.mock("@/hooks/use-chatbot", () => ({
  useChatbotAvailability: () => ({ data: true, isLoading: false }),
  usePublicChat: () => ({ mutateAsync, isPending: false }),
  // Alur penerusan dirender oleh widget ini, jadi hook-nya harus ada di mock —
  // tanpa ini komponennya melempar saat dipasang dan tawarannya tidak pernah
  // muncul, yang terbaca seperti "fiturnya tidak jalan".
  useEscalateToTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/security/turnstile-widget", () => ({
  TurnstileWidget: () => null,
  useTurnstile: () => ({
    token: "t",
    refresh: vi.fn(),
    ready: true,
    widgetProps: {},
  }),
}));

import { ChatWidget } from "./chat-widget";

/** Galat axios sebagaimana bentuknya sampai ke komponen. */
function apiError(status: number, code: string) {
  return { response: { status, data: { success: false, error: { code } } } };
}

async function tanya(pertanyaan: string) {
  render(<ChatWidget />);
  fireEvent.click(screen.getByLabelText("Buka asisten informasi"));
  fireEvent.change(screen.getByLabelText("Pertanyaan"), {
    target: { value: pertanyaan },
  });
  fireEvent.submit(screen.getByLabelText("Pertanyaan").closest("form")!);
}

// jsdom tidak mengimplementasikan `Element.scrollTo`, dan widget memanggilnya
// untuk menggulung ke pesan terbaru. Tanpa ini setiap uji gagal karena alasan
// yang tidak ada hubungannya dengan yang sedang diperiksa.
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollTo = vi.fn();
});

/**
 * Yang diuji di sini adalah KALIMAT YANG DIBACA PENGUNJUNG, bukan kode galatnya.
 *
 * Perbedaannya penting: pembedaan "sibuk" lawan "mati" dibangun di sisi server
 * lebih dulu, dan sempat tidak pernah sampai ke layar sama sekali — widget
 * menangkap semua galat dengan satu `catch` dan menuliskan satu kalimat yang
 * sama. Uji yang hanya memeriksa `isBusyError` akan tetap hijau pada keadaan
 * itu.
 */
describe("ChatWidget ketika panggilannya gagal", () => {
  it("menyuruh mencoba lagi — bukan menelepon — ketika asisten hanya sedang ramai", async () => {
    // Menyuruh orang menelepon karena asisten sibuk sepuluh detik memindahkan
    // beban ke petugas yang menerima telepon, untuk pertanyaan yang akan
    // terjawab sendiri pada percobaan berikutnya.
    mutateAsync.mockRejectedValueOnce(apiError(503, "CHATBOT_BUSY"));

    await tanya("berapa biaya pendaftaran");

    await waitFor(() =>
      expect(screen.getByText(/sedang ramai/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/hubungi kami di/i)).toBeNull();
  });

  it("menunjuk ke manusia ketika asistennya benar-benar tidak tersedia", async () => {
    mutateAsync.mockRejectedValueOnce(apiError(503, "CHATBOT_UNAVAILABLE"));

    await tanya("berapa biaya pendaftaran");

    await waitFor(() =>
      expect(screen.getByText(/hubungi kami di/i)).toBeTruthy(),
    );
  });

  it("jatuh ke pesan lama bila bentuk galatnya tidak dikenali", async () => {
    // Bila bentuk galat axios berubah, yang terjadi harus kembali ke pesan
    // lama, bukan layar yang rusak atau kalimat yang salah.
    mutateAsync.mockRejectedValueOnce(new Error("jaringan putus"));

    await tanya("berapa biaya pendaftaran");

    await waitFor(() =>
      expect(screen.getByText(/hubungi kami di/i)).toBeTruthy(),
    );
  });
});

/**
 * Tawaran meneruskan pertanyaan hanya boleh muncul pada PENOLAKAN sungguhan.
 *
 * Gangguan jaringan dan asisten yang sedang ramai bukan pertanyaan yang tidak
 * terjawab. Menawarkan penerusan di sana meminta orang mengetik nama, surel dan
 * nomor teleponnya untuk sesuatu yang akan berhasil pada percobaan berikutnya —
 * pengumpulan data yang tidak perlu, disamarkan sebagai kesopanan.
 */
describe("ChatWidget dan tawaran meneruskan pertanyaan", () => {
  const jawaban = (refused: boolean) => ({
    answer: refused ? "Mohon maaf, saya belum memiliki informasinya." : "Biayanya Rp 350.000.",
    sources: [],
    refused,
  });

  it("menawarkan meneruskan ketika asisten benar-benar menolak", async () => {
    mutateAsync.mockResolvedValueOnce(jawaban(true));

    await tanya("apakah ada beasiswa untuk anak yatim");

    await waitFor(() =>
      expect(screen.getByText(/berkenan saya teruskan/i)).toBeTruthy(),
    );
  });

  it("TIDAK menawarkannya ketika pertanyaannya terjawab", async () => {
    mutateAsync.mockResolvedValueOnce(jawaban(false));

    await tanya("berapa biaya pendaftaran");

    await waitFor(() => expect(screen.getByText(/350.000/)).toBeTruthy());
    expect(screen.queryByText(/berkenan saya teruskan/i)).toBeNull();
  });

  it("TIDAK menawarkannya ketika asisten hanya sedang ramai", async () => {
    mutateAsync.mockRejectedValueOnce(apiError(503, "CHATBOT_BUSY"));

    await tanya("berapa biaya pendaftaran");

    await waitFor(() => expect(screen.getByText(/sedang ramai/i)).toBeTruthy());
    expect(screen.queryByText(/berkenan saya teruskan/i)).toBeNull();
  });
});
