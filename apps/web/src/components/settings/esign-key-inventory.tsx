"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StateBadge } from "@/components/settings/esign-panel";
import {
  REVOCATION_CODE_LABEL,
  useEsignKeys,
  type AffectedLetter,
  type EsignKeyRow,
  type SigningKeyRevocationCode,
} from "@/hooks/use-esign";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { safeFormat } from "@/lib/date";
import { id as idLocale } from "date-fns/locale";
import { AlertTriangle, Ban, KeyRound } from "lucide-react";

/**
 * Daftar pemegang kunci tanda tangan, dan pencabutannya.
 *
 * Rute pencabutan sudah lama ada, tetapi tidak satu pun halaman memanggilnya —
 * sehingga passphrase yang bocor atau pejabat yang berhenti hanya dapat dicabut
 * dengan menyunting basis data. Daftar ini ada terutama supaya pencabutannya
 * dapat dilakukan, dan karena itu ia juga menjawab pertanyaan yang selama ini
 * tidak dapat dijawab dari dalam aplikasi: siapa saja yang berwenang
 * menandatangani atas nama yayasan hari ini.
 *
 * Yang paling mudah disalahpahami dan paling penting ditampilkan: **mencabut
 * kunci tidak mencabut surat.** Setiap tanda tangan menyimpan salinan kunci
 * publiknya sendiri, jadi surat yang telanjur sah tetap terverifikasi. Untuk
 * pergantian pejabat itu memang yang dikehendaki; untuk passphrase yang bocor,
 * justru bukan. Karena itu setelah mencabut, jumlah surat yang tersentuh
 * ditampilkan beserta tautannya.
 */

/** Sama dengan MIN_REVOCATION_REASON_LENGTH di server. */
const MIN_REASON = 10;

function fmt(value: string | null | undefined, pattern = "dd MMM yyyy") {
  if (!value) return "—";
  return safeFormat(new Date(value), pattern, { locale: idLocale });
}

export function EsignKeyInventory() {
  const { keys, revokeKey } = useEsignKeys();
  const [target, setTarget] = useState<EsignKeyRow | null>(null);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState<SigningKeyRevocationCode>("AFFILIATION_CHANGED");
  const [affected, setAffected] = useState<AffectedLetter[] | null>(null);
  const [needsReview, setNeedsReview] = useState(false);

  const rows = keys.data ?? [];
  const active = rows.filter((k) => k.state !== "REVOKED");
  const revoked = rows.filter((k) => k.state === "REVOKED");

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;

  async function submit() {
    if (!target) return;
    try {
      const result = await revokeKey.mutateAsync({
        userId: target.userId,
        reason: trimmed,
        code,
      });
      setTarget(null);
      setReason("");
      setCode("AFFILIATION_CHANGED");
      setNeedsReview(result.lettersNeedReview);
      setAffected(result.affectedLetters);
      toast.success(`Kunci tanda tangan ${target.name} telah dicabut.`);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          "Gagal mencabut kunci tanda tangan"
      );
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Pemegang kunci tanda tangan ({active.length})
          </CardTitle>
          <CardDescription>
            Siapa saja yang berwenang menandatangani secara elektronik atas nama
            yayasan. Cabut kunci ketika passphrase-nya diduga bocor, atau ketika
            pemegangnya berhenti menjabat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {keys.isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
          {!keys.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Belum ada kunci tanda tangan yang diterbitkan.
            </p>
          )}

          {active.map((k) => (
            <div key={k.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{k.name}</span>
                <span className="text-sm text-muted-foreground">{k.email}</span>
                <StateBadge state={k.state} />
                {k.lockedUntil && new Date(k.lockedUntil) > new Date() && (
                  <Badge variant="outline" className="border-amber-600 bg-amber-50 text-amber-700">
                    Terkunci sementara
                  </Badge>
                )}
              </div>

              <div className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                <span>
                  Jabatan / unit: {k.position ?? "—"}
                  {k.unitName ? ` · ${k.unitName}` : ""}
                </span>
                <span>
                  Berlaku sampai: {fmt(k.expiresAt)}
                  {typeof k.daysUntilExpiry === "number" && k.daysUntilExpiry >= 0
                    ? ` (${k.daysUntilExpiry} hari lagi)`
                    : ""}
                </span>
                <span>Disetujui: {fmt(k.approvedAt)} oleh {k.approvedByName ?? "—"}</span>
                <span>Terakhir dipakai: {fmt(k.lastUsedAt, "dd MMM yyyy HH:mm")}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => {
                  setTarget(k);
                  setReason("");
                }}
              >
                <Ban className="mr-2 h-4 w-4" />
                Cabut kunci
              </Button>
            </div>
          ))}

          {revoked.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Sudah dicabut ({revoked.length})
              </h3>
              {revoked.map((k) => (
                <div
                  key={k.id}
                  className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{k.name}</span>
                    <StateBadge state={k.state} />
                    <span className="ml-auto text-xs">
                      {fmt(k.revokedAt, "dd MMM yyyy HH:mm")}
                      {k.revokedByName ? ` · oleh ${k.revokedByName}` : ""}
                    </span>
                  </div>
                  {k.revokedReason && <p className="mt-1">{k.revokedReason}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Konfirmasi pencabutan */}
      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Ban className="h-5 w-5" />
              Cabut kunci tanda tangan
            </DialogTitle>
            <DialogDescription>
              {target?.name} tidak akan dapat menandatangani surat apa pun
              setelah ini. Untuk memulihkannya, ia harus mengajukan penerbitan
              kunci baru dan menetapkan passphrase baru.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  Mencabut kunci tidak mencabut surat yang sudah ditandatangani.
                </p>
                <p>
                  Surat-surat itu tetap terverifikasi sah — memang begitu yang
                  dikehendaki untuk pergantian pejabat. Bila passphrase-nya
                  bocor, cabut pula tanda tangan pada surat-surat yang tercantum
                  setelah ini, satu per satu.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="revoke-key-code">Sebab pencabutan</Label>
              {/* Kode sebab RFC 5280 §5.3.1. Bukan formalitas: hanya kebocoran
                  kunci yang membuat surat-surat yang telanjur ditandatangani
                  menjadi meragukan, dan tanpa membedakannya petugas hanya punya
                  dua pilihan yang sama-sama keliru — mencabut semuanya, atau
                  tidak mencabut satu pun. */}
              <Select value={code} onValueChange={(v) => setCode(v as SigningKeyRevocationCode)}>
                <SelectTrigger id="revoke-key-code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(REVOCATION_CODE_LABEL) as SigningKeyRevocationCode[]
                  ).map((c) => (
                    <SelectItem key={c} value={c}>
                      {REVOCATION_CODE_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {code === "KEY_COMPROMISE" && (
                <p className="text-xs font-medium text-red-700">
                  Surat-surat yang sudah ditandatangani dengan kunci ini menjadi
                  meragukan dan perlu ditinjau satu per satu.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="revoke-key-reason">Alasan pencabutan</Label>
              <Textarea
                id="revoke-key-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Passphrase diduga bocor pada 1 September 2026"
              />
              <p className="text-xs text-muted-foreground">
                Sekurang-kurangnya {MIN_REASON} karakter. Alasan ini dibaca
                pemegang kunci sebagai satu-satunya penjelasan mengapa
                wewenangnya dicabut.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTarget(null)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={submit}
                disabled={revokeKey.isPending || tooShort}
              >
                {revokeKey.isPending ? "Mencabut…" : "Cabut kunci"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Akibatnya, setelah pencabutan: surat yang masih sah dengan kunci itu. */}
      <Dialog open={!!affected} onOpenChange={(v) => !v && setAffected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kunci telah dicabut</DialogTitle>
            <DialogDescription>
              {affected?.length
                ? `${affected.length} naskah pernah ditandatangani dengan kunci ini dan masih dinyatakan sah.`
                : "Belum ada naskah yang ditandatangani dengan kunci ini."}
            </DialogDescription>
          </DialogHeader>

          {!!affected?.length && (
            <div className="space-y-2">
              <p
                className={
                  needsReview
                    ? "rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800"
                    : "text-sm text-muted-foreground"
                }
              >
                {needsReview
                  ? "Kunci ini dicabut karena diduga bocor, sehingga naskah-naskah berikut menjadi meragukan: siapa pun yang memegang passphrase itu bisa saja menandatanganinya. Tinjau dan cabut satu per satu — pencabutan kunci tidak melakukannya."
                  : "Naskah-naskah berikut tetap sah, dan memang harus tetap sah: setiap tanda tangan menyimpan salinan kunci publiknya sendiri, sehingga pergantian pejabat tidak membatalkan surat yang pernah diterbitkannya."}
              </p>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {affected.map((l) => (
                  <li key={l.signatureId} className="rounded border p-2">
                    <Link
                      href={`/e-office/letter/${l.letterId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {l.letterNumber || "(tanpa nomor)"}
                    </Link>
                    <span className="block text-muted-foreground">
                      {l.subject ?? "—"} · ditandatangani {fmt(l.signedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setAffected(null)}>
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
