"use client";
import { MainLayout } from "@/components/layout";

import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { getEffectiveRole, getPrimaryRoleCode } from "@/lib/rbac";
import { usePKList, usePerformanceDashboard } from "@/hooks/use-performance";
import { usePlans } from "@/hooks/use-perencanaan";
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
  FileText,
  TrendingUp,
  Award,
  ArrowRight,
  ShieldCheck,
  Building2,
  ListTodo,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  BarChart3,
  Users,
} from "lucide-react";

function KinerjaHubPageContent() {
  const { user } = useAuthStore();
  const effectiveRole = user ? getEffectiveRole(user) || user.role : "GURU";
  const primaryRoleCode = user ? getPrimaryRoleCode(user) || "" : "";

  const leadershipRoles = [
    "SUPER_ADMIN",
    "YAYASAN_KETUA",
    "YAYASAN_PEMBINA",
    "YAYASAN_PENGAWAS",
    "TKQ_ADMIN",
    "SDIT_ADMIN",
    "SMPIT_ADMIN",
    "SMAQ_ADMIN",
    "TKQ_KEPALA_SEKOLAH",
    "SDIT_KEPALA_SEKOLAH",
    "SMPIT_KEPALA_SEKOLAH",
    "SMAQ_KEPALA_SEKOLAH",
    "PESANTREN_PENGASUH",
    "PESANTREN_DIREKTUR",
    "PT_REKTOR",
    "PT_WAKIL_REKTOR",
    "PT_DEKAN",
    "PT_KAPRODI",
    "UNIT_ADMIN",
  ];

  const isExecutive =
    leadershipRoles.includes(effectiveRole) ||
    leadershipRoles.includes(primaryRoleCode) ||
    user?.role === "SUPER_ADMIN";

  const { data: pks, isLoading: loadingPK } = usePKList();
  const { data: dashboard, isLoading: loadingDashboard } = usePerformanceDashboard(isExecutive);
  const { data: plans } = usePlans();

  const myPk = pks?.find((p) => p.user?.id === user?.id);
  const subordinatesPk = pks?.filter((p) => p.supervisor?.id === user?.id) || [];

  return (
    <div className="container mx-auto space-y-8 p-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <Badge className="bg-emerald-500/30 text-emerald-200 backdrop-blur-md border-emerald-400/30 px-3 py-1">
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-300" />
            Sistem Manajemen Kinerja Terintegrasi Cipansor
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Manajemen Kinerja: Perencanaan Strategis, Perjanjian & Evaluasi
          </h1>
          <p className="text-emerald-100/90 text-sm leading-relaxed sm:text-base">
            Mengintegrasikan alur <b>RPJP (20 Thn) &rarr; Renstra (5 Thn) &rarr; RKA (1 Thn)</b> ke dalam <b>Perjanjian Kinerja (PK) Pegawai</b> serta Evaluasi Bulanan berbasis Budaya Perilaku <b>SAFTI</b> (Siddiq, Amanah, Fathonah, Tabligh, Istiqomah).
          </p>
        </div>
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Layers className="h-96 w-96 text-white" />
        </div>
      </div>

      {/* Workflow Visualizing Banner */}
      <Card className="border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-600" />
            Alur Proses Bisnis Manajemen Kinerja (Indonesian Best Practice)
          </CardTitle>
          <CardDescription>
            Menjamin keselarasan (*cascading*) dari Visi Yayasan hingga ke target individu pegawai
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center">
            <div className="p-3 bg-background rounded-lg border shadow-sm flex flex-col items-center justify-center space-y-1">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">1. RPJP (20 Thn)</Badge>
              <span className="text-xs text-muted-foreground font-medium">Visi & Sasaran Visi (IUP)</span>
            </div>
            <div className="hidden md:flex items-center justify-center text-muted-foreground font-bold">&rarr;</div>
            <div className="p-3 bg-background rounded-lg border shadow-sm flex flex-col items-center justify-center space-y-1">
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">2. Renstra (5 Thn)</Badge>
              <span className="text-xs text-muted-foreground font-medium">Misi & IKU Unit</span>
            </div>
            <div className="hidden md:flex items-center justify-center text-muted-foreground font-bold">&rarr;</div>
            <div className="p-3 bg-background rounded-lg border shadow-sm flex flex-col items-center justify-center space-y-1">
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">3. RKA (1 Thn)</Badge>
              <span className="text-xs text-muted-foreground font-medium">Kegiatan & RAB Unit</span>
            </div>
            <div className="hidden md:flex items-center justify-center text-muted-foreground font-bold md:col-span-5 text-emerald-600">&darr; Cascading Target</div>
            <div className="p-3 bg-background rounded-lg border shadow-sm flex flex-col items-center justify-center space-y-1 md:col-span-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">4. Perjanjian Kinerja (PK)</Badge>
              <span className="text-xs text-muted-foreground font-medium">Target Hasil Kerja (KPI Individu)</span>
            </div>
            <div className="hidden md:flex items-center justify-center text-muted-foreground font-bold">&rarr;</div>
            <div className="p-3 bg-background rounded-lg border shadow-sm flex flex-col items-center justify-center space-y-1 md:col-span-2">
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">5. Evaluasi & Perilaku SAFTI</Badge>
              <span className="text-xs text-muted-foreground font-medium">Realisasi Bulanan + Skor SAFTI</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PK Saya</CardTitle>
            <FileText className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {myPk ? (
                <Badge className={
                  myPk.status === "APPROVED" ? "bg-emerald-500" :
                  myPk.status === "PROPOSED" ? "bg-amber-500" : "bg-gray-400"
                }>
                  {myPk.status}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm font-normal">Belum disusun</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {myPk ? `${myPk.indicators?.length || 0} Indikator Kinerja` : "Buat dokumen Perjanjian Kinerja baru"}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Capaian Kinerja YTD</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {myPk ? `${myPk.totalScore?.toFixed(1) || 0}%` : "0%"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Rata-rata realisasi indikator kinerja
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Nilai Perilaku SAFTI</CardTitle>
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {myPk ? `${myPk.behaviorScore?.toFixed(1) || 0}` : "0"} / 100
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Siddiq, Amanah, Fathonah, Tabligh, Istiqomah
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Persyaratan Bawahan</CardTitle>
            <Users className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{subordinatesPk.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {subordinatesPk.filter(p => p.status === "PROPOSED").length} menunggu persetujuan
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Core Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:border-emerald-500 transition-all flex flex-col justify-between">
          <CardHeader>
            <div className="p-3 w-fit rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 mb-2">
              <FileText className="h-6 w-6" />
            </div>
            <CardTitle>Perjanjian Kinerja (PK)</CardTitle>
            <CardDescription>
              Susun target hasil kerja tahunan yang diturunkan dari RKA & Renstra unit kerja Anda.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/kinerja/pk">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                Kelola PK Saya & Bawahan
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-purple-500 transition-all flex flex-col justify-between">
          <CardHeader>
            <div className="p-3 w-fit rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 mb-2">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle>Evaluasi & Perilaku SAFTI</CardTitle>
            <CardDescription>
              Input realisasi capaian bulanan dan evaluasi nilai perilaku akhlak mulia pegawai.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/kinerja/evaluasi">
              <Button variant="outline" className="w-full border-purple-200 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950">
                Evaluasi Periodik Bulanan
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {isExecutive && (
          <Card className="hover:border-blue-500 transition-all flex flex-col justify-between">
            <CardHeader>
              <div className="p-3 w-fit rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 mb-2">
                <BarChart3 className="h-6 w-6" />
              </div>
              <CardTitle>Analytics & Strategy Map</CardTitle>
              <CardDescription>
                Visualisasi matriks korelasi alur RPJP &rarr; Renstra &rarr; RKA &rarr; PK & Laporan Konsolidasi.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link href="/kinerja/analytics">
                <Button variant="outline" className="w-full border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950">
                  Dashboard & Report
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Strategic Cascading Shortcut Section */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                Integrasi Perencanaan Strategis (RPJP, Renstra & RKA)
              </CardTitle>
              <CardDescription>
                Rujukan dokumen utama sumber pencapaian indikator kinerja pegawai
              </CardDescription>
            </div>
            <Link href="/perencanaan">
              <Button variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                Lihat Semua Dokumen Perencanaan &rarr;
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans?.slice(0, 3).map((plan) => (
              <div key={plan.id} className="p-4 rounded-lg border bg-card space-y-2">
                <div className="flex justify-between items-start">
                  <Badge variant="secondary">{plan.type}</Badge>
                  <span className="text-xs text-muted-foreground">{plan.progress}% selesai</span>
                </div>
                <h4 className="font-semibold text-sm line-clamp-1">{plan.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">{plan.description || "Dokumen perencanaan strategis unit/yayasan"}</p>
                <div className="pt-2">
                  <Link href={`/perencanaan/${plan.id}`}>
                    <Button variant="link" className="p-0 h-auto text-xs text-emerald-600">
                      Buka Dokumen Indikator &rarr;
                    </Button>
                  </Link>
                </div>
              </div>
            )) || (
              <div className="col-span-3 text-center py-6 text-muted-foreground text-sm">
                Memuat data dokumen perencanaan...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function KinerjaHubPage() {
  return (
    <MainLayout>
      <KinerjaHubPageContent />
    </MainLayout>
  );
}
