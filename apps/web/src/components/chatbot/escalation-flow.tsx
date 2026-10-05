"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { fillPlaceholders, type TranslationPath } from "@/locales";
import { useI18n } from "@/providers/i18n-provider";
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
 *
 * The labels follow the visitor's language — they are reading it — while the
 * body the API mails the team stays Indonesian, as internal mail.
 */
export function summarise(
  fields: Fields,
  t: (path: TranslationPath) => string,
): string {
  const lines = [
    `${t("public.chatbot.escalation.summaryName")}: ${fields.name.trim()}`,
    `${t("public.chatbot.escalation.email")}: ${fields.email.trim()}`,
  ];
  if (fields.phone.trim())
    lines.push(
      `${t("public.chatbot.escalation.phone")}: ${fields.phone.trim()}`,
    );
  if (fields.whatsapp.trim())
    lines.push(
      `${t("public.chatbot.escalation.whatsapp")}: ${fields.whatsapp.trim()}`,
    );
  lines.push(
    `${t("public.chatbot.escalation.question")}: ${fields.question.trim()}`,
  );

  return `${t("public.chatbot.escalation.summaryIntro")}\n\n${lines.join("\n")}`;
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EscalationFlow({ question, conversationId, onDismiss }: Props) {
  const { t } = useI18n();
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
        fillPlaceholders(t("public.chatbot.escalation.error"), {
          phone: siteConfig.contact.phone,
        }),
      );
    } finally {
      // Token sekali pakai — sudah ditukarkan, berhasil atau tidak.
      turnstile.refresh();
    }
  }

  if (step === "offer") {
    return (
      <div className="space-y-3 rounded-lg bg-muted/60 p-3 text-sm">
        <p>{t("public.chatbot.escalation.offerBody")}</p>
        <p className="font-medium">
          {t("public.chatbot.escalation.offerQuestion")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setStep("form")}>
            {t("public.chatbot.escalation.offerYes")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            {t("public.chatbot.escalation.offerNo")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "form") {
    return (
      <form
        onSubmit={toReview}
        className="space-y-3 rounded-lg bg-muted/60 p-3 text-sm"
      >
        <p>{t("public.chatbot.escalation.formIntro")}</p>

        <label className="block space-y-1">
          <span className="text-xs font-medium">
            {t("public.chatbot.escalation.name")}
          </span>
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
          <span className="text-xs font-medium">
            {t("public.chatbot.escalation.email")}
          </span>
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
              {t("public.chatbot.escalation.phone")}{" "}
              <span className="text-muted-foreground">
                {t("public.chatbot.escalation.optional")}
              </span>
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
              {t("public.chatbot.escalation.whatsapp")}{" "}
              <span className="text-muted-foreground">
                {t("public.chatbot.escalation.optional")}
              </span>
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
          <span className="text-xs font-medium">
            {t("public.chatbot.escalation.question")}
          </span>
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
            {fillPlaceholders(t("public.chatbot.escalation.consent"), {
              name: siteConfig.name,
            })}
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            {t("public.chatbot.escalation.next")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            {t("public.chatbot.escalation.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  if (step === "review") {
    return (
      <div className="space-y-3 rounded-lg bg-muted/60 p-3 text-sm">
        <p>{t("public.chatbot.escalation.reviewIntro")}</p>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-sans text-xs leading-relaxed">
          {summarise(fields, t)}
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
            {t("public.chatbot.escalation.reviewSend")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStep("form")}
            disabled={escalate.isPending}
          >
            {t("public.chatbot.escalation.reviewEdit")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
      <p>{t("public.chatbot.escalation.sentBody")}</p>
      <p className="text-xs text-muted-foreground">
        {fillPlaceholders(t("public.chatbot.escalation.sentReference"), {
          reference,
        })}
      </p>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        {t("public.chatbot.escalation.sentClose")}
      </Button>
    </div>
  );
}
