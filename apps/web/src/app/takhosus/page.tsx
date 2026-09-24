"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  BookOpen,
  Users,
  GraduationCap,
  Medal,
  Filter,
  Plus,
  Eye,
  Pencil,
  Trash2,
  LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useHalaqohs,
  useDeleteHalaqoh,
  useEnrollments,
  useDeleteEnrollment,
  useEnrollmentStats,
  TAKHOSUS_STATUSES,
  HALAQOH_DAYS,
  TakhosusStatus,
} from "@/hooks/use-takhosus";
import { useUnits } from "@/hooks/use-units";
import { Progress } from "@/components/ui/progress";
import { TakhosusDashboard } from "@/components/takhosus/takhosus-dashboard";
import { useTakhosusDashboard } from "@/hooks/use-takhosus-details";
import { MurojaahList } from "@/components/takhosus/murojaah/murojaah-list";
import { SimaanList } from "@/components/takhosus/simaan/simaan-list";
import { MurojaahFormDialog } from "@/components/takhosus/murojaah/murojaah-form-dialog";
import { TahfidzProgressChart } from "@/components/takhosus/tahfidz-progress-chart";
import { useTahfidzProgress } from "@/hooks/use-analytics";

export default function TakhosusPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showCreateMurojaah, setShowCreateMurojaah] = useState(false);

  // Murojaah & Simaan state
  const [murojaahUnitFilter, setMurojaahUnitFilter] = useState<string>("");
  const [simaanUnitFilter, setSimaanUnitFilter] = useState<string>("");

  // Halaqoh state
  const [halaqohPage, setHalaqohPage] = useState(1);
  const [halaqohPageSize, setHalaqohPageSize] = useState(10);
  const [halaqohUnitFilter, setHalaqohUnitFilter] = useState<string>("");
  const [deleteHalaqohId, setDeleteHalaqohId] = useState<string | null>(null);

  // Enrollment state
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const [enrollmentPageSize, setEnrollmentPageSize] = useState(10);
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] =
    useState<string>("");
  const [deleteEnrollmentId, setDeleteEnrollmentId] = useState<string | null>(
    null,
  );

  // Data fetching
  const { data: units } = useUnits();

  const { data: halaqohData, isLoading: halaqohLoading } = useHalaqohs({
    page: halaqohPage,
    limit: halaqohPageSize,
    unitId: halaqohUnitFilter || undefined,
  });

  const { data: enrollmentData, isLoading: enrollmentLoading } = useEnrollments(
    {
      page: enrollmentPage,
      limit: enrollmentPageSize,
      status: (enrollmentStatusFilter as TakhosusStatus) || undefined,
    },
  );

  const { data: stats } = useEnrollmentStats();
  const { data: dashboardStats, isLoading: statsLoading } =
    useTakhosusDashboard(halaqohUnitFilter || undefined);

  const deleteHalaqoh = useDeleteHalaqoh();
  const deleteEnrollment = useDeleteEnrollment();

  const halaqohs = halaqohData?.data || [];
  const halaqohPagination = halaqohData?.meta;

  const enrollments = enrollmentData?.data || [];
  const enrollmentPagination = enrollmentData?.meta;

  const handleDeleteHalaqoh = async () => {
    if (!deleteHalaqohId) return;
    try {
      await deleteHalaqoh.mutateAsync(deleteHalaqohId);
      toast.success("Halaqoh berhasil dihapus");
      setDeleteHalaqohId(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus halaqoh";
      toast.error(errorMessage);
    }
  };

  const handleDeleteEnrollment = async () => {
    if (!deleteEnrollmentId) return;
    try {
      await deleteEnrollment.mutateAsync(deleteEnrollmentId);
      toast.success("Pendaftaran berhasil dihapus");
      setDeleteEnrollmentId(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus pendaftaran";
      toast.error(errorMessage);
    }
  };

  const getStatusBadge = (status: TakhosusStatus) => {
    const config = TAKHOSUS_STATUSES.find((s) => s.value === status);
    return (
      <Badge variant="secondary" className={config?.color}>
        {config?.label || status}
      </Badge>
    );
  };

  const getDayLabels = (days: string[]) => {
    return days
      .map((d) => HALAQOH_DAYS.find((day) => day.value === d)?.label || d)
      .join(", ");
  };

  return (
    <MainLayout>
      <PageHeader
        title="Program Takhosus"
        description="Kelola program tahfidz intensif dan sanad Al-Quran"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Total Santri
              </span>
            </div>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm text-muted-foreground">Aktif</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {stats?.active || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Selesai</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {stats?.completed || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">
                Rata-rata Progress
              </span>
            </div>
            <p className="text-2xl font-bold text-purple-600">
              {stats?.averageProgress || 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="halaqoh" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Halaqoh
            </TabsTrigger>
            <TabsTrigger value="enrollment" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Pendaftaran
            </TabsTrigger>
            <TabsTrigger value="murojaah" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Murojaah
            </TabsTrigger>
            <TabsTrigger value="simaan" className="flex items-center gap-2">
              <Medal className="h-4 w-4" />
              Simaan
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            {activeTab === "halaqoh" && (
              <Button asChild>
                <Link href="/takhosus/halaqoh/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Halaqoh
                </Link>
              </Button>
            )}
            {activeTab === "enrollment" && (
              <Button asChild>
                <Link href="/takhosus/enrollment/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Daftarkan Santri
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          <TakhosusDashboard stats={dashboardStats} isLoading={statsLoading} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TahfidzProgressChartWrapper />
            </div>
            <div>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">
                    Target Hafalan Unit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">
                    Target unit ditetapkan berdasarkan tahun ajaran aktif.
                  </p>
                  {/* Additional unit-specific target info could go here */}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Murojaah Tab */}
        <TabsContent value="murojaah">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-center">
                <Select
                  value={murojaahUnitFilter}
                  onValueChange={setMurojaahUnitFilter}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Semua Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Unit</SelectItem>
                    {(units || []).map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  onClick={() => setMurojaahUnitFilter("")}
                >
                  Reset
                </Button>
                <Button
                  onClick={() => setShowCreateMurojaah(true)}
                  className="ml-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Catat Murojaah
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <MurojaahList unitId={murojaahUnitFilter || undefined} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Simaan Tab */}
        <TabsContent value="simaan">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Select
                  value={simaanUnitFilter}
                  onValueChange={setSimaanUnitFilter}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Semua Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Unit</SelectItem>
                    {(units || []).map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" onClick={() => setSimaanUnitFilter("")}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <SimaanList unitId={simaanUnitFilter || undefined} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Halaqoh Tab */}
        <TabsContent value="halaqoh">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Select
                  value={halaqohUnitFilter}
                  onValueChange={setHalaqohUnitFilter}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Semua Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Unit</SelectItem>
                    {(units || []).map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  onClick={() => setHalaqohUnitFilter("")}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Halaqoh</TableHead>
                    <TableHead>Pembimbing</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Jadwal</TableHead>
                    <TableHead>Santri</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {halaqohLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : halaqohs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">
                          Tidak ada data halaqoh
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    halaqohs.map((halaqoh) => (
                      <TableRow key={halaqoh.id}>
                        <TableCell className="font-mono">
                          {halaqoh.code}
                        </TableCell>
                        <TableCell className="font-medium">
                          {halaqoh.name}
                        </TableCell>
                        <TableCell>{halaqoh.teacher?.name || "-"}</TableCell>
                        <TableCell>{halaqoh.unit?.name || "-"}</TableCell>
                        <TableCell>Level {halaqoh.level}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{getDayLabels(halaqoh.scheduleDay)}</p>
                            {halaqoh.scheduleTime && (
                              <p className="text-muted-foreground">
                                {halaqoh.scheduleTime}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {halaqoh.studentCount || 0}/{halaqoh.maxStudents}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={halaqoh.isActive ? "default" : "secondary"}
                          >
                            {halaqoh.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/takhosus/halaqoh/${halaqoh.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/takhosus/halaqoh/${halaqoh.id}/edit`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteHalaqohId(halaqoh.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {halaqohPagination && (
            <div className="mt-4">
              <Pagination
                page={halaqohPagination.page}
                totalPages={halaqohPagination.totalPages}
                pageSize={halaqohPagination.limit}
                total={halaqohPagination.total}
                onPageChange={setHalaqohPage}
                onPageSizeChange={(size) => {
                  setHalaqohPageSize(size);
                  setHalaqohPage(1);
                }}
              />
            </div>
          )}
        </TabsContent>

        {/* Enrollment Tab */}
        <TabsContent value="enrollment">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Select
                  value={enrollmentStatusFilter}
                  onValueChange={setEnrollmentStatusFilter}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Status</SelectItem>
                    {TAKHOSUS_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  onClick={() => setEnrollmentStatusFilter("")}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Santri</TableHead>
                    <TableHead>Halaqoh</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Sanad</TableHead>
                    <TableHead>Terdaftar</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollmentLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : enrollments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Users className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">
                          Tidak ada data pendaftaran
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    enrollments.map((enrollment) => (
                      <TableRow key={enrollment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {enrollment.student?.user.name || "-"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {enrollment.student?.unit?.name || "-"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {enrollment.halaqoh?.name || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell>{enrollment.targetJuz} Juz</TableCell>
                        <TableCell>
                          <div className="space-y-1 w-32">
                            <Progress
                              value={enrollment.progressPercentage || 0}
                              className="h-2"
                            />
                            <p className="text-xs text-muted-foreground">
                              {enrollment.completedJuz}/{enrollment.targetJuz}{" "}
                              Juz ({enrollment.progressPercentage || 0}%)
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {enrollment.sanadCount || 0} Sanad
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(
                            new Date(enrollment.enrolledAt),
                            "d MMM yyyy",
                            { locale: localeId },
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(enrollment.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/takhosus/enrollment/${enrollment.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/takhosus/enrollment/${enrollment.id}/edit`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteEnrollmentId(enrollment.id)
                              }
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {enrollmentPagination && (
            <div className="mt-4">
              <Pagination
                page={enrollmentPagination.page}
                totalPages={enrollmentPagination.totalPages}
                pageSize={enrollmentPagination.limit}
                total={enrollmentPagination.total}
                onPageChange={setEnrollmentPage}
                onPageSizeChange={(size) => {
                  setEnrollmentPageSize(size);
                  setEnrollmentPage(1);
                }}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Halaqoh Dialog */}
      <ConfirmDialog
        open={!!deleteHalaqohId}
        onOpenChange={(open) => !open && setDeleteHalaqohId(null)}
        title="Hapus Halaqoh"
        description="Apakah Anda yakin ingin menghapus halaqoh ini? Data yang terkait akan ikut terhapus."
        onConfirm={handleDeleteHalaqoh}
        isLoading={deleteHalaqoh.isPending}
      />

      {/* Delete Enrollment Dialog */}
      <ConfirmDialog
        open={!!deleteEnrollmentId}
        onOpenChange={(open) => !open && setDeleteEnrollmentId(null)}
        title="Hapus Pendaftaran"
        description="Apakah Anda yakin ingin menghapus pendaftaran ini? Data sanad santri akan ikut terhapus."
        onConfirm={handleDeleteEnrollment}
        isLoading={deleteEnrollment.isPending}
      />

      <MurojaahFormDialog
        open={showCreateMurojaah}
        onOpenChange={setShowCreateMurojaah}
        studentId=""
      />
    </MainLayout>
  );
}

function TahfidzProgressChartWrapper() {
  const { data: progressData, isLoading } = useTahfidzProgress();

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  // Map analytics data to chart format
  // Only count newMemorization as "total ayat" — murajaah (review) is not new memorization
  const chartData = (progressData?.data?.monthlyProgress || []).map(
    (item: any) => ({
      date: item.month,
      totalAyah: item.newMemorization || 0,
    }),
  );

  return <TahfidzProgressChart data={chartData} />;
}
