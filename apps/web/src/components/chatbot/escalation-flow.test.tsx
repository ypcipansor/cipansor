import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/hooks/use-chatbot", () => ({
  useEscalateToTeam: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/components/security/turnstile-widget", () => ({
  TurnstileWidget: () => null,
  useTurnstile: () => ({
    token: "t",
    ready: true,
    refresh: vi.fn(),
    widgetProps: {},
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { EscalationFlow } from "./escalation-flow";
import { I18nProvider } from "@/providers/i18n-provider";

/** Teks alurnya kini dari `useI18n()`, jadi setiap render lewat provider. */
function renderFlow(question: string) {
  return render(
    <I18nProvider initialLocale="id">
      <EscalationFlow question={question} onDismiss={vi.fn()} />
    </I18nProvider>,
  );
}

const PERTANYAAN = "Apakah ada beasiswa untuk anak yatim?";

function isi(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Dari tawaran sampai layar peninjauan. */
function sampaiTinjau() {
  fireEvent.click(screen.getByText("Ya, teruskan"));
  isi(/nama lengkap/i, "Ibu Aminah");
  isi(/email/i, "aminah@example.test");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByText("Lanjut"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ accepted: true, reference: "ABCD1234" });
});

describe("EscalationFlow", () => {
  it("tidak meminta satu kolom pun sebelum penanya menyatakan berkenan", () => {
    // Meminta nama dan nomor telepon kepada orang yang belum menyatakan mau
    // adalah pengumpulan data yang tidak diminta, bukan sekadar tidak sopan.
    renderFlow(PERTANYAAN);

    expect(screen.getByText(/berkenan saya teruskan/i)).toBeTruthy();
    expect(screen.queryByLabelText(/nama lengkap/i)).toBeNull();
  });

  it("mengisi pertanyaannya sendiri, dan membiarkannya disunting", () => {
    renderFlow(PERTANYAAN);
    fireEvent.click(screen.getByText("Ya, teruskan"));

    // `getByLabelText(/pertanyaan/i)` cocok dengan dua hal — labelnya dan
    // kalimat pengantarnya — jadi elemennya diambil menurut perannya.
    expect(
      (
        screen.getByRole("textbox", {
          name: /pertanyaan/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(PERTANYAAN);
  });

  it("memperlihatkan persis apa yang akan dikirim sebelum mengirimnya", async () => {
    // Orang berhak melihat apa yang dikirim atas namanya. Ini juga yang membuat
    // langkah "apakah sudah tepat?" berarti sesuatu — meninjau ringkasan yang
    // BUKAN isi suratnya hanya memindahkan kepercayaan, tidak memberikannya.
    renderFlow(PERTANYAAN);
    sampaiTinjau();

    const ringkasan = screen.getByText(/Halo Cipansor/);
    expect(ringkasan.textContent).toContain("Nama: Ibu Aminah");
    expect(ringkasan.textContent).toContain("Email: aminah@example.test");
    expect(ringkasan.textContent).toContain(`Pertanyaan: ${PERTANYAAN}`);
    // Belum ada apa pun yang terkirim di layar ini.
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("tidak mencantumkan baris untuk kolom yang tidak diisi", () => {
    renderFlow(PERTANYAAN);
    sampaiTinjau();

    expect(screen.getByText(/Halo Cipansor/).textContent).not.toContain(
      "WhatsApp:",
    );
  });

  it("mengirim hanya sesudah penanya membenarkan ringkasannya", async () => {
    renderFlow(PERTANYAAN);
    sampaiTinjau();
    fireEvent.click(screen.getByText("Sudah tepat, kirim"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      name: "Ibu Aminah",
      email: "aminah@example.test",
      question: PERTANYAAN,
      consent: true,
    });
  });

  it("memberi nomor rujukan yang bisa disebut lewat telepon", async () => {
    renderFlow(PERTANYAAN);
    sampaiTinjau();
    fireEvent.click(screen.getByText("Sudah tepat, kirim"));

    await waitFor(() => expect(screen.getByText(/ABCD1234/)).toBeTruthy());
  });

  it("menunjuk ke telepon ketika pengirimannya gagal, bukan menyebut galat teknisnya", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("500"));

    renderFlow(PERTANYAAN);
    sampaiTinjau();
    fireEvent.click(screen.getByText("Sudah tepat, kirim"));

    await waitFor(() =>
      expect(screen.getByText(/belum bisa dikirim/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/500/)).toBeNull();
  });
});
