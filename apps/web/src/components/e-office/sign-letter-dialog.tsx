"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useSignLetter } from "@/hooks/use-esign";
import { getPublicVerifyUrl } from "@/config/site";
import { PenLine, ShieldCheck } from "lucide-react";

/**
 * Membubuhkan tanda tangan elektronik pada surat.
 *
 * Passphrase diminta di sini dan hanya di sini: ia tidak diambil dari sesi,
 * tidak disimpan, dan dibersihkan segera setelah dikirim. Itulah yang membuat
 * tanda tangan berarti "orang ini menandatangani sekarang", bukan sekadar
 * "sesi ini sedang terbuka".
 *
 * Setelah berhasil, QR ditampilkan untuk dibubuhkan pada naskah. QR hanya
 * memuat URL verifikasi — tidak memuat tanda tangan, apalagi isi surat.
 */
export function SignLetterDialog({
  letterId,
  letterNumber,
  open,
  onOpenChange,
}: {
  letterId: string;
  letterNumber?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const sign = useSignLetter();
  const [passphrase, setPassphrase] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const publicVerifyUrl =
    typeof window !== "undefined"
      ? getPublicVerifyUrl(window.location.origin)
      : getPublicVerifyUrl("https://cipansor.or.id");

  async function submit() {
    try {
      const res = await sign.mutateAsync({ letterId, passphrase });
      setPassphrase(""); // tidak disimpan, bahkan tidak di state
      setToken(res.verificationToken);
      toast.success("Surat berhasil ditandatangani.");
    } catch (e: any) {
      setPassphrase("");
      toast.error(
        e?.response?.data?.message ?? "Gagal menandatangani surat"
      );
    }
  }

  function close(v: boolean) {
    if (!v) {
      setPassphrase("");
      setToken(null);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Tanda Tangan Elektronik
          </DialogTitle>
          <DialogDescription>
            {letterNumber ? `Surat ${letterNumber}` : "Surat keluar"} akan
            ditandatangani secara elektronik dan tidak dapat diubah lagi
            setelahnya.
          </DialogDescription>
        </DialogHeader>

        {!token ? (
          <div className="space-y-3">
            <Label htmlFor="sign-pass">Passphrase tanda tangan</Label>
            <Input
              id="sign-pass"
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase tanda tangan Anda"
              onKeyDown={(e) => {
                if (e.key === "Enter" && passphrase) submit();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Berbeda dari password akun. Setelah ditandatangani, setiap
              perubahan pada naskah akan membuat tanda tangan tidak lagi sah.
            </p>
            <Button
              onClick={submit}
              disabled={sign.isPending || !passphrase}
              className="w-full"
            >
              {sign.isPending ? "Menandatangani…" : "Tandatangani Surat"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Surat telah ditandatangani
            </div>

            {token && (
              <>
                <div className="flex justify-center rounded-lg bg-white p-4">
                  <QRCodeCanvas value={token} size={180} level="M" />
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  Verifikasi keaslian: {publicVerifyUrl}
                </p>
                <p className="text-xs text-muted-foreground">
                  QR ini sudah tercetak pada naskah suratnya — cukup unduh
                  PDF-nya. Untuk memverifikasi keaslian, unggah file PDF pada portal {publicVerifyUrl}.
                </p>
              </>
            )}

            <Button variant="outline" className="w-full" onClick={() => close(false)}>
              Selesai
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
