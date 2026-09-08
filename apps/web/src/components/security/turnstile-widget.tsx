"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile untuk form publik.
 *
 * Site key dibaca dari `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, yang **dibakar ke
 * dalam bundel pada waktu build**, bukan dibaca saat halaman dijalankan.
 * Menyuntingnya di `.env` produksi tidak mengubah apa pun sampai image web
 * dibangun ulang — sama seperti `NEXT_PUBLIC_SHOW_DEMO_LOGIN`.
 *
 * `??`, bukan `||`: site key yang sengaja dikosongkan berarti "matikan
 * gerbangnya", dan `||` akan melipat string kosong itu menjadi nilai bawaan.
 */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * Apakah gerbangnya menyala di build ini.
 *
 * Dipakai pemanggil untuk memutuskan apakah tombol kirim harus menunggu token.
 * Tanpa ini setiap form akan menuntut token yang tidak akan pernah datang di
 * lingkungan pengembangan dan e2e, sehingga fitur yang dimatikan akan terlihat
 * persis seperti fitur yang rusak.
 */
export function isTurnstileEnabled(): boolean {
  return TURNSTILE_SITE_KEY.length > 0;
}

/**
 * Keadaan Turnstile untuk satu form.
 *
 * Tujuh permukaan memakai pola yang sama: simpan token, minta tantangan baru
 * setelah tiap pengiriman, dan tampilkan keadaan yang sebenarnya ketika
 * widget-nya tidak dapat dipakai. Ditulis ulang tujuh kali, pola itu akan
 * salah di tempat yang berbeda-beda — jadi ini satu-satunya salinannya, dan
 * `chat-widget.tsx` yang dulu menyalinnya sendiri sekarang ikut memakainya.
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const required = isTurnstileEnabled();

  /**
   * Minta tantangan baru. Wajib dipanggil setelah SETIAP pengiriman, berhasil
   * maupun gagal: token Turnstile sekali pakai dan penukaran kedua ditolak.
   */
  const refresh = useCallback(() => {
    setToken(null);
    setResetSignal((n) => n + 1);
  }, []);

  const onUnavailable = useCallback(() => setBlocked(true), []);
  const onRetry = useCallback(() => setBlocked(false), []);

  return {
    token,
    required,
    /**
     * Widget-nya menyerah: skripnya tidak dapat dimuat, tantangannya kehabisan
     * waktu, atau Cloudflare melaporkan galat. Dipakai untuk *menjelaskan*
     * keadaan, tidak untuk melewatinya.
     */
    blocked,
    /**
     * Apakah form boleh dikirim.
     *
     * **`blocked` sengaja TIDAK ada di sini, dan versi sebelumnya salah.**
     * Dulu barisnya berbunyi `token !== null || blocked`, dengan alasan bahwa
     * peladen sudah gagal-terbuka ketika Cloudflare tak terjangkau. Alasan itu
     * mencampur dua hal yang berbeda: peladen gagal-terbuka ketika *peladen*
     * tidak dapat menghubungi siteverify, sedangkan `blocked` berarti
     * *peramban* tidak dapat memuat widget-nya. Di jalur yang kedua tidak ada
     * token yang terkirim sama sekali, dan `verifyTurnstileToken` menolak
     * token yang hilang tanpa kecuali.
     *
     * Akibatnya tombolnya terbuka menuju tembok: pengunjung yang jaringannya
     * menyaring `challenges.cloudflare.com` menekan "Masuk", menerima `400`,
     * dan diberi saran memuat ulang halaman yang tidak akan pernah menolong
     * karena yang menghalangi ada di sisinya. Mengunci tombolnya tidak
     * menghilangkan akses siapa pun — akses itu memang sudah tidak ada — tapi
     * mengubah kebuntuan diam menjadi keterangan yang bisa ditindaklanjuti.
     */
    ready: !required || token !== null,
    refresh,
    widgetProps: { onToken: setToken, onUnavailable, onRetry, resetSignal },
  };
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Muat skripnya sekali untuk seluruh aplikasi.
 *
 * Promise-nya disimpan di tingkat modul, bukan di dalam komponen: dua widget
 * pada satu halaman (atau satu widget yang dipasang ulang) tidak boleh
 * menyisipkan dua tag `<script>`, karena yang kedua akan mendefinisikan ulang
 * `window.turnstile` di tengah pemakaian yang pertama.
 */
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Gagal memuat Turnstile")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Dibuang supaya percobaan berikutnya benar-benar mencoba lagi, bukan
      // mewarisi promise yang sudah gagal selamanya.
      scriptPromise = null;
      reject(new Error("Gagal memuat Turnstile"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Buang skrip yang gagal supaya percobaan berikutnya benar-benar mengunduh lagi.
 *
 * Tanpa ini tombol "Coba lagi" adalah tombol palsu. `scriptPromise` di tingkat
 * modul hanya dikosongkan pada `script.onerror`; cabang `existing` memasang
 * pendengar `load`/`error` pada tag yang sudah gagal, dan peristiwa itu sudah
 * lewat — pendengarnya tidak akan pernah terpanggil, sehingga promise-nya
 * menggantung selamanya. Membuang tag-nya membuat percobaan berikutnya
 * menempuh jalur pemasangan yang segar.
 */
function resetTurnstileScript(): void {
  if (typeof document === "undefined") return;
  scriptPromise = null;
  document
    .querySelectorAll<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    .forEach((tag) => tag.remove());
}

export interface TurnstileWidgetProps {
  /**
   * Dipanggil dengan token ketika tantangan selesai, dan dengan `null` ketika
   * tokennya kedaluwarsa atau widget-nya gagal — sehingga pemanggil tidak
   * pernah menyimpan token yang sudah tidak berlaku.
   */
  onToken: (token: string | null) => void;
  /**
   * Dipanggil sekali bila widget-nya tidak dapat dipakai sama sekali: skripnya
   * gagal dimuat, atau Cloudflare melaporkan galat.
   *
   * Ada supaya kegagalan ini tidak berubah menjadi penguncian. Tanpa jalan
   * keluar, tombol "Masuk" yang menunggu token akan menunggu selamanya ketika
   * `challenges.cloudflare.com` tidak terjangkau dari jaringan pengunjung —
   * dan tidak ada yang dapat dilakukan pengurus dari sisi peladen untuk
   * membukanya, karena tombolnya dikunci di peramban. Pemanggil memakai ini
   * untuk berhenti menuntut token dan membiarkan peladen yang memutuskan;
   * peladen sendiri sudah gagal-terbuka ketika Cloudflare tak terjangkau.
   */
  onUnavailable?: () => void;
  /**
   * Dipanggil ketika pengunjung menekan "Coba lagi", sebelum pemuatan ulang
   * dimulai. Pemanggil memakainya untuk membersihkan keadaan "menyerah" yang
   * sudah terlanjur ia catat, supaya satu kegagalan sementara tidak menempel
   * sepanjang sesi.
   */
  onRetry?: () => void;
  /** Label tindakan; muncul di analitik Turnstile untuk memisahkan form. */
  action?: string;
  /**
   * Lebar widget. `flexible` (bawaan) mengikuti lebar induknya dengan minimum
   * 300px, sehingga ia sejajar dengan kolom-kolom form di atasnya alih-alih
   * berdiri 300px sendirian di dalam kartu yang lebih lebar.
   */
  size?: "flexible" | "normal" | "compact";
  /**
   * Kapan widget-nya terlihat.
   *
   * `interaction-only` tidak memakan ruang sama sekali sampai Cloudflare
   * benar-benar menuntut interaksi. Itu yang benar untuk permukaan sempit
   * seperti panel chat, di mana blok 65px yang selalu tampak memakan 13%
   * tinggi panel demi sesuatu yang bagi hampir semua pengunjung tidak pernah
   * perlu disentuh.
   */
  appearance?: "always" | "execute" | "interaction-only";
  /**
   * Naikkan angkanya untuk meminta tantangan baru. Diperlukan setelah setiap
   * pengiriman, berhasil maupun gagal: token Turnstile sekali pakai, dan
   * penukaran kedua ditolak Cloudflare dengan `timeout-or-duplicate`.
   */
  resetSignal?: number;
  className?: string;
}

export function TurnstileWidget({
  onToken,
  onUnavailable,
  onRetry,
  action,
  size = "flexible",
  appearance = "always",
  resetSignal = 0,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  // Dinaikkan oleh "Coba lagi"; ikut jadi dependensi efek pemasangan supaya
  // widget-nya benar-benar dirender ulang, bukan sekadar pesannya hilang.
  const [attempt, setAttempt] = useState(0);

  // Disimpan di ref supaya efek pemasangan tidak ikut berjalan ulang setiap
  // kali induknya membuat ulang fungsi callback-nya — memasang ulang widget
  // pada setiap render adalah cara paling cepat membuat tantangan tidak pernah
  // selesai.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  const onRetryRef = useRef(onRetry);
  useEffect(() => {
    onRetryRef.current = onRetry;
  }, [onRetry]);

  const emit = useCallback((token: string | null) => {
    onTokenRef.current(token);
  }, []);

  const giveUp = useCallback(() => {
    setFailed(true);
    onUnavailableRef.current?.();
  }, []);

  /**
   * Coba muat ulang gerbangnya.
   *
   * Kegagalan yang paling sering terjadi bersifat sementara — satu unduhan
   * yang putus, jaringan yang baru pulih, tab yang lama menganggur — dan
   * sebelumnya satu-satunya jalan keluarnya adalah memuat ulang seluruh
   * halaman, yang pada form panjang seperti SPMB berarti mengetik ulang
   * semuanya.
   */
  const retry = useCallback(() => {
    setFailed(false);
    onRetryRef.current?.();
    if (typeof window !== "undefined" && !window.turnstile) {
      resetTurnstileScript();
    }
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isTurnstileEnabled()) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          size,
          appearance,
          callback: (token: string) => emit(token),
          // Kedaluwarsa itu wajar dan dapat dipulihkan: Turnstile menerbitkan
          // tantangan baru sendiri, jadi cukup buang tokennya.
          "expired-callback": () => emit(null),
          /**
           * Timeout TIDAK dapat dipulihkan sendiri, dan di sinilah versi
           * pertama mengunci halaman.
           *
           * Dulu jalur ini hanya memanggil `emit(null)`. Akibatnya: tantangan
           * yang kehabisan waktu — jaringan lambat, tab ditinggal terbuka —
           * meninggalkan tombol kirim mati selamanya, tanpa satu pun pesan di
           * layar dan tanpa tuas apa pun di sisi peladen yang dapat
           * membukanya. Persis penguncian yang `onUnavailable` dibuat untuk
           * mencegah, lewat jalur yang terlewat. Ditemukan saat menguji
           * penerapan produksi 2026-09-03, ketika peramban tanpa kepala
           * memicunya.
           */
          "timeout-callback": () => {
            emit(null);
            giveUp();
          },
          "error-callback": () => {
            emit(null);
            giveUp();
          },
        });
      })
      .catch(() => {
        if (!cancelled) giveUp();
      });

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        window.turnstile.remove(id);
        widgetIdRef.current = undefined;
      }
    };
  }, [action, size, appearance, emit, giveUp, attempt]);

  useEffect(() => {
    // 0 adalah nilai awal, bukan permintaan reset — mereset di sini akan
    // membatalkan tantangan yang baru saja selesai pada pemasangan pertama.
    if (resetSignal === 0) return;
    // Tanpa `emit(null)` di sini: setiap pemanggil sudah mengosongkan
    // tokennya sendiri sebelum menaikkan sinyalnya, dan memanggil setState
    // induk secara sinkron dari dalam efek justru memicu render beruntun.
    const id = widgetIdRef.current;
    if (id && window.turnstile) {
      window.turnstile.reset(id);
    }
  }, [resetSignal]);

  if (!isTurnstileEnabled()) return null;

  /**
   * Pesan gagal yang mengatakan yang sebenarnya.
   *
   * Yang sebelumnya berdiri di sini berbunyi "Anda tetap dapat melanjutkan;
   * muat ulang halaman bila permintaan Anda ditolak" — dua janji yang keduanya
   * keliru. Pengunjung TIDAK dapat melanjutkan (tanpa token peladen menjawab
   * `400`), dan memuat ulang halaman tidak mengubah apa pun bila yang
   * menghalangi ada di jaringannya sendiri. Sebuah pesan yang menyuruh
   * mengulangi tindakan yang pasti gagal lebih buruk daripada diam: ia
   * menghabiskan waktu orang dan menyembunyikan sebab yang sebenarnya.
   */
  return (
    <div className={className}>
      <div ref={containerRef} />
      {failed && (
        <div role="alert" className="mt-2 space-y-1 text-sm">
          <p className="text-muted-foreground">
            Verifikasi keamanan tidak dapat dimuat, jadi formulir ini belum bisa
            dikirim. Penyebabnya hampir selalu ada di sisi Anda: pemblokir iklan
            atau jaringan yang menyaring{" "}
            <span className="font-mono text-xs">challenges.cloudflare.com</span>.
            Izinkan alamat itu, atau coba jaringan lain.
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-sm font-medium text-primary underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Coba lagi
          </button>
        </div>
      )}
    </div>
  );
}
