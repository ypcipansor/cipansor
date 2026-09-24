"use client";

/**
 * Super-admin editor for the public assistant's persona.
 *
 * The persona is the ADDITIVE tone/style layer only — greeting, warmth, emoji,
 * the closing offer. The rules that keep the assistant from inventing fees or
 * leaking private data live in code and are appended above this text, so nothing
 * typed here can revoke them. The notice on the page says so out loud, because a
 * super admin should understand exactly how far this field reaches.
 *
 * Saving re-keys the answer cache on the server, so the change takes effect for
 * the next visitor with no stale cached copy in the old voice.
 */

import { useState } from "react";
import {
  Bot,
  ShieldCheck,
  RotateCcw,
  Save,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  useChatbotPersona,
  useUpdateChatbotPersona,
  useResetChatbotPersona,
  type ChatbotPersonaResponse,
} from "@/hooks/use-chatbot-persona";

/** Mirrors MAX_PERSONA_LENGTH on the server (apps/api chatbot.schema.ts). */
const MAX_PERSONA_LENGTH = 4000;

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

export function ChatbotPersonaEditor() {
  const { data, isLoading, isError } = useChatbotPersona();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Gagal memuat persona</AlertTitle>
        <AlertDescription>
          Konfigurasi asisten tidak dapat diambil. Silakan muat ulang halaman
          ini.
        </AlertDescription>
      </Alert>
    );
  }

  // Remount the form whenever the stored value changes (after a save or reset),
  // so the textarea re-seeds from the server without a state-syncing effect.
  return (
    <PersonaForm
      key={`${data.isCustom}:${data.updatedAt ?? "default"}`}
      data={data}
    />
  );
}

function PersonaForm({ data }: { data: ChatbotPersonaResponse }) {
  const update = useUpdateChatbotPersona();
  const reset = useResetChatbotPersona();
  const [draft, setDraft] = useState(data.persona);

  const trimmed = draft.trim();
  const dirty = trimmed !== data.persona.trim();
  const tooLong = draft.length > MAX_PERSONA_LENGTH;
  const empty = trimmed.length === 0;
  const busy = update.isPending || reset.isPending;
  const updatedAt = formatUpdatedAt(data.updatedAt);

  const onSave = async () => {
    try {
      await update.mutateAsync({ persona: trimmed });
      toast.success(
        "Persona asisten disimpan. Jawaban berikutnya memakai gaya baru ini.",
      );
    } catch {
      toast.error("Gagal menyimpan persona. Coba lagi.");
    }
  };

  const onReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success("Persona dikembalikan ke gaya bawaan.");
    } catch {
      toast.error("Gagal mengembalikan persona. Coba lagi.");
    }
  };

  return (
    <div className="space-y-6">
      {/* What this field is — and, just as important, what it is NOT. */}
      <Alert variant="info">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Aturan keamanan tidak dapat diubah di sini</AlertTitle>
        <AlertDescription>
          Kolom ini hanya mengatur <strong>gaya bicara</strong> asisten —
          sapaan, kehangatan, emoji, dan kalimat penutup. Aturan yang mencegah
          asisten mengarang biaya/tanggal atau membocorkan data pribadi santri
          tertanam di dalam sistem dan tidak bisa ditimpa dari halaman ini.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Persona Asisten Publik
              </CardTitle>
              <CardDescription>
                Gaya bahasa yang dipakai chatbot di situs publik saat menjawab
                calon wali santri dan masyarakat.
              </CardDescription>
            </div>
            <Badge variant={data.isCustom ? "secondary" : "outline"}>
              {data.isCustom ? "Kustom" : "Bawaan"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="persona">Instruksi gaya</Label>
            <span
              className={`text-xs ${
                tooLong ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {draft.length}/{MAX_PERSONA_LENGTH}
            </span>
          </div>
          <Textarea
            id="persona"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            rows={16}
            className="font-mono text-sm leading-relaxed"
            placeholder="Tulis gaya bicara asisten…"
          />
          {tooLong && (
            <p className="text-sm text-destructive">
              Terlalu panjang. Maksimal {MAX_PERSONA_LENGTH} karakter.
            </p>
          )}
          {updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Terakhir diperbarui: {updatedAt}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Belum pernah diubah — asisten memakai gaya bawaan.
            </p>
          )}

          {/* The default, so the admin can see the baseline and copy from it. */}
          <Accordion type="single" collapsible className="border-t pt-2">
            <AccordionItem value="default" className="border-b-0">
              <AccordionTrigger className="text-sm">
                Lihat gaya bawaan
              </AccordionTrigger>
              <AccordionContent>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
                  {data.defaultPersona}
                </pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={busy}
                  onClick={() => setDraft(data.defaultPersona)}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Salin bawaan ke editor
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>

        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !data.isCustom}
            onClick={onReset}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Kembalikan ke bawaan
          </Button>
          <Button
            type="button"
            disabled={busy || !dirty || empty || tooLong}
            onClick={onSave}
          >
            <Save className="mr-2 h-4 w-4" />
            {update.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
