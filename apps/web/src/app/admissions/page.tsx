"use client";
import { MainLayout } from "@/components/layout";

import { useAdmissionPeriods, useRegistrants } from "@/hooks/use-admissions";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Calendar,
  ArrowUpRight,
  Loader2,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { id } from "date-fns/locale";

function UnifiedAdmissionsDashboardContent() {
  const { data: periodsResponse, isLoading: loadingPeriods } =
    useAdmissionPeriods();
  const { data: registrantsResponse, isLoading: loadingRegistrants } =
    useRegistrants({ limit: 10 });

  const periods = periodsResponse?.data || [];
  const registrants = registrantsResponse?.data || [];

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/*
        Written `flex justify-between items-start` rather than the
        `flex items-center justify-between` every other page header uses, which is
        why the sweep that fixed the other 116 headers passed straight over this
        one — same layout, different word order. It overflowed a 390px screen by
        58px, with "Registrasi Baru" hanging off the edge.
      */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Unified Admissions Management"
          description="Pusat kendali pendaftaran santri baru (PPDB & PSB) lintas unit"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/admissions/analytics">
              <BarChart3 className="mr-2 h-4 w-4" /> ROI & Analytics
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admissions/registrants/new">Registrasi Baru</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-primary text-primary-foreground shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="text-primary-foreground/70 text-xs font-bold uppercase">
              Live Stats
            </CardDescription>
            <CardTitle className="text-3xl font-black">
              {registrantsResponse?.meta?.total || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs">Total Pendaftar Aktif</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Periode Aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {periods.filter((p: any) => p.isActive).length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Diterima
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {registrants.filter((r: any) => r.status === "ACCEPTED").length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4" /> Menunggu Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {registrants.filter((r: any) => r.status === "REGISTERED").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="periods">Periode & Gelombang</TabsTrigger>
          <TabsTrigger value="registrants">Pendaftar Terbaru</TabsTrigger>
          <TabsTrigger value="analytics">Quick Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Periode Pendaftaran Aktif
                </CardTitle>
                <CardDescription>
                  Pilih periode untuk mengelola gelombang
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingPeriods ? (
                  <Loader2 className="h-6 w-6 animate-spin mx-auto my-4" />
                ) : periods.length > 0 ? (
                  periods.slice(0, 3).map((period: any) => (
                    <div
                      key={period.id}
                      className="p-4 rounded-xl border hover:border-primary transition-colors cursor-pointer group"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold">{period.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {period.unit?.name}
                          </p>
                        </div>
                        <Badge
                          variant={period.isActive ? "default" : "secondary"}
                        >
                          {period.isActive ? "Aktif" : "Selesai"}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                          Terdaftar: {period._count?.registrants || 0}/
                          {period.quota}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          asChild
                        >
                          <Link href={`/admissions/periods/${period.id}`}>
                            Kelola <ArrowUpRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-muted-foreground italic text-sm">
                    Tidak ada periode aktif.
                  </div>
                )}
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/admissions/periods">Lihat Semua Periode</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pendaftar Terbaru</CardTitle>
                <CardDescription>
                  Status pendaftaran yang perlu ditindaklanjuti
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {registrants.slice(0, 5).map((reg: any) => (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50/50 border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-xs font-bold">
                          {reg.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{reg.fullName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {reg.registrationNo}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] uppercase font-bold"
                      >
                        {reg.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/admissions/registrants">Semua Pendaftar</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-4">
        <div className="p-2 bg-emerald-600 rounded-lg text-white">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-emerald-900">
            Sistem Terpadu (Unified Admissions)
          </h4>
          <p className="text-xs text-emerald-800 mt-1 leading-relaxed opacity-80">
            Sistem ini kini melebur fungsi <b>PSB</b> dan <b>PPDB</b> menjadi
            satu alur manajemen pendaftaran yang efisien, mendukung pendaftaran
            lintas unit dari TK hingga SMA dalam satu dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedAdmissionsDashboardWithShell() {
  return (
    <MainLayout>
      <UnifiedAdmissionsDashboardContent />
    </MainLayout>
  );
}
