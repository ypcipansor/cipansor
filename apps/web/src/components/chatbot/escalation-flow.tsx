"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import { useEscalateToTeam } from "@/hooks/use-chatbot";

/**
 * Menawarkan meneruskan pertanyaan ke tim, lalu mengumpulkan datanya.
 *
 * BERHENTI DI TANGAN PENANYA DUA KALI, dan itu bentuk yang diminta, bukan
 * hiasan. Pertama sebelum satu kolom pun ditanyakan — meminta nama dan nomor
 * telepon kepada orang yang belum menyatakan mau adalah pengumpulan data yang
 * tidak diminta. Kedua sesudah ringkasannya disusun — orang berhak melihat
 * persis apa yang akan dikirim atas namanya sebelum ia terkirim.
 *
 * Kolomnya dikumpulkan lewat FORM, bukan lewat tanya-jawab bergiliran.
 * Percakapan yang menanyakan surel lalu mengurainya dari kalimat bebas terdengar
 * lebih pintar dan bekerja lebih buruk: ia salah baca, tidak bisa divalidasi,
 * dan di ponsel memaksa lima kali kirim. Suaranya tetap percakapan — tawaran,
 * ringkasan, dan ucapan terima kasihnya adalah gelembung asisten — sementara
 * pengisiannya memakai bentuk yang memang dirancang untuk diisi.
 */

type Step = "offer" | "form" | "review" | "sent";

interface Props {
  /** Pertanyaan yang tidak terjawab, sudah terisi dan masih boleh disunting. */
  question: string;
  conversationId?: string;
  /** Penanya menolak tawarannya. Alurnya hilang tanpa meninggalkan apa pun. */
  onDismiss: () => void;
}

interface Fields {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  question: string;
  /** Umpan lalat: disembunyikan dari mata dan dari pembaca layar. */
  website: string;
}

/**
 * Teks yang BENAR-BENAR akan dibaca tim, disusun di sini supaya yang
 * dikonfirmasi penanya adalah isi suratnya, bukan ringkasan lain yang mirip.
 * Suratnya sendiri dirakit ulang di peladen dari kolom yang sama.
 */
export function summarise(fields: Fields): string {
  const lines = [
    `Nama: ${fields.name.trim()}`,
    `Email: ${fields.email.trim()}`,
  ];
  if (fields.phone.trim()) lines.push(`Telepon: ${fields.phone.trim()}`);
  if (fields.whatsapp.trim()) lines.push(`WhatsApp: ${fields.whatsapp.trim()}`);
  lines.push(`Pertanyaan: ${fields.question.trim()}`);

  return (
    "Halo Cipansor, ada pertanyaan yang tidak mampu saya jawab sebagai asisten AI Cipansor. Berikut rinciannya:\n\n" +
    lines.join("\n")
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EscalationFlow({ question, conversationId, onDismiss }: Props) {
  const [step, setStep] = useState<Step>("offer");
  const [fields, setFields] = useState<Fields>({
    name: "",
    email: "",
    phone: "",
    whatsapp: "",
    question,
    website: "",
  });
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);

  const turnstile = useTurnstile();
  const escalate = useEscalateToTeam();

  const set = (key: keyof Fields) => (value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  function toReview(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setStep("review");
  }

  async function send() {
    setError("");
    try {
      const result = await escalate.mutateAsync({
        name: fields.name.trim(),
        email: fields.email.trim(),
        phone: fields.phone.trim() || undefined,
        whatsapp: fields.whatsapp.trim() || undefined,
        question: fields.question.trim(),
        consent: true,
        conversationId,
        turnstileToken: turnstile.token ?? undefined,
        website: fields.website || undefined,
      });
      setReference(result.reference);
      setStep("sent");
    } catch {
      // Tidak menyebut galat teknisnya. Yang berguna bagi penanya adalah jalan
      // keluarnya, dan jalan keluarnya adalah nomor telepon yang memang ada.
      setError(
        `Maaf, pertanyaannya belum bisa dikirim. Bapak/Ibu dapat menghubungi kami langsung di ${siteConfig.contact.phone}.`,
      );
    } finally {
      // Token sekali pakai — sudah ditukarkan, berhasil atau tidak.
      turnstile.refresh();
    }
  }

  if (step === "offer") {
    return (
      <div className="space-y-3 rounded-lg bg-muted/60 p-3 text-sm">
        <p>
          Pertanyaan ini di luar informasi yang saya miliki 🙏 Tapi saya bisa
          menyampaikannya kepada tim Cipansor, dan mereka akan menjawab langsung
          ke Bapak/Ibu.
        </p>
        <p className="font-medium">Berkenan saya teruskan?</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setStep("form")}>
            Ya, teruskan
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Tidak, terima kasih
          </Button>
        </div>
      </div>
    );
  }

  if (step === "form") {
    return (
      <form onSubmit={toReview} className="space-y-3 rounded-lg bg-muted/60 p-3 text-sm">
        <p>
          Baik. Mohon lengkapi agar tim dapat menghubungi Bapak/Ibu kembali.
        </p>

        <label className="block space-y-1">
          <span className="text-xs font-medium">Nama lengkap</span>
          <input
            required
            minLength={2}
            maxLength={120}
            value={fields.name}
            onChange={(e) => set("name")(e.target.value)}
            className={inputClass}
            autoComplete="name"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium">Email</span>
          <input
            required
            type="email"
            maxLength={200}
            value={fields.email}
            onChange={(e) => set("email")(e.target.value)}
            className={inputClass}
            autoComplete="email"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              Telepon <span className="text-muted-foreground">(opsional)</span>
            </span>
            <input
              type="tel"
              maxLength={30}
              value={fields.phone}
              onChange={(e) => set("phone")(e.target.value)}
              className={inputClass}
              autoComplete="tel"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              WhatsApp <span className="text-muted-foreground">(opsional)</span>
            </span>
            <input
              type="tel"
              maxLength={30}
              value={fields.whatsapp}
              onChange={(e) => set("whatsapp")(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium">Pertanyaan</span>
          <textarea
            required
            minLength={5}
            maxLength={1000}
            rows={3}
            value={fields.question}
            onChange={(e) => set("question")(e.target.value)}
            className={cn(inputClass, "resize-y")}
          />
        </label>

        {/*
          Umpan lalat. `aria-hidden` dan `tabIndex={-1}` supaya pembaca layar
          dan papan ketik melewatinya — sebuah perangkap yang menjebak pengguna
          pembaca layar bukan perangkap, melainkan penghalang akses.
        */}
        <input
          type="text"
          name="website"
          value={fields.website}
          onChange={(e) => set("website")(e.target.value)}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <label className="flex items-start gap-2 text-xs leading-relaxed">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Saya berkenan data di atas diteruskan kepada tim {siteConfig.name}{" "}
            untuk menjawab pertanyaan ini. Data disimpan paling lama 90 hari.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Lanjut
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            Batal
          </Button>
        </div>
      </form>
    );
  }

  if (step === "review") {
    return (
      <div className="space-y-3 rounded-lg bg-muted/60 p-3 text-sm">
        <p>Berikut yang akan saya kirimkan. Apakah sudah tepat?</p>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-sans text-xs leading-relaxed">
          {summarise(fields)}
        </pre>

        <TurnstileWidget
          action="chatbot-escalate"
          appearance="interaction-only"
          size="flexible"
          {...turnstile.widgetProps}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void send()}
            disabled={escalate.isPending || !turnstile.ready}
          >
            {escalate.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Send className="mr-1 size-4" />
            )}
            Sudah tepat, kirim
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStep("form")}
            disabled={escalate.isPending}
          >
            Ubah
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
      <p>
        Sudah saya sampaikan kepada tim Cipansor 🙏 Mereka akan menghubungi
        Bapak/Ibu lewat email yang tadi dituliskan.
      </p>
      <p className="text-xs text-muted-foreground">
        Nomor rujukan: <span className="font-mono">{reference}</span> — sebutkan
        nomor ini bila Bapak/Ibu menghubungi kami lewat telepon.
      </p>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Tutup
      </Button>
    </div>
  );
}
