"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useVerifyFoundationDecision,
  useVerifyFoundationDecisionPdf,
  FOUNDATION_ORGAN_LABEL,
  FOUNDATION_STATUS_LABEL,
  FOUNDATION_KIND_LABEL,
} from "@/hooks/use-foundation-decisions";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FoundationDecisionVerificationDTO } from "@cipansor/shared";
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Upload,
  FileUp,
  RefreshCw,
  Lock,
} from "lucide-react";

/**
 * Verifikasi publik keputusan organ yayasan.
 *
 * Berada di bawah `/public/*` dan TIDAK memakai shell aplikasi, sehingga pemindai
 * QR anonim tidak pernah dibelokkan ke layar login staf.
 *
 * **Dua jalur, dan keduanya dijawab oleh server, bukan oleh UI.**
 *
 * Jalur token hanya memeriksa arsip yang tersimpan di server: ia membuktikan
 * catatan server belum berubah, dan TIDAK membuktikan apa pun tentang berkas
 * yang ada di tangan pemindai. Pemalsu cukup mempertahankan token asli pada
 * PDF karangannya. Karena itu halaman ini menyediakan jalur unggahan, yang
 * membandingkan hash byte berkas pembaca dengan digest yang ditandatangani —
 * itulah bukti yang mengikat keabsahan pada dokumen yang benar-benar dipegang
 * orang. Judul "sah" hanya keluar dari `isValid` (semua pemeriksaan lulus),
 * bukan dari `found` saja.
 */
function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  // --- Jalur token (QR) ---
  const {
    data: tokenData,
    isLoading: tokenLoading,
    error: tokenError,
  } = useVerifyFoundationDecision(token);
  const [manualToken, setManualToken] = useState(token);
  useEffect(() => {
    setManualToken(token);
  }, [token]);

  // --- Jalur unggahan PDF ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] =
    useState<FoundationDecisionVerificationDTO | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const turnstile = useTurnstile();
  const verifyPdf = useVerifyFoundationDecisionPdf();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setUploadError("Format berkas harus PDF.");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleVerifyPdf = async () => {
    if (!selectedFile) {
      setUploadError("Pilih berkas PDF risalah terlebih dahulu.");
      return;
    }
    if (!turnstile.ready) {
      setUploadError(
        turnstile.blocked
          ? "Verifikasi keamanan tidak dapat dimuat. Ikuti petunjuk di kotak verifikasi di bawah."
          : "Verifikasi keamanan belum selesai. Tunggu sesaat, lalu coba lagi.",
      );
      return;
    }
    setUploadError(null);
    setUploadResult(null);
    try {
      const data = await verifyPdf.mutateAsync({
        file: selectedFile,
        turnstileToken: turnstile.token,
      });
      setUploadResult(data);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
      setUploadError(
        e.response?.status === 429
          ? "Terlalu banyak permintaan verifikasi. Silakan tunggu beberapa saat."
          : e.response?.data?.error?.message ??
              "Terjadi kesalahan saat memverifikasi berkas.",
      );
    } finally {
      turnstile.refresh();
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="mb-2 inline-flex rounded-full bg-blue-100 p-3 text-blue-700">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Verifikasi Keputusan Yayasan
          </h1>
          <p className="text-sm text-slate-600">
            Unggah berkas PDF risalah/keputusan untuk memeriksa keabsahannya.
          </p>
        </div>

        {/* Jalur utama: unggah berkas. Inilah satu-satunya klaim keabsahan. */}
        <Card className="border-slate-200 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5 text-blue-600" />
              Unggah Berkas PDF Risalah
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Keabsahan diikat pada byte berkas yang Anda pegang: hash berkas
              Anda dibandingkan dengan digest yang ditandatangani e-seal
              Yayasan. Berkas hasil pindai ulang, cetak ulang, atau kiriman
              aplikasi pesan akan tampak tidak sah — mintalah berkas aslinya.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="pdf-file">Berkas PDF</Label>
              <Input
                id="pdf-file"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="cursor-pointer bg-white"
              />
              {selectedFile && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                  <FileUp className="h-3.5 w-3.5 text-blue-600" />
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {turnstile.required && (
              <div className="space-y-2 rounded-md border bg-slate-100 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <Lock className="h-4 w-4 text-blue-600" />
                  Verifikasi keamanan
                </div>
                <TurnstileWidget
                  action="verify-decision"
                  {...turnstile.widgetProps}
                />
              </div>
            )}

            <Button
              className="w-full bg-blue-600 font-semibold text-white hover:bg-blue-700"
              onClick={handleVerifyPdf}
              disabled={verifyPdf.isPending || !selectedFile || !turnstile.ready}
            >
              {verifyPdf.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Memeriksa berkas…
                </>
              ) : (
                "Verifikasi Berkas"
              )}
            </Button>

            {uploadError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {uploadResult && <VerificationResult data={uploadResult} uploaded />}

        {/* Jalur token: hanya menyatakan "tercatat", tidak pernah "sah". */}
        {!token && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">
                Sudah punya token dari QR?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Token hanya menunjukkan bahwa keputusan ini tercatat di sistem
                Yayasan beserta arsipnya. Untuk membuktikan <em>berkas yang Anda
                pegang</em> adalah berkas resmi, unggah PDF-nya di atas.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="token">Token Verifikasi</Label>
                <Input
                  id="token"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="mis. 3f9a…"
                />
              </div>
              <Button asChild disabled={!manualToken}>
                <a
                  href={`/public/verify-decision?token=${encodeURIComponent(manualToken)}`}
                >
                  Periksa Token
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {token && tokenLoading && (
          <p className="text-center text-sm text-muted-foreground">
            Memeriksa token…
          </p>
        )}

        {token && !tokenLoading && tokenError && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 pt-8">
              <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                Gagal memeriksa token. Coba beberapa saat lagi.
              </p>
            </CardContent>
          </Card>
        )}

        {token && !tokenLoading && !tokenError && tokenData && (
          <VerificationResult data={tokenData} uploaded={false} />
        )}
      </div>
    </main>
  );
}

/**
 * Hasil verifikasi, dengan judul yang bergantung pada `isValid`.
 *
 * Judul "sah" TIDAK boleh keluar dari `found` saja. Sebuah rekaman dapat
 * ditemukan tetapi gagal diperiksa — `digestOk === false` (berkas diubah) atau
 * `sealVerified === false`/`null` (tanda tangan tidak terbukti / tidak
 * tersedia). Rekaman seperti itu dulu tetap diberi judul "Keputusan Sah",
 * yang persis menjawab kebalikan dari apa yang diketahui sistem. Di sini
 * `isValid` adalah satu-satunya sumber judul, dan tiap pemeriksaan yang gagal
 * atau tidak dapat dijalankan ditampilkan apa adanya.
 */
function VerificationResult({
  data,
  uploaded,
}: {
  data: FoundationDecisionVerificationDTO;
  uploaded: boolean;
}) {
  if (!data.found) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex items-center gap-3 pt-8">
          <ShieldX className="h-8 w-8 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">
              {uploaded
                ? "Berkas ini tidak terdaftar sebagai keputusan resmi."
                : "Keputusan tidak ditemukan atau belum final."}
            </p>
            <p className="text-sm text-muted-foreground">
              {data.reason ??
                "Tidak ada rekaman yang cocok dengan permintaan Anda."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const valid = data.isValid === true;
  return (
    <Card
      className={
        valid
          ? "border-emerald-300 shadow-lg"
          : "border-amber-300 bg-amber-50/30 shadow-lg"
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {valid ? (
            <>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Dokumen Sah &amp; Terverifikasi
              <Badge className="ml-auto bg-emerald-100 text-emerald-700">
                {FOUNDATION_STATUS_LABEL[data.status ?? "APPROVED"]}
              </Badge>
            </>
          ) : (
            <>
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Rekaman Tercatat — Keabsahan Tidak Terbukti
              <Badge className="ml-auto bg-amber-100 text-amber-800">
                {FOUNDATION_STATUS_LABEL[data.status ?? "APPROVED"]}
              </Badge>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="font-medium">{data.subject}</p>
          <p className="text-muted-foreground">
            {data.organType ? FOUNDATION_ORGAN_LABEL[data.organType] : ""} ·{" "}
            {data.kind ? FOUNDATION_KIND_LABEL[data.kind] : ""}
          </p>
          {data.decidedAt && (
            <p className="text-muted-foreground">
              Diputus {new Date(data.decidedAt).toLocaleString("id-ID")}
            </p>
          )}
        </div>

        {!valid && data.reason && (
          <p className="rounded-md border border-amber-300 bg-amber-100 p-3 text-amber-900">
            {data.reason}
          </p>
        )}

        <div className="grid grid-cols-4 gap-3 border-t pt-3 text-center">
          <div>
            <p className="text-lg font-semibold">{data.approveCount}</p>
            <p className="text-xs text-muted-foreground">Setuju</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{data.rejectCount}</p>
            <p className="text-xs text-muted-foreground">Tidak Setuju</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{data.abstainCount}</p>
            <p className="text-xs text-muted-foreground">Abstain</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{data.voteCount}</p>
            <p className="text-xs text-muted-foreground">Total Suara</p>
          </div>
        </div>

        {/*
          Dua pemeriksaan yang berbeda, dan sengaja dipisah.
          `digestOk` membandingkan byte berkas yang diperiksa dengan digest yang
          ditandatangani; `sealVerified` membuktikan tanda tangannya berasal
          dari kunci e-seal Yayasan. Satu bisa benar sementara yang lain salah,
          dan pembaca berhak tahu yang mana.
        */}
        {data.digestOk === true && (
          <div className="flex items-start gap-2 border-t pt-3 text-xs text-emerald-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {uploaded
                ? "Berkas yang Anda unggah cocok byte-per-byte"
                : "Arsip server cocok"}{" "}
              dengan digest yang ditandatangani (SHA-256{" "}
              {data.digest?.slice(0, 16)}…).
            </span>
          </div>
        )}
        {data.digestOk === false && (
          <div className="flex items-start gap-2 border-t pt-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {uploaded
                ? "Berkas yang Anda unggah TIDAK cocok dengan digest yang ditandatangani — isinya telah berubah, atau ini bukan berkas aslinya."
                : "Byte arsip TIDAK cocok dengan digest yang ditandatangani — arsip telah berubah setelah disahkan."}
            </span>
          </div>
        )}
        {data.digestOk === null && (
          <div className="flex items-start gap-2 border-t pt-3 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Tidak ada byte yang dapat dibandingkan dengan digest.</span>
          </div>
        )}
        {data.sealVerified === true && (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <ShieldCheck className="h-4 w-4" />
            <span>E-seal Yayasan terverifikasi terhadap kunci publiknya.</span>
          </div>
        )}
        {data.sealVerified === false && (
          <p className="text-xs text-destructive">
            Tanda tangan e-seal gagal diverifikasi.
          </p>
        )}
        {data.sealVerified === null && (
          <p className="text-xs text-amber-700">
            Tanda tangan e-seal tidak tersedia untuk diperiksa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PublicVerifyDecisionPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center">Memuat halaman verifikasi...</div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}