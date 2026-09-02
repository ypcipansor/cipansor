"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import {
  usePerformanceDashboard,
  usePerformanceConsolidatedReport,
  usePerformanceDrilldown,
} from "@/hooks/use-performance";
import type {
  PerformanceAgreementDTO,
  ConsolidatedUnitReportDTO,
} from "@cipansor/shared";
import { useUnits } from "@/hooks/use-units";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Building2,
  TrendingUp,
  ShieldCheck,
  FileText,
  ArrowLeft,
  Layers,
} from "lucide-react";

function PerformanceAnalyticsPageContent() {
  const { data: dashboard, isLoading: loadingDash } = usePerformanceDashboard();
  const { data: consolidated, isLoading: loadingConsolidated } = usePerformanceConsolidatedReport();
  const { data: units } = useUnits({ limit: 100 });

  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const { data: drilldown, isLoading: loadingDrill } = usePerformanceDrilldown(selectedUnitId);

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/kinerja">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics & Strategy Map Kinerja</h1>
            <p className="text-muted-foreground text-sm">
              Laporan eksekutif matriks capaian kinerja terintegrasi seluruh unit Yayasan Pesantren Cipansor
            </p>
          </div>
        </div>
      </div>

      {/* Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Dokumen PK</CardTitle>
            <FileText className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.totalAgreements || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboard?.approvedAgreements || 0} telah disetujui (APPROVED)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rata-Rata Kinerja Yayasan</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {dashboard?.avgPerformanceScore ? `${dashboard.avgPerformanceScore.toFixed(1)}%` : "0%"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Capaian realisasi IKU/KPI pegawai
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rata-Rata Perilaku SAFTI</CardTitle>
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {dashboard?.avgBehaviorScore ? `${dashboard.avgBehaviorScore.toFixed(1)}` : "0"} / 100
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Evaluasi akhlak mulia dan disiplin Islami
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Evaluasi Bulanan</CardTitle>
            <BarChart3 className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.totalEvaluations || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Evaluasi realisasi periodik
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Drilldown Unit Section */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" /> Drilldown Capaian per Unit Kerja
            </CardTitle>
            <CardDescription>
              Pilih sekolah atau unit kerja untuk melihat perincian cascading kinerja pegawai
            </CardDescription>
          </div>
          <div className="w-full sm:w-64">
            <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih unit kerja..." />
              </SelectTrigger>
              <SelectContent>
                {units?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedUnitId ? (
            <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              Silakan pilih unit kerja pada dropdown di atas untuk melihat drilldown laporan kinerja.
            </div>
          ) : loadingDrill ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Memuat data drilldown unit...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-emerald-50/50 border border-emerald-100 dark:bg-emerald-950/20">
                <div>
                  <span className="text-xs text-muted-foreground">Unit Kerja:</span>
                  <div className="font-bold text-base">{drilldown?.unit?.name}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">RKA/Renstra Unit Terkait:</span>
                  <div className="font-semibold text-emerald-700">{drilldown?.strategicPlan?.title || "Belum Ditetapkan"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Progres RKA Unit:</span>
                  <div className="font-bold text-base text-blue-600">{drilldown?.strategicPlan?.progress || 0}%</div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Atasan Penilai</TableHead>
                    <TableHead>Indikator PK</TableHead>
                    <TableHead>Skor Kinerja (KPI)</TableHead>
                    <TableHead>Skor Perilaku SAFTI</TableHead>
                    <TableHead>Overall Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drilldown?.agreements?.map((pk: PerformanceAgreementDTO) => (
                    <TableRow key={pk.id}>
                      <TableCell className="font-semibold">{pk.user?.name}</TableCell>
                      <TableCell>{pk.supervisor?.name || "-"}</TableCell>
                      <TableCell>{pk.indicators?.length || 0} Indikator</TableCell>
                      <TableCell className="font-medium text-blue-600">{pk.totalScore?.toFixed(1) || 0}%</TableCell>
                      <TableCell className="font-medium text-purple-600">{pk.behaviorScore?.toFixed(1) || 0}</TableCell>
                      <TableCell className="font-bold text-emerald-700">{pk.overallScore?.toFixed(1) || 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consolidated Report Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" /> Ringkasan Laporan Konsolidasi Kinerja Yayasan
          </CardTitle>
          <CardDescription>
            Rekapitulasi progres Perjanjian Kinerja dan Evaluasi bulanan di seluruh unit
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingConsolidated ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Memuat laporan konsolidasi...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit Kerja / Sekolah</TableHead>
                  <TableHead>Total Pegawai PK</TableHead>
                  <TableHead>PK Disetujui (APPROVED)</TableHead>
                  <TableHead>Rata-Rata Skor Kinerja (KPI)</TableHead>
                  <TableHead>Rata-Rata Skor SAFTI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consolidated?.units?.map((u: ConsolidatedUnitReportDTO) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold">{u.name}</TableCell>
                    <TableCell>{u.totalAgreements || 0} Pegawai</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-500">{u.approvedAgreements || 0} Approved</Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-blue-600">
                      {u.avgPerformanceScore ? `${u.avgPerformanceScore.toFixed(1)}%` : "0%"}
                    </TableCell>
                    <TableCell className="font-semibold text-purple-600">
                      {u.avgBehaviorScore ? `${u.avgBehaviorScore.toFixed(1)}` : "0"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PerformanceAnalyticsPage() {
  return (
    <MainLayout>
      <PerformanceAnalyticsPageContent />
    </MainLayout>
  );
}
