"use client";

import { useState } from "react";
import { toast } from "sonner";
import { id as localeId } from "date-fns/locale";
import { safeFormat } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDecideRevocation, useWithdrawRevocationRequest } from "@/hooks/use-esign";
import type { LetterRevocationRequestDetail } from "@cipansor/shared";
import { AlertTriangle, FileText, Gavel } from "lucide-react";

/**
 * Permohonan pencabutan atas naskah ini.
 *
 * Sengaja di halaman suratnya, bukan di menu tersendiri. Pejabat yang berwenang
 * memutuskan datang ke sini lewat pemberitahuannya, dan keputusan yang diambil
 * di sebelah naskahnya adalah keputusan yang diambil sambil membacanya —
 * sedangkan antrean terpisah mengundang orang memutus dari ringkasan.
 */

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Menunggu keputusan", tone: "border-amber-600 bg-amber-50 text-amber-700" },
  APPROVED: { label: "Disetujui — naskah dicabut", tone: "border-orange-600 bg-orange-50 text-orange-700" },
  REJECTED: { label: "Ditolak", tone: "border-slate-400 bg-slate-50 text-slate-600" },
  WITHDRAWN: { label: "Ditarik pemohon", tone: "border-slate-400 bg-slate-50 text-slate-600" },
};

export function RevocationRequestsCard({
  letterId,
  requests,
  canDecide,
  currentUserId,
}: {
  letterId: string;
  requests: LetterRevocationRequestDetail[];
  /** Pemanggil berwenang mencabut naskah ini, jadi berwenang memutuskannya. */
  canDecide: boolean;
  currentUserId?: string;
}) {
  const decide = useDecideRevocation();
  const withdraw = useWithdrawRevocationRequest();
  const [note, setNote] = useState("");
  const [passphrase, setPassphrase] = useState("");

  if (!requests.length) return null;

  const pending = requests.find((r) => r.status === "PENDING");

  async function submit(requestId: string, approve: boolean) {
    if (approve && !passphrase) {
      toast.error("Passphrase tanda tangan Anda diperlukan untuk mencabut naskah.");
      return;
    }
    try {
      await decide.mutateAsync({
        requestId,
        letterId,
        approve,
        note: note.trim() || undefined,
        passphrase: approve ? passphrase : undefined,
      });
      setNote("");
      setPassphrase("");
      toast.success(approve ? "Naskah dinas telah dicabut." : "Permohonan ditolak.");
    } catch (e: any) {
      setPassphrase("");
      toast.error(
        e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          "Gagal memproses permohonan"
      );
    }
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5" />
          Permohonan Pencabutan
        </CardTitle>
        <CardDescription>
          Mengajukan dan memutuskan adalah dua perbuatan yang berbeda, oleh dua
          pihak yang berbeda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((r) => {
          const status = STATUS[r.status] ?? STATUS.PENDING;
          const mine = r.requesterId === currentUserId;
          return (
            <div key={r.id} className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.requester?.name ?? "Tidak diketahui"}</span>
                <Badge variant="outline" className={status.tone}>
                  {status.label}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {safeFormat(new Date(r.createdAt), "dd MMM yyyy HH:mm", { locale: localeId })}
                </span>
              </div>

              <p className="rounded-md bg-muted/50 p-2">{r.reason}</p>

              {r.attachmentUrl && (
                <a
                  href={r.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <FileText className="h-3 w-3" />
                  Berkas pendukung
                </a>
              )}

              {r.decidedBy && (
                <p className="text-xs text-muted-foreground">
                  Diputus {r.decidedBy.name}
                  {r.decidedAt
                    ? ` · ${safeFormat(new Date(r.decidedAt), "dd MMM yyyy HH:mm", { locale: localeId })}`
                    : ""}
                  {r.decisionNote ? ` — ${r.decisionNote}` : ""}
                </p>
              )}

              {r.status === "PENDING" && mine && !canDecide && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={withdraw.isPending}
                  onClick={async () => {
                    await withdraw.mutateAsync({ requestId: r.id, letterId });
                    toast.success("Permohonan ditarik.");
                  }}
                >
                  Tarik permohonan
                </Button>
              )}
            </div>
          );
        })}

        {pending && canDecide && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-3">
            <div className="flex gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Menyetujui berarti <strong>mencabut naskah ini sekarang juga</strong>,
                dengan alasan yang tertulis di atas — dan alasan itu akan dibaca
                publik apa adanya. Pencabutan tidak dapat dibatalkan.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="decide-note">Catatan keputusan (opsional)</Label>
              <Textarea
                id="decide-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="decide-pass">Passphrase tanda tangan Anda</Label>
              <Input
                id="decide-pass"
                type="password"
                autoComplete="off"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Diperlukan hanya bila menyetujui"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={decide.isPending || !passphrase}
                onClick={() => submit(pending.id, true)}
              >
                {decide.isPending ? "Memproses…" : "Setujui & Cabut Naskah"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={decide.isPending}
                onClick={() => submit(pending.id, false)}
              >
                Tolak
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
