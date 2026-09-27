"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";

import { id as localeId } from "date-fns/locale";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen,
  Users,
  Calendar,
  FileText,
  ClipboardCheck,
  Activity,
  RefreshCw,
  Star,
  Smile,
} from "lucide-react";
import Link from "next/link";
import {
  usePAUDDashboard,
  getAchievementLabel,
  getAchievementColor,
} from "@/hooks/use-paud-dashboard";
import { MOOD_OPTIONS } from "../daily-report/constants";

const MOOD_LABELS: Record<string, string> = Object.fromEntries(
  MOOD_OPTIONS.map((option) => [option.value, option.label]),
);

export default function TKPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

  const { stats, recentAssessments, recentReports, isLoading, refetch } =
    usePAUDDashboard();

  const menuItems = [
    {
      title: "Laporan Harian",
      description: "Input mood, makan, dan ibadah harian",
      icon: Calendar,
      href: "/daily-report/bulk",
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Penilaian TK",
      description: "Input penilaian indikator perkembangan",
      icon: ClipboardCheck,
      href: "/tk/assessment",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Tahfidz Tracker",
      description: "Pantau hafalan Quran siswa",
      icon: BookOpen,
      href: "/tahfidz",
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      title: "Data Siswa",
      description: "Manajemen data siswa TK",
      icon: Users,
      href: "/students?unit=TK_QURAN",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  const statsConfig = [
    {
      title: "Total Siswa",
      value: stats?.totalStudents ?? 0,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Penilaian Bulan Ini",
      value: stats?.assessmentsThisMonth ?? 0,
      icon: ClipboardCheck,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Laporan Harian",
      value: stats?.dailyReportsThisMonth ?? 0,
      icon: Calendar,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Rapor Aktif",
      value: stats?.activeReports ?? 0,
      icon: FileText,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              TK Qur'an Dashboard
            </h1>
            <p className="text-muted-foreground">
              Sistem Manajemen Informasi TK Qur'an
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activities">Aktivitas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {statsConfig.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {stat.title}
                      </CardTitle>
                      <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                        <Icon className={`h-4 w-4 ${stat.color}`} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <Skeleton className="h-8 w-16" />
                      ) : (
                        <div className="text-2xl font-bold">{stat.value}</div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Menu Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.title} href={item.href}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${item.bgColor}`}>
                            <Icon className={`h-6 w-6 ${item.color}`} />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg">
                              {item.title}
                            </CardTitle>
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

            {/* Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Laporan Harian Terbaru
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))
                      ) : recentReports && recentReports.length > 0 ? (
                        recentReports.map((report) => (
                          <div
                            key={report.id}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50"
                          >
                            <div className="bg-green-100 p-2 rounded-full">
                              <Smile className="h-4 w-4 text-green-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {report.student?.user?.name ?? "-"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {safeFormat(
                                  new Date(report.reportDate),
                                  "dd MMM yyyy",
                                  {
                                    locale: localeId,
                                  },
                                )}
                              </p>
                              {report.mood && (
                                <Badge
                                  variant="outline"
                                  className="mt-1 text-[10px]"
                                >
                                  {MOOD_LABELS[report.mood] ?? report.mood}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-sm text-muted-foreground py-8">
                          Belum ada laporan harian.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Penilaian Terbaru
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))
                      ) : recentAssessments && recentAssessments.length > 0 ? (
                        recentAssessments.map((assessment) => (
                          <div
                            key={assessment.id}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50"
                          >
                            <div className="bg-blue-100 p-2 rounded-full">
                              <ClipboardCheck className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {assessment.student?.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {assessment.indicator?.name}
                              </p>
                              <Badge
                                className={`mt-1 text-[10px] ${getAchievementColor(assessment.achievementLevel)}`}
                              >
                                {assessment.achievementLevel}
                              </Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-sm text-muted-foreground py-8">
                          Belum ada penilaian.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activities">
            <Card>
              <CardHeader>
                <CardTitle>Semua Aktivitas</CardTitle>
                <CardDescription>Log lengkap aktivitas sistem.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Fitur log aktivitas lengkap akan segera hadir.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
