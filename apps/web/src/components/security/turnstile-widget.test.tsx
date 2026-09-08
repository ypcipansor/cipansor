import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";

/**
 * Gerbang Turnstile di sisi peramban.
 *
 * Berkas ini ada karena satu baris yang salah selama dua PR: `ready` dulu
 * berbunyi `token !== null || blocked`, sehingga widget yang GAGAL DIMUAT
 * membuka tombol kirim. Peladen tetap menolak permintaan tanpa token dengan
 * `400`, jadi tombol itu terbuka menuju tembok. Yang diuji di sini adalah
 * akibatnya bagi pengunjung, bukan bentuk kodenya.
 *
 * `TURNSTILE_SITE_KEY` dibaca sekali saat modul dimuat, jadi setiap kasus
 * memasang env-nya lebih dulu lalu mengimpor modulnya dengan segar.
 */

const SITE_KEY = "0x4AAAAAAAuji-kunci-situs";

async function loadModule(siteKey: string | undefined) {
  vi.resetModules();
  if (siteKey === undefined) vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
  else vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  return import("./turnstile-widget");
}

afterEach(() => {
  vi.unstubAllEnvs();
  document
    .querySelectorAll('script[src*="challenges.cloudflare.com"]')
    .forEach((tag) => tag.remove());
});

describe("useTurnstile — kapan form boleh dikirim", () => {
  it("mengunci pengiriman sampai ada token", async () => {
    const { useTurnstile } = await loadModule(SITE_KEY);
    const { result } = renderHook(() => useTurnstile());

    expect(result.current.required).toBe(true);
    expect(result.current.ready).toBe(false);

    act(() => result.current.widgetProps.onToken("token-sah"));
    expect(result.current.ready).toBe(true);
  });

  /**
   * Ini penjaga yang sebenarnya. Menghapusnya berarti mengizinkan kembali
   * tombol yang terbuka menuju `400`.
   */
  it("TETAP mengunci ketika widget-nya tidak dapat dimuat", async () => {
    const { useTurnstile } = await loadModule(SITE_KEY);
    const { result } = renderHook(() => useTurnstile());

    act(() => result.current.widgetProps.onUnavailable());

    expect(result.current.blocked).toBe(true);
    // Peladen menolak token yang hilang tanpa kecuali, jadi membuka tombolnya
    // di sini hanya memindahkan kegagalan ke tempat yang lebih membingungkan.
    expect(result.current.ready).toBe(false);
  });

  it("membuka kembali keadaan 'menyerah' ketika pengunjung mencoba lagi", async () => {
    const { useTurnstile } = await loadModule(SITE_KEY);
    const { result } = renderHook(() => useTurnstile());

    act(() => result.current.widgetProps.onUnavailable());
    expect(result.current.blocked).toBe(true);

    act(() => result.current.widgetProps.onRetry());
    expect(result.current.blocked).toBe(false);
  });

  it("tidak menuntut apa pun ketika gerbangnya dimatikan (dev dan e2e)", async () => {
    const { useTurnstile } = await loadModule(undefined);
    const { result } = renderHook(() => useTurnstile());

    expect(result.current.required).toBe(false);
    expect(result.current.ready).toBe(true);
  });
});

describe("TurnstileWidget — apa yang dilihat pengunjung saat gerbangnya gagal", () => {
  beforeEach(() => {
    delete (window as { turnstile?: unknown }).turnstile;
  });

  /** Jatuhkan skripnya seperti pemblokir iklan atau penyaring jaringan. */
  function failScript() {
    const tag = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com"]',
    );
    expect(tag, "tag skrip Turnstile tidak pernah dipasang").not.toBeNull();
    act(() => {
      tag!.dispatchEvent(new Event("error"));
    });
    return tag!;
  }

  it("mengatakan sebabnya dan menawarkan percobaan ulang, bukan 'muat ulang halaman'", async () => {
    const { TurnstileWidget } = await loadModule(SITE_KEY);
    const onUnavailable = vi.fn();
    render(
      <TurnstileWidget onToken={vi.fn()} onUnavailable={onUnavailable} />,
    );

    failScript();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/challenges\.cloudflare\.com/);
    // Saran lama yang tidak dapat menolong siapa pun yang jaringannya memblokir.
    expect(alert).not.toHaveTextContent(/tetap dapat melanjutkan/i);
    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });

  it("'Coba lagi' mengabari pemanggil dan memasang ulang skripnya", async () => {
    const { TurnstileWidget } = await loadModule(SITE_KEY);
    const onRetry = vi.fn();
    render(<TurnstileWidget onToken={vi.fn()} onRetry={onRetry} />);

    const first = failScript();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: /coba lagi/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    // Tag yang gagal harus benar-benar dibuang: promise di tingkat modul
    // menggantung selamanya kalau tag-nya dipakai ulang, dan tombolnya jadi
    // tombol palsu.
    expect(document.contains(first)).toBe(false);
    await waitFor(() =>
      expect(
        document.querySelector('script[src*="challenges.cloudflare.com"]'),
      ).not.toBeNull(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
