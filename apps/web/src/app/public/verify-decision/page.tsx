"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useVerifyFoundationDecision,
  FOUNDATION_ORGAN_LABEL,
  FOUNDATION_STATUS_LABEL,
  FOUNDATION_KIND_LABEL,
} from "@/hooks/use-foundation-decisions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, ShieldX, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Verifikasi publik keputusan organ yayasan.
 *
 * Berada di bawah `/public/*` dan TIDAK memakai shell aplikasi, sehingga pemindai
 * QR anonim tidak pernah dibelokkan ke layar login staf. Endpoint yang
 * dipanggil (`/foundation/verify`) memang publik; halaman internal lama berada
 * di balik tembok sesi, yang membuat tautan di PDF risalah tidak berguna bagi
 * orang luar.
 */
function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { data, isLoading, error } = useVerifyFoundationDecision(token);
  const [manualToken, setManualToken] = useState(token);

  // Token yang ditempel/diubah di kolom manual menggantikan token URL tanpa
  // merusak riwayat peramban.
  useEffect(() => {
    setManualToken(token);
  }, [token]);

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
            Periksa keabsahan risalah/keputusan organ dengan token yang tercetak
            di dokumen.
          </p>
        </div>

        {!token && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Masukkan Token Verifikasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Token tercetak pada bagian &ldquo;Pemeriksaan Keabsahan&rdquo; di
                risalah PDF, atau tersemat pada tautan QR.
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
                  Verifikasi
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {token && isLoading && (
          <p className="text-center text-sm text-muted-foreground">
            Memeriksa keabsahan…
          </p>
        )}

        {token && !isLoading && error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 pt-8">
              <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                Gagal memeriksa token. Coba beberapa saat lagi.
              </p>
            </CardContent>
          </Card>
        )}

        {token && !isLoading && !error && data && !data.found && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 pt-8">
              <ShieldX className="h-8 w-8 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">
                  Keputusan tidak ditemukan atau belum final.
                </p>
                <p className="text-sm text-muted-foreground">
                  Token tidak cocok dengan keputusan yang sah.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {token && !isLoading && !error && data?.found && (
          <Card className="border-emerald-300 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" /> Keputusan
                Sah
                <Badge className="ml-auto bg-emerald-100 text-emerald-700">
                  {FOUNDATION_STATUS_LABEL[data.status ?? "APPROVED"]}
                </Badge>
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
                `digestOk` membandingkan byte arsip PDF dengan digest yang
                ditandatangani; `sealVerified` membuktikan tanda tangannya
                berasal dari kunci e-seal Yayasan. Satu bisa benar sementara
                yang lain salah, dan pembaca berhak tahu yang mana.
              */}
              {data.digestOk === true && (
                <div className="flex items-start gap-2 border-t pt-3 text-xs text-emerald-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Byte arsip cocok dengan digest yang ditandatangani
                    (SHA-256 {data.digest?.slice(0, 16)}…).
                  </span>
                </div>
              )}
              {data.digestOk === false && (
                <div className="flex items-start gap-2 border-t pt-3 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Byte arsip TIDAK cocok dengan digest yang ditandatangani —
                    dokumen ini telah berubah setelah disahkan.
                  </span>
                </div>
              )}
              {data.sealVerified === true && (
                <div className="flex items-center gap-2 text-xs text-emerald-600">
                  <ShieldCheck className="h-4 w-4" />
                  <span>E-seal Yayasan terverifikasi.</span>
                </div>
              )}
              {data.sealVerified === false && (
                <p className="text-xs text-destructive">
                  Tanda tangan e-seal gagal diverifikasi.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
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