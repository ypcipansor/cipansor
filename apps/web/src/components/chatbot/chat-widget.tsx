"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { siteConfig } from "@/config/site";
import { useChatbotAvailability, usePublicChat } from "@/hooks/use-chatbot";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import type { ChatMessage, PublicChatResponse } from "@/hooks/use-chatbot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnswerText } from "./answer-text";
import { EscalationFlow } from "./escalation-flow";

/**
 * Public customer-service assistant, bottom-right of the public site.
 *
 * Mounted from `LandingFooter`, which is rendered by every public surface and
 * by nothing inside the authenticated app shell. That makes the public/private
 * boundary structural rather than a convention someone has to remember: this
 * widget cannot appear on a page behind `MainLayout` without a deliberate new
 * import, and it talks only to `/chatbot/public/*`, which serves anonymous
 * callers and reaches no user's data.
 */

interface Turn extends ChatMessage {
  sources?: PublicChatResponse["sources"];
  failed?: boolean;
}

// Satu-satunya salam dalam percakapan ini, dan karena itu diucapkan lengkap.
// Model sengaja TIDAK lagi mengawali jawabannya dengan salam (lihat
// DEFAULT_PERSONA di apps/api): salam yang ditaruh oleh kode diucapkan tepat
// sekali dan tidak bisa salah menebak apakah ia sedang menyapa atau menjawab
// sapaan — yang mana model pernah salah, dan menjawab "Wa'alaikumussalam"
// kepada pengunjung yang tidak mengucap apa pun.
const GREETING =
  "Assalamu'alaikum warahmatullahi wabarakatuh. Saya asisten informasi Pesantren Cipansor. Ada yang bisa saya bantu seputar profil, program, atau pendaftaran?";

const SUGGESTIONS = [
  "Bagaimana cara mendaftar?",
  "Berapa biaya pendaftaran?",
  "Ada unit pendidikan apa saja?",
  "Di mana alamat pesantren?",
];

/**
 * Apakah galat ini berarti "sedang ramai", bukan "sedang mati"?
 *
 * Dibaca dari kode di badan jawaban, bukan dari status HTTP: keduanya 503, dan
 * yang membedakan justru kodenya. Ditulis defensif karena bentuk galat axios
 * bukan sesuatu yang pantas diandaikan benar di dalam komponen — bila
 * bentuknya berubah, yang terjadi adalah kembali ke pesan lama, bukan layar
 * yang rusak.
 */
function isBusyError(error: unknown): boolean {
  const body = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data;
  return body?.error?.code === "CHATBOT_BUSY";
}

export function ChatWidget() {
  const { data: available } = useChatbotAvailability();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const chat = usePublicChat();

  /**
   * Satu pengenal per widget yang dimuat, supaya giliran-giliran yang saling
   * menyambung tersimpan sebagai SATU percakapan di riwayat super admin.
   *
   * Dibuat di peramban dan tidak membawa kewenangan apa pun: ia bukan sesi,
   * tidak menandai siapa pun, dan server tidak memercayainya untuk hal lain
   * selain mengelompokkan baris. Disimpan dalam ref, bukan state, karena
   * berubahnya tidak boleh menyebabkan render ulang.
   *
   * Field `conversationId` sudah lama diterima API dan divalidasi skema, tetapi
   * tidak pernah ada yang mengisinya — riwayatnya karena itu tidak akan pernah
   * punya lebih dari satu giliran per baris tanpa baris ini.
   */
  const conversationId = useRef<string>("");

  useEffect(() => {
    // Dibuat di dalam efek, bukan saat render. `crypto.randomUUID()`,
    // `Date.now()` dan `Math.random()` semuanya tidak murni, dan React Compiler
    // menolaknya di badan komponen sebagai galat eslint — bukan galat tipe,
    // sehingga `build`, `build:strict` dan seluruh uji tetap hijau dan hanya
    // Lint yang memerah. Efek berjalan setelah render dan jauh sebelum
    // pengunjung sempat mengirim apa pun.
    if (!conversationId.current) {
      conversationId.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }, []);

  /**
   * Satu token per pertanyaan, dimuat ulang begitu pertanyaan terkirim.
   *
   * Endpoint ini membelanjakan uang pada setiap panggilan, jadi ia dijaga
   * seperti form publik lainnya. Yang membuatnya tetap nyaman: Turnstile
   * dalam mode terkelola menyelesaikan tantangannya sendiri tanpa klik untuk
   * hampir semua pengunjung, dan tantangan berikutnya sudah disiapkan selagi
   * orangnya mengetik pertanyaan berikutnya.
   */
  const turnstile = useTurnstile();
  /**
   * Pertanyaan yang ditolak dan karena itu boleh ditawarkan untuk diteruskan.
   *
   * Null berarti tidak ada tawaran di layar — termasuk sesudah penanya menolak
   * tawarannya. Tawaran yang muncul lagi setelah ditolak bukan kesopanan,
   * melainkan desakan.
   */
  const [escalate, setEscalate] = useState<{
    question: string;
    conversationId?: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, chat.isPending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!available) return null;

  async function send(question: string) {
    const trimmed = question.trim();
    if (trimmed.length < 2 || chat.isPending) return;
    if (!turnstile.ready) return;

    // Only the turns already exchanged are sent as history — never the turn
    // being added, and never anything the server did not produce.
    const history = turns
      .filter((turn) => !turn.failed)
      .map(({ role, content }) => ({ role, content }));

    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    // Tawaran lama gugur begitu ada pertanyaan baru: yang ditawarkan untuk
    // diteruskan harus pertanyaan yang barusan gagal, bukan yang sebelumnya.
    setEscalate(null);

    try {
      const result = await chat.mutateAsync({
        message: trimmed,
        history,
        turnstileToken: turnstile.token ?? undefined,
        conversationId: conversationId.current || undefined,
      });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: result.answer, sources: result.sources },
      ]);
      // Tawarkan meneruskan HANYA pada penolakan sungguhan. Gangguan jaringan
      // dan asisten yang sedang ramai bukan pertanyaan yang tidak terjawab —
      // menawarkan penerusan di sana meminta orang mengetik nama dan nomor
      // teleponnya untuk sesuatu yang akan berhasil pada percobaan berikutnya.
      // Id percakapannya diambil DI SINI, di dalam penangan peristiwa, bukan
      // saat render. React Compiler menolak pembacaan ref saat render — dan
      // menolaknya sebagai galat lint yang tidak terlihat oleh `build`,
      // `build:strict`, maupun satu pun uji.
      setEscalate(
        result.refused
          ? { question: trimmed, conversationId: conversationId.current || undefined }
          : null,
      );
    } catch (error) {
      // Never invent a fallback answer. Point at a human instead — the phone
      // number is the honest answer when the assistant cannot respond.
      //
      // KECUALI ketika ia hanya sedang ramai. Menyuruh orang menelepon karena
      // asisten sibuk sepuluh detik adalah nasihat yang keliru: ia memindahkan
      // beban ke petugas yang menerima telepon, untuk pertanyaan yang akan
      // terjawab sendiri pada percobaan berikutnya. Server memisahkan keduanya
      // dengan kode `CHATBOT_BUSY`; sebelum ini widget menyamakan semuanya, dan
      // pembedaan itu tidak pernah sampai ke pengunjung.
      const busy = isBusyError(error);
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          failed: true,
          content: busy
            ? "Maaf, asisten sedang ramai. Mohon coba lagi sebentar lagi 🙏"
            : `Maaf, asisten sedang tidak dapat menjawab. Silakan hubungi kami di ${siteConfig.contact.phone} atau melalui WhatsApp.`,
        },
      ]);
    } finally {
      // Tokennya sudah ditukarkan — berhasil atau tidak — jadi pertanyaan
      // berikutnya membutuhkan tantangan baru.
      turnstile.refresh();
    }
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Asisten informasi Pesantren Cipansor"
          className="fixed bottom-24 right-4 z-50 flex h-[min(32rem,calc(100vh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="text-sm font-semibold">Asisten {siteConfig.name}</p>
              <p className="text-xs opacity-90">
                Informasi umum &amp; pendaftaran
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup asisten"
              className="rounded-md p-1 transition-colors hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            <Bubble role="assistant">{GREETING}</Bubble>

            {turns.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {turns.map((turn, index) => (
              <Bubble key={index} role={turn.role} failed={turn.failed}>
                {/* Only the assistant's text is formatted. What the visitor
                    typed is echoed exactly as typed — a question containing an
                    asterisk should not come back italicised. */}
                {turn.role === "assistant" && !turn.failed ? (
                  <AnswerText>{turn.content}</AnswerText>
                ) : (
                  turn.content
                )}
                {turn.sources && turn.sources.length > 0 && (
                  // Sources are shown, not just collected. A visitor deciding
                  // where to send their child should be able to open the page
                  // an answer came from and check it.
                  <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                    <span>Sumber:</span>
                    {turn.sources.map((source) =>
                      source.url ? (
                        <a
                          key={source.id}
                          href={source.url}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          {source.title}
                        </a>
                      ) : (
                        <span key={source.id}>{source.title}</span>
                      ),
                    )}
                  </span>
                )}
              </Bubble>
            ))}

            {/*
              Tawaran meneruskan pertanyaan, ditaruh SESUDAH gelembung
              penolakannya dan bukan di dalamnya: yang dibaca lebih dulu adalah
              jawaban asisten, dan tawarannya menyusul sebagai langkah
              berikutnya — bukan sebagai formulir yang menutupi jawabannya.
            */}
            {escalate && !chat.isPending && (
              <EscalationFlow
                question={escalate.question}
                conversationId={escalate.conversationId}
                onDismiss={() => setEscalate(null)}
              />
            )}

            {chat.isPending && (
              <Bubble role="assistant">
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-label="Sedang mengetik"
                />
              </Bubble>
            )}
          </div>

          {/*
            `interaction-only`: nol tinggi sampai Cloudflare benar-benar
            menuntut interaksi. Versi pertama memakai widget biasa dan blok
            65px-nya memakan 13% tinggi panel secara permanen, menyempitkan
            ruang percakapan demi sesuatu yang hampir tidak pernah disentuh
            pengunjung. Pembungkusnya sengaja hanya berpadding horizontal:
            sebuah div tanpa isi dan tanpa padding vertikal setingginya nol,
            jadi ia hilang sendiri tanpa perlu selector `:has()` yang belum
            tentu berlaku seperti dugaan.
          */}
          <TurnstileWidget
            action="chatbot-ask"
            appearance="interaction-only"
            size="flexible"
            {...turnstile.widgetProps}
            className="px-3"
          />

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={1000}
              placeholder="Tulis pertanyaan Anda…"
              aria-label="Pertanyaan"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button
              type="submit"
              size="icon"
              disabled={
                chat.isPending || input.trim().length < 2 || !turnstile.ready
              }
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Kirim</span>
            </Button>
          </form>

          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Asisten ini hanya menjawab informasi umum dan tidak memiliki akses
            ke data pribadi.
          </p>
        </div>
      )}

      {/*
        Ikon sendirian tidak memberi tahu apa pun. Sebuah lingkaran biru
        bergambar balon percakapan bisa berarti obrolan dengan petugas, formulir
        pesan, atau nomor WhatsApp — dan pengunjung yang tidak yakin tidak
        menekannya. Pil ini menyebutkan tugasnya dengan kata kerja, lalu
        menghilang begitu panelnya terbuka karena ajakan yang sudah dituruti
        hanya menjadi penghalang.
      */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          tabIndex={-1}
          aria-hidden="true"
          className="fixed bottom-[1.85rem] right-20 z-50 hidden rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-lg transition-transform hover:scale-105 sm:block"
        >
          Ada pertanyaan? Tanya di sini
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        // Nama pendek, dan itu keputusan yang sudah pernah salah sekali.
        // Pengingatnya sempat diperpanjang jadi "Buka asisten informasi —
        // tanya seputar pendaftaran dan informasi umum", yang membuat
        // chatbot-widget.spec.ts merah: uji itu mengunci nama ini, dan
        // benar melakukannya. Ajakan untuk bertanya adalah tugas pil di
        // atas; nama sebuah tombol dibacakan utuh setiap kali fokus
        // mendarat di sana, jadi ia tetap sependek mungkin.
        aria-label={open ? "Tutup asisten informasi" : "Buka asisten informasi"}
        className={cn(
          "fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105",
        )}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </>
  );
}

function Bubble({
  role,
  failed,
  children,
}: {
  role: "user" | "assistant";
  failed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("flex", role === "user" ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex max-w-[85%] flex-col whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : failed
              ? "bg-destructive/10 text-foreground"
              : "bg-muted text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}
