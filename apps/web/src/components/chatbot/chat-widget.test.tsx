import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mutateAsync = vi.fn();
const availability = vi.hoisted(() => ({
  value: { available: true },
}));

vi.mock("@/hooks/use-chatbot", () => ({
  useChatbotAvailability: () => ({
    data: availability.value,
    isLoading: false,
  }),
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

// The widget reads its text from `useI18n()`, so every render goes through the
// provider — and the provider calls `router.refresh()`, which throws outside a
// Next app-router tree. Mocking it is not incidental: a component that lost its
// i18n wiring would throw here rather than quietly render Indonesian.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ChatWidget } from "./chat-widget";
import { I18nProvider } from "@/providers/i18n-provider";

function renderWidget() {
  return render(
    <I18nProvider initialLocale="id">
      <ChatWidget />
    </I18nProvider>,
  );
}

/** Galat axios sebagaimana bentuknya sampai ke komponen. */
function apiError(status: number, code: string) {
  return { response: { status, data: { success: false, error: { code } } } };
}

async function tanya(pertanyaan: string) {
  renderWidget();
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
  availability.value = { available: true };
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

    await waitFor(() => expect(screen.getByText(/sedang ramai/i)).toBeTruthy());
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
    answer: refused
      ? "Mohon maaf, saya belum memiliki informasinya."
      : "Biayanya Rp 350.000.",
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

/**
 * Widget ada di situs PUBLIK, dan situs publik id/en/ar di setiap halaman.
 * Sebelum blok i18n-nya ada, seluruh kalimatnya hardcoded Indonesia: pengunjung
 * berbahasa Inggris atau Arab mendapat asisten berbahasa Indonesia di halaman
 * yang tombol bahasanya sendiri sudah berganti. Uji ini mengunci terjemahannya
 * pada tempatnya.
 */
describe("ChatWidget dan bahasa", () => {
  function renderLocale(locale: "id" | "en" | "ar") {
    render(
      <I18nProvider initialLocale={locale}>
        <ChatWidget />
      </I18nProvider>,
    );
  }

  it("menyapa dalam bahasa Inggris ketika lokalnya Inggris", () => {
    renderLocale("en");
    fireEvent.click(screen.getByLabelText("Open the information assistant"));

    expect(screen.getByText(/How can I help/i)).toBeTruthy();
    expect(screen.queryByText(/Ada yang bisa saya bantu/i)).toBeNull();
  });

  it("menyapa dalam bahasa Arab ketika lokalnya Arab", () => {
    renderLocale("ar");
    fireEvent.click(screen.getByLabelText("افتح مساعد المعلومات"));

    expect(screen.getByText(/كيف أستطيع مساعدتك/)).toBeTruthy();
  });

  it("memakai label tombol berbahasa Inggris, bukan Indonesia", () => {
    renderLocale("en");

    expect(
      screen.getByLabelText("Open the information assistant"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Buka asisten informasi")).toBeNull();
  });
});
