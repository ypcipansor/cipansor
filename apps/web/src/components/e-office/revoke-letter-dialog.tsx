"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useRequestRevocation, useRevokeLetter } from "@/hooks/use-esign";
import { AlertTriangle, Send, Undo2 } from "lucide-react";

/** Sama dengan MIN_REVOCATION_REASON_LENGTH di server. */
const MIN_REASON = 10;

/**
 * Pencabutan naskah dinas — mencabut, atau memohonkan pencabutan.
 *
 * Satu jendela, dua perbuatan, ditentukan oleh kewenangan pemanggilnya. Itu
 * bukan kemalasan menaruhnya bersama: bagi yang membukanya, keduanya menjawab
 * niat yang sama ("naskah ini keliru"), dan yang berbeda hanyalah apakah ia
 * sendiri yang berhak memutuskan. Menyembunyikan tombolnya sama sekali bagi
 * yang tidak berwenang berarti petugas tata usaha yang menemukan nomor ganda
 * tidak punya saluran apa pun.
 *
 * Tiga hal yang wajib terbaca sebelum tombolnya ditekan, dan ketiganya tertulis
 * di sini, bukan disembunyikan di balik "Anda yakin?":
 *
 * 1. **Alasannya dibaca publik** — apa adanya, di halaman verifikasi.
 * 2. **Tidak dapat dibatalkan** — naskah yang keliru dicabut harus diterbitkan
 *    dan ditandatangani ulang.
 * 3. **Menuntut passphrase** — passphrase pencabutnya sendiri, sebab pencabutan
 *    adalah pernyataan kriptografis dan ditandatangani seperti halnya CRL.
 */
export function RevokeLetterDialog({
  letterId,
  letterNumber,
  canRevoke,
  whoMayRevokeText,
  open,
  onOpenChange,
}: {
  letterId: string;
  letterNumber?: string | null;
  /** Pemanggil berwenang memutuskan sendiri, bukan sekadar memohonkan. */
  canRevoke: boolean;
  /** Kalimat yang menyebut kepada siapa permohonan ditujukan. */
  whoMayRevokeText: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const revoke = useRevokeLetter();
  const request = useRequestRevocation();
  const [reason, setReason] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;
  const pending = revoke.isPending || request.isPending;
  const blocked = pending || tooShort || (canRevoke && !passphrase);

  function reset() {
    setReason("");
    setPassphrase("");
    setAttachmentUrl("");
  }

  async function submit() {
    try {
      if (canRevoke) {
        await revoke.mutateAsync({ letterId, reason: trimmed, passphrase });
        toast.success("Naskah dinas telah dicabut.");
      } else {
        await request.mutateAsync({
          letterId,
          reason: trimmed,
          attachmentUrl: attachmentUrl.trim() || undefined,
        });
        toast.success("Permohonan pencabutan terkirim.");
      }
      reset();
      onOpenChange(false);
    } catch (e: any) {
      setPassphrase(""); // tidak pernah bertahan setelah dikirim
      toast.error(
        e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          (canRevoke ? "Gagal mencabut naskah" : "Gagal mengirim permohonan")
      );
    }
  }

  function close(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700">
            {canRevoke ? <Undo2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            {canRevoke ? "Pencabutan Naskah Dinas" : "Ajukan Pencabutan Naskah Dinas"}
          </DialogTitle>
          <DialogDescription>
            {canRevoke ? (
              <>
                {letterNumber ? `Naskah ${letterNumber}` : "Naskah ini"} akan
                dinyatakan tidak lagi berlaku. Suratnya tetap tersimpan dalam
                agenda — yang dicabut adalah keberlakuannya.
              </>
            ) : (
              <>
                Anda tidak berwenang mencabut naskah ini sendiri. {whoMayRevokeText}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Alasan ini dibaca publik.</p>
              <p>
                Siapa pun yang mengunggah berkas naskah ini ke halaman verifikasi
                akan membacanya apa adanya. Tulislah keterangan yang memang
                pantas dibaca umum — jangan memuat data pribadi atau hal yang
                bersifat rahasia.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revoke-reason">Alasan pencabutan</Label>
            <Textarea
              id="revoke-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Nomor surat ganda dengan 433/…; naskah pengganti diterbitkan dengan nomor 441/…"
            />
            <p className="text-xs text-muted-foreground">
              Sekurang-kurangnya {MIN_REASON} karakter
              {tooShort && trimmed.length > 0
                ? ` — kurang ${MIN_REASON - trimmed.length} lagi`
                : ""}
              .
            </p>
          </div>

          {canRevoke ? (
            <div className="space-y-1.5">
              <Label htmlFor="revoke-pass">Passphrase tanda tangan Anda</Label>
              <Input
                id="revoke-pass"
                type="password"
                autoComplete="off"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Passphrase tanda tangan elektronik Anda"
              />
              <p className="text-xs text-muted-foreground">
                Passphrase Anda sendiri, bukan passphrase penandatangannya.
                Pencabutan ditandatangani secara elektronik agar dapat
                dibuktikan di halaman verifikasi publik — dan agar sesi yang
                tertinggal terbuka tidak cukup untuk menarik surat resmi.
                Pencabutan tidak dapat dibatalkan.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="revoke-attachment">Tautan berkas pendukung (opsional)</Label>
              <Input
                id="revoke-attachment"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="Tautan bukti: naskah pengganti, notulen rapat, …"
              />
              <p className="text-xs text-muted-foreground">
                Permohonan tidak mengubah apa pun pada naskahnya sampai
                diputuskan pejabat yang berwenang.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(false)}>
              Batal
            </Button>
            <Button
              variant={canRevoke ? "destructive" : "default"}
              onClick={submit}
              disabled={blocked}
            >
              {pending
                ? canRevoke
                  ? "Mencabut…"
                  : "Mengirim…"
                : canRevoke
                  ? "Cabut Naskah"
                  : "Kirim Permohonan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
