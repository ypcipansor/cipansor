"use client";
import { MainLayout } from "@/components/layout";
import { useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";

import { id as localeId } from "date-fns/locale";
import { useAuthStore } from "@/stores/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  HeartPulse,
  FileWarning,
  Award,
  Bell,
  ClipboardList,
  Banknote,
  Building2,
  RefreshCw,
  CheckCircle,
  Clock,
  Activity,
  Calendar,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  useStaffDashboard,
  getPriorityColor,
  formatRelativeTime,
  getActivityIcon,
  type PendingTask,
} from "@/hooks/use-staff-dashboard";

function StaffDashboardContent() {
  const { user } = useAuthStore();
  const { stats, pendingTasks, recentActivity, isLoading, refetch } =
    useStaffDashboard();

  const router = useRouter();

  // A permit opens on its own page, which offers exactly the actions the
  // role may take. None of the staff roles on this dashboard decides
  // permits, so an approve/reject dialog here only ever led to a 403.
  const openTask = (task: PendingTask) => {
    if (task.type === "permit") router.push(`/permits/${task.id}`);
  };

  const quickActions = [
    {
      title: "Data Siswa",
      description: "Kelola data siswa",
      icon: Users,
      href: "/students",
      color: "bg-blue-500",
    },
    {
      title: "Kesehatan",
      description: "Rekam kesehatan siswa",
      icon: HeartPulse,
      href: "/health",
      color: "bg-red-500",
    },
    {
      title: "Perizinan",
      description: "Kelola perizinan",
      icon: ClipboardList,
      href: "/permits",
      color: "bg-purple-500",
    },
    {
      title: "Keuangan",
      description: "Pembayaran siswa",
      icon: Banknote,
      href: "/finance",
      color: "bg-green-500",
    },
  ];

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "permit":
        return <ClipboardList className="h-4 w-4 text-purple-600" />;
      case "health":
        return <HeartPulse className="h-4 w-4 text-red-600" />;
      case "violation":
        return <FileWarning className="h-4 w-4 text-orange-600" />;
      case "reward":
        return <Award className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTaskBgColor = (type: string) => {
    switch (type) {
      case "permit":
        return "bg-purple-100";
      case "health":
        return "bg-red-100";
      case "violation":
        return "bg-orange-100";
      case "reward":
        return "bg-green-100";
      default:
        return "bg-gray-100";
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "permit":
        return "bg-purple-500";
      case "health":
        return "bg-red-500";
      case "violation":
        return "bg-orange-500";
      case "reward":
        return "bg-yellow-500";
      case "attendance":
        return "bg-green-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Selamat Datang, {user?.name?.split(" ")[0] || "Staff"}! 👋
          </h1>
          <p className="text-muted-foreground">
            Dashboard Staff - Kelola administrasi dan layanan siswa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {safeFormat(new Date(), "EEEE, d MMMM yyyy", { locale: localeId })}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats?.pendingPermits !== null && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Izin Menunggu
              </CardTitle>
              <div className="p-2 rounded-lg bg-purple-100">
                <ClipboardList className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {stats?.pendingPermits ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats?.permitsAwaitMe
                      ? "menunggu keputusan Anda"
                      : "menunggu keputusan"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Siswa Sakit</CardTitle>
            <div className="p-2 rounded-lg bg-red-100">
              <HeartPulse className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {stats?.sickStudents ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  sedang dalam perawatan
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pelanggaran Hari Ini
            </CardTitle>
            <div className="p-2 rounded-lg bg-orange-100">
              <FileWarning className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {stats?.todayViolations ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  tercatat hari ini
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Penghargaan Hari Ini
            </CardTitle>
            <div className="p-2 rounded-lg bg-green-100">
              <Award className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {stats?.todayRewards ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  diberikan hari ini
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attendance Summary */}
      {stats?.attendanceToday && stats.attendanceToday.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Kehadiran Hari Ini
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {stats.attendanceToday.present}
                </div>
                <div className="text-xs text-muted-foreground">Hadir</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {stats.attendanceToday.absent}
                </div>
                <div className="text-xs text-muted-foreground">Alpha</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {stats.attendanceToday.sick}
                </div>
                <div className="text-xs text-muted-foreground">Sakit</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {stats.attendanceToday.excused}
                </div>
                <div className="text-xs text-muted-foreground">Izin</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">
                  {stats.attendanceToday.total}
                </div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Aksi Cepat</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center space-x-4 pb-2">
                  <div className={`p-2 rounded-lg ${action.color}`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{action.title}</CardTitle>
                    <CardDescription>{action.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Tugas Pending
            </CardTitle>
            <CardDescription>
              Tugas yang memerlukan tindakan Anda
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
              <div className="space-y-3">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))
                ) : pendingTasks && pendingTasks.length > 0 ? (
                  pendingTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer ${getPriorityColor(task.priority)}`}
                      onClick={() => openTask(task)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${getTaskBgColor(task.type)}`}
                        >
                          {getTaskIcon(task.type)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {task.studentName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(task.date)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {task.priority === "high" && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                    Tidak ada tugas pending
                  </div>
                )}
              </div>
            </ScrollArea>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link href="/permits">
                Lihat Semua Perizinan
                <ChevronRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Aktivitas Terakhir
            </CardTitle>
            <CardDescription>Aktivitas terbaru di sistem</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
              <div className="space-y-3">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 p-2">
                      <Skeleton className="h-2 w-2 rounded-full mt-2" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))
                ) : recentActivity && recentActivity.length > 0 ? (
                  recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={`w-2 h-2 rounded-full mt-2 ${getActivityColor(activity.type)}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="mr-1">
                            {getActivityIcon(activity.type)}
                          </span>
                          <span className="font-medium">{activity.action}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            - {activity.subject}
                          </span>
                        </p>
                        {activity.actor && (
                          <p className="text-xs text-muted-foreground">
                            oleh {activity.actor}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(activity.time)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Belum ada aktivitas
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Additional Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Menu Lainnya
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Link href="/violations">
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex flex-col gap-2"
              >
                <FileWarning className="h-6 w-6" />
                <span>Pelanggaran</span>
              </Button>
            </Link>
            <Link href="/rewards">
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex flex-col gap-2"
              >
                <Award className="h-6 w-6" />
                <span>Penghargaan</span>
              </Button>
            </Link>
            <Link href="/announcements">
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex flex-col gap-2"
              >
                <Bell className="h-6 w-6" />
                <span>Pengumuman</span>
              </Button>
            </Link>
            <Link href="/attendance">
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex flex-col gap-2"
              >
                <Calendar className="h-6 w-6" />
                <span>Kehadiran</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StaffDashboardWithShell() {
  return (
    <MainLayout>
      <StaffDashboardContent />
    </MainLayout>
  );
}
