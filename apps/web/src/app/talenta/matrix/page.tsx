"use client";

import { useTalentAnalytics } from "@/hooks/use-talenta";
import { PageHeader } from "@/components/shared/page-header";
import { TalentMatrix } from "@/components/hr/talent-matrix";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MainLayout } from "@/components/layout";

function TalentMatrixPageContent() {
  const { data: analytics, isLoading, error } = useTalentAnalytics();

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader
          title="Talent Matrix (9-Box Grid)"
          description="Visualisasi distribusi talenta SDM"
        />
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Gagal memuat data talenta. Pastikan Anda memiliki akses yang cukup.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <PageHeader
        title="Talent Matrix (9-Box Grid)"
        description="Analisis Performance vs Potential untuk perencanaan suksesi dan pengembangan SDM"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <Card className="shadow-md">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle>9-Box Grid</CardTitle>
              <CardDescription>
                Pemetaan talenta berdasarkan hasil penilaian terbaru
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <TalentMatrix profiles={analytics.profiles} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ringkasan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-sm font-medium text-slate-500">
                  Total Talenta
                </span>
                <span className="text-xl font-bold">{analytics.total}</span>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Top Categories
                </span>
                <div className="space-y-3 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">High Potential</span>
                    <span className="text-sm font-bold text-purple-600">
                      {analytics.distribution.HIGH_POTENTIAL || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Key Talent</span>
                    <span className="text-sm font-bold text-green-600">
                      {analytics.distribution.KEY_TALENT || 0}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold">Panduan 9-Box</AlertTitle>
            <AlertDescription className="text-[11px] leading-relaxed mt-1 text-slate-600">
              Matriks ini membantu identifikasi calon pemimpin masa depan.
              <strong> High Potential</strong> (Kanan Atas) adalah kandidat
              prioritas untuk suksesi jabatan strategis.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}

export default function TalentMatrixPage() {
  return (
    <MainLayout>
      <TalentMatrixPageContent />
    </MainLayout>
  );
}
