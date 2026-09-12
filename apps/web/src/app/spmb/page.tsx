"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus,
  Users,
  ClipboardList,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Settings,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

import { useRegistrants, useAdmissionPeriods, useActiveAdmissionWaves } from "@/hooks/use-admissions";

export default function SPMBPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: registrantsData } = useRegistrants();
  const { data: acceptedData } = useRegistrants({ status: "ACCEPTED" });
  const { data: pendingData } = useRegistrants({ status: "DOCUMENT_CHECK" });
  const { data: testScheduledData } = useRegistrants({ status: "TEST_SCHEDULED" });
  const { data: periodsData } = useAdmissionPeriods();
  const { data: activeWavesData } = useActiveAdmissionWaves();

  const totalRegistrants = registrantsData?.meta?.total ?? registrantsData?.data?.length ?? 0;
  const acceptedCount = acceptedData?.meta?.total ?? acceptedData?.data?.length ?? 0;
  const pendingCount = pendingData?.meta?.total ?? pendingData?.data?.length ?? 0;
  const testScheduledCount =
    testScheduledData?.meta?.total ?? testScheduledData?.data?.length ?? 0;
  const totalPeriods = periodsData?.meta?.total ?? periodsData?.data?.length ?? 0;
  const activeWavesCount = activeWavesData?.pagination?.total ?? activeWavesData?.data?.length ?? 0;

  const menuItems = [
    {
      title: "Gelombang SPMB",
      description: "Kelola periode dan gelombang penerimaan",
      icon: Calendar,
      // Halaman gelombangnya masih di bawah /admissions; menautkan /spmb/waves
      // yang belum ada berarti 404 — dan Next memuat-awal tautan ini, jadi
      // biayanya tertagih tiap kali halaman ini dirender, bukan saat diklik.
      href: "/admissions/waves",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      count: String(totalPeriods),
    },
    {
      title: "Pendaftar",
      description: "Daftar calon santri yang mendaftar",
      icon: Users,
      href: "/spmb/registrations",
      color: "text-green-600",
      bgColor: "bg-green-50",
      count: String(totalRegistrants),
    },
    {
      title: "Seleksi",
      // Belum ada halaman penjadwalan seleksi. Yang ada adalah daftar pendaftar
      // yang sudah dijadwalkan tes, dan di situlah petugas bekerja — jadi kartu
      // ini menunjuk ke sana, bukan ke halaman yang belum dibangun.
      description: "Pendaftar yang sudah dijadwalkan tes",
      icon: ClipboardList,
      href: "/spmb/registrations?status=TEST_SCHEDULED",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      count: String(testScheduledCount),
    },
    {
      title: "Diterima",
      description: "Calon santri yang diterima",
      icon: CheckCircle,
      href: "/spmb/registrations?status=ACCEPTED",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      count: String(acceptedCount),
    },
  ];

  const stats = [
    {
      title: "Total Pendaftar",
      value: String(totalRegistrants),
      icon: UserPlus,
      color: "text-blue-600",
      description: "Calon santri",
    },
    {
      title: "Menunggu Verifikasi",
      value: String(pendingCount),
      icon: Clock,
      color: "text-yellow-600",
      description: "Berkas pending",
    },
    {
      title: "Lulus Seleksi",
      value: String(acceptedCount),
      icon: CheckCircle,
      color: "text-green-600",
      description: "Diterima",
    },
    {
      title: "Gelombang Aktif",
      value: String(activeWavesCount),
      icon: Calendar,
      color: "text-purple-600",
      description: "Gelombang berstatus OPEN",
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            SPMB - Sistem Penerimaan Murid Baru
          </h1>
          <p className="text-muted-foreground">
            Pusat kendali penerimaan, verifikasi berkas, seleksi, dan onboarding santri baru
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="registration">Pendaftaran</TabsTrigger>
            <TabsTrigger value="selection">Seleksi</TabsTrigger>
            <TabsTrigger value="reports">Laporan</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {stat.title}
                      </CardTitle>
                      <Icon className={`h-4 w-4 ${stat.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stat.value}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stat.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Menu Cards */}
            <div className="grid gap-6 md:grid-cols-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                      <CardHeader>
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${item.bgColor}`}>
                            <Icon className={`h-6 w-6 ${item.color}`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <CardTitle className="text-lg">
                                {item.title}
                              </CardTitle>
                              <Badge variant="secondary">{item.count}</Badge>
                            </div>
                            <CardDescription className="mt-2">
                              {item.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Akses cepat ke fitur yang sering digunakan
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Link href="/admissions/waves">
                  <Button className="w-full" variant="outline">
                    <Calendar className="mr-2 h-4 w-4" />
                    Kelola Gelombang
                  </Button>
                </Link>
                <Link href="/spmb/registrations">
                  <Button className="w-full" variant="outline">
                    <Users className="mr-2 h-4 w-4" />
                    Lihat Pendaftar
                  </Button>
                </Link>
                <Link href="/spmb/registrations?status=TEST_SCHEDULED">
                  <Button className="w-full" variant="outline">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Peserta Tes
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registration" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pendaftaran Online</CardTitle>
                <CardDescription>
                  Proses pendaftaran calon santri baru secara online
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <h4 className="font-medium">Alur Pendaftaran:</h4>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li>1. Calon santri mengisi formulir online</li>
                    <li>2. Upload dokumen persyaratan</li>
                    <li>3. Verifikasi berkas oleh admin</li>
                    <li>4. Pembayaran biaya pendaftaran</li>
                    <li>5. Jadwal tes masuk</li>
                  </ol>
                </div>
                <Link href="/spmb/registrations">
                  <Button className="w-full">Kelola Pendaftaran</Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="selection" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Proses Seleksi</CardTitle>
                <CardDescription>
                  Tahapan seleksi dan penilaian calon santri
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <h4 className="font-medium">Tahapan Seleksi:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Tes Akademik</li>
                    <li>• Tes Baca Tulis Al-Qur'an</li>
                    <li>• Tes Wawancara</li>
                    <li>• Tes Kesehatan</li>
                  </ul>
                </div>
                <Link href="/spmb/registrations?status=TEST_SCHEDULED">
                  <Button className="w-full">Lihat Peserta yang Dijadwalkan Tes</Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Laporan SPMB</CardTitle>
                <CardDescription>
                  Laporan dan statistik penerimaan santri baru
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <Card>
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-3">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                        <div>
                          <CardTitle className="text-base">
                            Statistik Pendaftar
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Jumlah dan sebaran pendaftar
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-green-600" />
                        <div>
                          <CardTitle className="text-base">
                            Laporan Hasil Seleksi
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Rekap hasil tes dan penilaian
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
