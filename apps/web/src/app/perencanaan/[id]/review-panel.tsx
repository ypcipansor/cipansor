"use client";
import { useState } from "react";
import { id as localeId } from "date-fns/locale";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Gavel,
  RotateCcw,
  Send,
  FileSearch,
} from "lucide-react";
import {
  PLAN_REVIEW_MIN_REASON,
  decidePlanSchema,
  proposeToPembinaSchema,
  reviewResultSchema,
  submitForReviewSchema,
} from "@cipansor/shared";
import { safeFormat } from "@/lib/date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PLAN_REVIEW_ACTION_LABEL,
  PLAN_STATUS_LABEL,
  usePlanReviewStep,
  type PlanReviewAction,
  type PlanReviewPayload,
  type StrategicPlan,
} from "@/hooks/use-perencanaan";

const KETUA = "YAYASAN_KETUA";
const PENGAWAS = "YAYASAN_PENGAWAS";
const PEMBINA = "YAYASAN_PEMBINA";

const ORGAN_LABEL: Record<string, string> = {
  [KETUA]: "Ketua Pengurus",
  [PENGAWAS]: "Pengawas",
  [PEMBINA]: "Pembina",
};

/**
 * The contract the API validates each step with. The button below is enabled
 * exactly when the same schema passes, so Kirim never invites a 400.
 */
const REVIEW_SCHEMA = {
  submit: submitForReviewSchema,
  result: reviewResultSchema,
  propose: proposeToPembinaSchema,
  decide: decidePlanSchema,
} as const;

const STEPS = [
  { label: "Disusun", organ: "Pengurus" },
  { label: "Direviu", organ: "Pengawas" },
  { label: "Ditanggapi", organ: "Pengurus" },
  { label: "Ditetapkan", organ: "Pembina" },
];

/** The step the document waits on; STEPS.length once ratified. */
function waitingOn(stage: StrategicPlan["reviewStage"]): number {
  switch (stage) {
    case "DIREVIU_PENGAWAS":
      return 1;
    case "HASIL_REVIU":
      return 2;
    case "DIAJUKAN_PEMBINA":
      return 3;
    case "DITETAPKAN":
      return 4;
    default:
      // Not yet submitted, or returned by Pembina: back with Pengurus.
      return 0;
  }
}

const WAITING_TEXT = [
  "Menunggu Ketua Pengurus mengajukannya ke Pengawas.",
  "Menunggu hasil reviu Pengawas.",
  "Menunggu tanggapan Pengurus atas hasil reviu.",
  "Menunggu keputusan Pembina.",
];

type DialogKind = "submit" | "result" | "propose" | "tetapkan" | "kembalikan";

const DIALOG: Record<
  DialogKind,
  { title: string; description: string; label: string; required: boolean; confirm: string }
> = {
  submit: {
    title: "Ajukan ke Pengawas",
    description:
      "Pengawas mereviu dokumen ini lalu mengirim hasilnya kembali ke Pengurus. Selama direviu, dokumen tidak dapat diubah.",
    label: "Catatan pengantar (opsional)",
    required: false,
    confirm: "Ajukan ke Pengawas",
  },
  result: {
    title: "Kirim hasil reviu",
    description:
      "Hasil reviu dikirim ke Pengurus, dan nanti ikut diajukan ke Pembina bersama dokumennya.",
    label: "Hasil reviu",
    required: true,
    confirm: "Kirim ke Pengurus",
  },
  propose: {
    title: "Ajukan ke Pembina",
    description:
      "Dokumen diajukan bersama hasil reviu Pengawas. Pembina menetapkannya atau mengembalikannya untuk diperbaiki.",
    label: "Ringkasan perbaikan",
    required: true,
    confirm: "Ajukan ke Pembina",
  },
  tetapkan: {
    title: "Tetapkan dokumen",
    description:
      "Dokumen berlaku sejak ditetapkan dan menjadi induk bagi dokumen di bawahnya.",
    label: "Catatan penetapan (opsional)",
    required: false,
    confirm: "Tetapkan",
  },
  kembalikan: {
    title: "Kembalikan ke Pengurus",
    description:
      "Pengurus memperbaiki dokumen lalu mengajukannya ulang ke Pengawas.",
    label: "Alasan dikembalikan",
    required: true,
    confirm: "Kembalikan",
  },
};

function buildPayload(
  kind: DialogKind,
  notes: string,
  revised: "ya" | "tidak",
): PlanReviewPayload {
  const note = notes || undefined;
  switch (kind) {
    case "submit":
      return { step: "submit", notes: note };
    case "result":
      return { step: "result", notes };
    case "propose":
      return { step: "propose", revised: revised === "ya", notes };
    case "tetapkan":
      return { step: "decide", decision: "TETAPKAN", notes: note };
    case "kembalikan":
      return { step: "decide", decision: "KEMBALIKAN", notes: note };
  }
}

function when(iso: string): string {
  return safeFormat(new Date(iso), "d MMM yyyy, HH.mm", { locale: localeId });
}

/**
 * Pengesahan dokumen tingkat yayasan (RPJP, Renstra, RKA Yayasan): Pengurus
 * menyusun, Pengawas mereviu, Pengurus menanggapi, Pembina menetapkan —
 * UU 16/2001 Ps. 28 ayat 2, Ps. 31 ayat 1, Ps. 40 ayat 1. Each organ sees only
 * the step that is theirs; the server enforces the same, so a button hidden
 * here is a courtesy, not the guard.
 */
export function ReviewPanel({
  plan,
  roleCode,
}: {
  plan: StrategicPlan;
  roleCode?: string;
}) {
  const review = usePlanReviewStep(plan.id);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [notes, setNotes] = useState("");
  const [revised, setRevised] = useState<"ya" | "tidak">("ya");

  const stage = plan.reviewStage ?? null;
  const events = plan.reviewEvents ?? [];
  const step = waitingOn(stage);
  // Ratified before this flow was recorded: in force, nothing is pending.
  const ratifiedEarlier =
    stage === null && plan.status !== "DRAFT" && plan.status !== "PROPOSED";

  const latest = (action: PlanReviewAction) =>
    [...events].reverse().find((e) => e.action === action);
  const reviewResult = latest("KIRIM_HASIL_REVIU");
  const response = latest("AJUKAN_PENETAPAN");
  const returned = stage === "DIKEMBALIKAN" ? latest("KEMBALIKAN") : undefined;
  const ratified = latest("TETAPKAN");

  const actions: { kind: DialogKind; icon: typeof Send; variant?: "outline" }[] = [];
  if (!ratifiedEarlier) {
    if (roleCode === KETUA && step === 0) actions.push({ kind: "submit", icon: Send });
    if (roleCode === PENGAWAS && stage === "DIREVIU_PENGAWAS")
      actions.push({ kind: "result", icon: FileSearch });
    if (roleCode === KETUA && stage === "HASIL_REVIU")
      actions.push({ kind: "propose", icon: Send });
    if (roleCode === PEMBINA && stage === "DIAJUKAN_PEMBINA") {
      actions.push({ kind: "tetapkan", icon: Gavel });
      actions.push({ kind: "kembalikan", icon: RotateCcw, variant: "outline" });
    }
  }

  const openDialog = (kind: DialogKind) => {
    setNotes("");
    setRevised("ya");
    setDialog(kind);
  };

  const spec = dialog ? DIALOG[dialog] : null;
  const label =
    dialog === "propose" && revised === "tidak" ? "Alasan tidak merevisi" : spec?.label;
  const payload = dialog ? buildPayload(dialog, notes.trim(), revised) : null;
  const acceptable =
    payload !== null && REVIEW_SCHEMA[payload.step].safeParse(payload).success;

  const send = () => {
    if (payload && acceptable) {
      review.mutate(payload, { onSuccess: () => setDialog(null) });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Pengesahan dokumen yayasan</CardTitle>
        <CardDescription>
          Disusun Pengurus, direviu Pengawas, ditetapkan Pembina — UU 16/2001
          Pasal 28, 31, dan 40.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {ratifiedEarlier ? (
          <p className="text-sm text-muted-foreground">
            Berstatus {PLAN_STATUS_LABEL[plan.status] ?? plan.status} sejak
            sebelum alur pengesahan tercatat di aplikasi. Tidak ada langkah yang
            menunggu.
          </p>
        ) : (
          <>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STEPS.map((s, i) => {
                const done = i < step;
                const current = i === step;
                const Icon = done ? CheckCircle2 : current ? CircleDot : Circle;
                return (
                  <li
                    key={s.label}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                      current ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40" : ""
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        done
                          ? "text-emerald-600"
                          : current
                            ? "text-amber-600"
                            : "text-muted-foreground/50"
                      }`}
                    />
                    <div className="leading-tight">
                      <p className={`text-sm font-medium ${done || current ? "" : "text-muted-foreground"}`}>
                        {s.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.organ}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {returned && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <p className="font-medium">
                  Dikembalikan Pembina untuk diperbaiki · {when(returned.createdAt)}
                </p>
                {returned.notes && <p className="mt-1 whitespace-pre-line">{returned.notes}</p>}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {stage === "DITETAPKAN"
                  ? `Ditetapkan Pembina${ratified ? ` pada ${when(ratified.createdAt)}` : ""}.`
                  : WAITING_TEXT[step]}
              </p>
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {actions.map(({ kind, icon: Icon, variant }) => (
                    <Button
                      key={kind}
                      variant={variant}
                      onClick={() => openDialog(kind)}
                      disabled={review.isPending}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {DIALOG[kind].confirm}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {events.length > 0 && (
          <div className="border-t pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Riwayat pengesahan
            </p>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p>
                    <span className="font-medium">{PLAN_REVIEW_ACTION_LABEL[e.action]}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.actor.name}, {ORGAN_LABEL[e.actorRoleCode] ?? e.actorRoleCode} ·{" "}
                      {when(e.createdAt)}
                    </span>
                  </p>
                  {e.action === "AJUKAN_PENETAPAN" && e.revised != null && (
                    <p className="text-xs text-muted-foreground">
                      {e.revised ? "Direvisi setelah reviu" : "Tidak direvisi"}
                    </p>
                  )}
                  {e.notes && (
                    <p className="mt-1 whitespace-pre-line border-l-2 pl-3 text-muted-foreground">
                      {e.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {spec && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{spec.title}</DialogTitle>
              <DialogDescription>{spec.description}</DialogDescription>
            </DialogHeader>

            {(dialog === "propose" || dialog === "tetapkan" || dialog === "kembalikan") &&
              reviewResult?.notes && (
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Hasil reviu Pengawas
                  </p>
                  <p className="mt-1 whitespace-pre-line">{reviewResult.notes}</p>
                </div>
              )}
            {(dialog === "tetapkan" || dialog === "kembalikan") && response?.notes && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">
                  Tanggapan Pengurus · {response.revised ? "direvisi" : "tidak direvisi"}
                </p>
                <p className="mt-1 whitespace-pre-line">{response.notes}</p>
              </div>
            )}

            {dialog === "propose" && (
              <RadioGroup
                value={revised}
                onValueChange={(v) => setRevised(v as "ya" | "tidak")}
                className="gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="ya" id="revisi-ya" />
                  <Label htmlFor="revisi-ya">Sudah direvisi sesuai hasil reviu</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="tidak" id="revisi-tidak" />
                  <Label htmlFor="revisi-tidak">Tidak direvisi</Label>
                </div>
              </RadioGroup>
            )}

            <div className="space-y-2">
              <Label htmlFor="review-notes">{label}</Label>
              <Textarea
                id="review-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {spec.required && (
                <p className="text-xs text-muted-foreground">
                  Wajib diisi, minimal {PLAN_REVIEW_MIN_REASON} karakter.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Batal
              </Button>
              <Button onClick={send} disabled={!acceptable || review.isPending}>
                {spec.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
