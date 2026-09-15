"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MainLayout } from "@/components/layout";
import {
  useVerifyFoundationDecision,
  FOUNDATION_ORGAN_LABEL,
  FOUNDATION_STATUS_LABEL,
  FOUNDATION_KIND_LABEL,
} from "@/hooks/use-foundation-decisions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, ShieldX, CheckCircle2 } from "lucide-react";

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { data, isLoading, error } = useVerifyFoundationDecision(token);
  const [manualToken, setManualToken] = useState(token);

  if (!token) {
    return (
      <Card className="max-w-md">
        <CardContent className="space-y-3 pt-8">
          <p className="text-sm text-muted-foreground">
            Masukkan token verifikasi dari risalah/keputusan untuk memeriksa
            keabsahannya.
          </p>
          <div className="space-y-1.5">
            <Label>Token Verifikasi</Label>
            <Input
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
            />
          </div>
          <Button asChild>
            <a
              href={`/foundation/decisions/verify?token=${encodeURIComponent(manualToken)}`}
            >
              Verifikasi
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isLoading && (
        <p className="text-sm text-muted-foreground">Memeriksa keabsahan…</p>
      )}
      {!isLoading && !error && data && !data.found && (
        <Card className="max-w-lg border-destructive">
          <CardContent className="flex items-center gap-3 pt-8">
            <ShieldX className="h-8 w-8 text-destructive" />
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
      {!isLoading && !error && data?.found && (
        <Card className="max-w-2xl border-emerald-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Keputusan Sah
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
            {data.digestOk && (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Digest dokumen: {data.digestOk}</span>
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
  );
}

export default function VerifyFoundationDecisionPage() {
  return (
    <MainLayout>
      <PageHeader
        title="Verifikasi Keputusan Yayasan"
        description="Periksa keabsahan risalah/keputusan organ dengan token yang tercetak di dokumen."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}
      >
        <VerifyContent />
      </Suspense>
    </MainLayout>
  );
}
