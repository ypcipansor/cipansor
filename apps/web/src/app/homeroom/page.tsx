"use client";
import { MainLayout } from "@/components/layout";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  UserX,
  BookOpen,
  ClipboardList,
  MessageCircle,
  Calendar,
  Gift,
  Award,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Clock,
  Phone,
  Mail,
  Eye,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHomeroomClasses, useHomeroomDashboard } from "@/hooks/use-homeroom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function HomeroomDashboardPageContent() {
  const [selectedTab, setSelectedTab] = useState("overview");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // 1. Fetch Classes
  const {
    data: classes,
    isLoading: isLoadingClasses,
    error: classesError,
  } = useHomeroomClasses();

  // Auto-select first class
  useEffect(() => {
    if (classes && classes.length > 0 && !selectedClassId) {
      setTimeout(() => setSelectedClassId(classes[0].id), 0);
    }
  }, [classes, selectedClassId]);

  // 2. Fetch Dashboard Data
  const {
    data: dashboardData,
    isLoading: isLoadingDashboard,
    error: dashboardError,
  } = useHomeroomDashboard(selectedClassId || undefined);

  if (isLoadingClasses) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (classesError) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Gagal memuat data kelas. Silakan coba lagi nanti.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!classes || classes.length === 0) {
    return (
      <div className="container mx-auto py-6 text-center">
        <h2 className="text-xl font-semibold">Tidak ada kelas</h2>
        <p className="text-muted-foreground">
          Anda belum ditugaskan sebagai wali kelas.
        </p>
      </div>
    );
  }

  // Show loading for dashboard if class selected but data not yet loaded
  if (selectedClassId && isLoadingDashboard) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dashboardData) {
    return null; // Should not happen if loading handled
  }

  const {
    class: classInfo,
    dashboardSummary: summary,
    attendanceSummary,
  } = dashboardData;

  // Calculate today's attendance from summary (Note: backend returns month summary,
  // ideally we need today's summary specifically, but for now we use the aggregate or would need another endpoint for 'today')
  // *Self-Correction*: The backend logic I wrote returns Month summary.
  // To display "Today's Attendance", I would need a specific endpoint or field.
  // For this "Further Development", I will display the Month Summary in the charts,
  // and maybe hide "Today" specific numbers if I don't have them, or re-label them as "Bulan Ini".
  // Let's re-label to "Kehadiran Bulan Ini" for accuracy.

  const totalAttendanceRecords = attendanceSummary.reduce(
    (acc, curr) => acc + curr.count,
    0,
  );
  const getCount = (status: string) =>
    attendanceSummary.find((s) => s.status === status)?.count || 0;

  const presentCount = getCount("PRESENT");
  const sickCount = getCount("SICK");
  const permitCount = getCount("EXCUSED");
  const absentCount = getCount("ABSENT");
  const lateCount = getCount("LATE");

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 75) return "text-blue-600";
    if (score >= 65) return "text-yellow-600";
    return "text-red-600";
  };

  const getAttendanceColor = (rate: number) => {
    if (rate >= 95) return "text-green-600";
    if (rate >= 85) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="secondary" className="text-lg px-4 py-1">
              {classInfo.name}
            </Badge>
            <Badge variant="outline">{classInfo.unit.name}</Badge>
          </div>
          <h1 className="text-3xl font-bold">Dashboard Wali Kelas</h1>
          <p className="text-muted-foreground">
            {classInfo.homeroomTeacher.user.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/homeroom/attendance">
            <Button>
              <ClipboardList className="h-4 w-4 mr-2" />
              Absensi
            </Button>
          </Link>
          <Link href="/homeroom/behavior">
            <Button variant="outline">
              <BookOpen className="h-4 w-4 mr-2" />
              Catatan Perilaku
            </Button>
          </Link>
          <Link href="/homeroom/messages">
            <Button variant="outline">
              <MessageCircle className="h-4 w-4 mr-2" />
              Pesan Wali
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Siswa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">
                  {dashboardData.studentCount}
                </div>
                <p className="text-xs text-muted-foreground">Siswa Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Kehadiran (Bulan Ini)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <UserCheck className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">
                  {summary.averageAttendance}%
                </div>
                <p className="text-xs text-muted-foreground">Rata-rata</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rata-rata Nilai
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">
                  {summary.averageAcademicScore}
                </div>
                <Progress
                  value={summary.averageAcademicScore}
                  className="h-2 mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Catatan Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <div className="text-2xl font-bold">
                  {summary.pendingBehaviorNotes}
                </div>
                <p className="text-xs text-muted-foreground">
                  Perlu tindak lanjut
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="overview">Ikhtisar</TabsTrigger>
          <TabsTrigger value="students">Daftar Siswa</TabsTrigger>
          <TabsTrigger value="achievements">Prestasi & Pelanggaran</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming Birthdays */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-pink-500" />
                  Ulang Tahun Terdekat
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.upcomingBirthdays.length > 0 ? (
                  <div className="space-y-3">
                    {summary.upcomingBirthdays.map((item) => (
                      <div
                        key={item.student.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {item.student.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{item.student.name}</p>
                            <p className="text-sm text-muted-foreground">
                              NISN: {item.student.nisn}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            item.daysUntil <= 3 ? "default" : "secondary"
                          }
                        >
                          {item.daysUntil === 0
                            ? "Hari ini!"
                            : `${item.daysUntil} hari lagi`}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    Tidak ada ulang tahun dalam 30 hari ke depan
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Attendance Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-blue-500" />
                  Statistik Kehadiran Bulan Ini
                </CardTitle>
                <CardDescription>
                  Total {totalAttendanceRecords} catatan kehadiran
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/20">
                    <UserCheck className="h-6 w-6 text-green-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-green-600">
                      {presentCount}
                    </div>
                    <p className="text-xs text-muted-foreground">Hadir</p>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                    <Clock className="h-6 w-6 text-yellow-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-yellow-600">
                      {lateCount}
                    </div>
                    <p className="text-xs text-muted-foreground">Telat</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                    <UserX className="h-6 w-6 text-blue-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-blue-600">
                      {sickCount}
                    </div>
                    <p className="text-xs text-muted-foreground">Sakit</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                    <UserX className="h-6 w-6 text-purple-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-purple-600">
                      {permitCount}
                    </div>
                    <p className="text-xs text-muted-foreground">Izin</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20">
                    <UserX className="h-6 w-6 text-red-600 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-red-600">
                      {absentCount}
                    </div>
                    <p className="text-xs text-muted-foreground">Alpha</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href="/homeroom/attendance">
                    <Button variant="outline" className="w-full">
                      Detail Absensi
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Recent Achievements */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-yellow-500" />
                  Prestasi Terbaru
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.recentAchievements.length > 0 ? (
                  <div className="space-y-3">
                    {summary.recentAchievements.map((achievement) => (
                      <div
                        key={achievement.id}
                        className="p-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-green-800 dark:text-green-200">
                              {achievement.student.user.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {achievement.description}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {achievement.category} •{" "}
                              {new Date(achievement.date).toLocaleDateString(
                                "id-ID",
                              )}
                            </p>
                          </div>
                          {achievement.points !== undefined && (
                            <Badge className="bg-green-600">
                              {achievement.type === "TAHFIDZ"
                                ? "Lulus"
                                : `+${achievement.points} poin`}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    Belum ada prestasi tercatat
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent Violations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Pelanggaran Terbaru
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.recentViolations.length > 0 ? (
                  <div className="space-y-3">
                    {summary.recentViolations.map((violation) => {
                      const isResolved = !!violation.action;
                      return (
                        <div
                          key={violation.id}
                          className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-red-800 dark:text-red-200">
                                {violation.student.user.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {violation.description}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {violation.category} •{" "}
                                {new Date(
                                  violation.occurredAt,
                                ).toLocaleDateString("id-ID")}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {/* <Badge variant="destructive">{violation.points} poin</Badge> */}
                              {!isResolved && (
                                <Badge
                                  variant="outline"
                                  className="text-yellow-600 border-yellow-600"
                                >
                                  Belum diselesaikan
                                </Badge>
                              )}
                              {isResolved && (
                                <Badge
                                  variant="outline"
                                  className="text-green-600 border-green-600"
                                >
                                  Selesai
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    Tidak ada pelanggaran tercatat
                  </p>
                )}
                <div className="mt-4">
                  <Link href="/homeroom/behavior">
                    <Button variant="outline" className="w-full">
                      Lihat Semua Catatan
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Siswa Kelas {classInfo.name}</CardTitle>
              <CardDescription>
                Total {dashboardData.studentCount} siswa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2">No</th>
                      <th className="text-left py-3 px-2">NISN</th>
                      <th className="text-left py-3 px-2">Nama Siswa</th>
                      {/* <th className="text-center py-3 px-2">Kehadiran</th>
                      <th className="text-center py-3 px-2">Rata-rata Nilai</th> */}
                      <th className="text-center py-3 px-2">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.students.map((student, index) => (
                      <tr
                        key={student.id}
                        className="border-b hover:bg-muted/50"
                      >
                        <td className="py-3 px-2">{index + 1}</td>
                        <td className="py-3 px-2 font-mono text-sm">
                          {student.nisn}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {student.user?.name?.charAt(0) || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {student.user?.name ||
                                student.name ||
                                "Unknown Student"}
                            </span>
                          </div>
                        </td>
                        {/* Note: Individual stats would require N+1 queries or complex join, for now we list students */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              href={`/homeroom/students/${student.id}`}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Detail"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements" className="mt-6">
          {/* Re-using the cards from Overview but fuller view if needed */}
          <div className="text-center py-10 text-muted-foreground">
            Silakan lihat tab Ikhtisar untuk ringkasan.
            <br />
            Fitur detail riwayat lengkap akan segera hadir.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function HomeroomDashboardPageWithShell() {
  return (
    <MainLayout>
      <HomeroomDashboardPageContent />
    </MainLayout>
  );
}
