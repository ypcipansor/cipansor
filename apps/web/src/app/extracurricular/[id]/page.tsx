"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Users,
  Calendar,
  Trophy,
  Clock,
  MapPin,
  Plus,
  Check,
  X,
  MoreHorizontal,
  ClipboardCheck,
  Award,
  User,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

import {
  useExtracurricular,
  useExtracurricularEnrollments,
  useExtracurricularAchievements,
  useDeleteExtracurricular,
  useApproveEnrollment,
  useRejectEnrollment,
  getCategoryConfig,
  getLevelConfig,
  formatSchedule,
  DAY_NAMES,
} from "@/hooks/use-extracurricular";

export default function ExtracurricularDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    enrollmentId: string | null;
  }>({
    open: false,
    enrollmentId: null,
  });
  const [rejectReason, setRejectReason] = useState("");

  const { data: extracurricular, isLoading } = useExtracurricular(id);
  const { data: enrollments = [], isLoading: enrollmentsLoading } =
    useExtracurricularEnrollments(id);
  const { data: achievements = [] } = useExtracurricularAchievements({
    extracurricularId: id,
  });

  const deleteMutation = useDeleteExtracurricular();
  const approveMutation = useApproveEnrollment();
  const rejectMutation = useRejectEnrollment();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Ekstrakurikuler berhasil dihapus");
      router.push("/extracurricular");
    } catch {
      toast.error("Gagal menghapus ekstrakurikuler");
    }
  };

  const handleApprove = async (enrollmentId: string) => {
    try {
      await approveMutation.mutateAsync({
        enrollmentId,
        extracurricularId: id,
      });
      toast.success("Pendaftaran disetujui");
    } catch {
      toast.error("Gagal menyetujui pendaftaran");
    }
  };

  const handleReject = async () => {
    if (!rejectDialog.enrollmentId) return;
    try {
      await rejectMutation.mutateAsync({
        enrollmentId: rejectDialog.enrollmentId,
        extracurricularId: id,
        reason: rejectReason,
      });
      toast.success("Pendaftaran ditolak");
      setRejectDialog({ open: false, enrollmentId: null });
      setRejectReason("");
    } catch {
      toast.error("Gagal menolak pendaftaran");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!extracurricular) {
    return (
      <MainLayout>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              Ekstrakurikuler tidak ditemukan
            </p>
            <Button asChild className="mt-4">
              <Link href="/extracurricular">Kembali</Link>
            </Button>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const catConfig = getCategoryConfig(extracurricular.category);
  const memberProgress = extracurricular.maxMembers
    ? (extracurricular.currentMembers / extracurricular.maxMembers) * 100
    : 0;

  const pendingEnrollments = enrollments.filter((e) => e.status === "PENDING");
  const approvedEnrollments = enrollments.filter(
    (e) => e.status === "APPROVED",
  );

  return (
    <MainLayout>
      <PageHeader
        title={extracurricular.name}
        description={extracurricular.code}
        backHref="/extracurricular"
        action={{
          label: "Edit",
          icon: <Edit className="h-4 w-4" />,
          href: `/extracurricular/${id}/edit`,
        }}
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">
            Anggota
            {pendingEnrollments.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                {pendingEnrollments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="attendance">Absensi</TabsTrigger>
          <TabsTrigger value="achievements">Prestasi</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Info Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Anggota</p>
                    <p className="text-xl font-bold">
                      {extracurricular.currentMembers}
                      {extracurricular.maxMembers &&
                        ` / ${extracurricular.maxMembers}`}
                    </p>
                  </div>
                </div>
                {extracurricular.maxMembers && (
                  <Progress value={memberProgress} className="mt-2 h-1.5" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Jadwal</p>
                    <p className="text-xl font-bold">
                      {extracurricular.schedules?.length || 0}x/minggu
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Trophy className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Prestasi</p>
                    <p className="text-xl font-bold">{achievements.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Calendar className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Tahun Ajaran
                    </p>
                    <p className="text-lg font-medium truncate">
                      {extracurricular.academicYear?.name || "-"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Details */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Umum</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{catConfig?.icon}</span>
                  <div>
                    <Badge className={catConfig?.color}>
                      {catConfig?.label}
                    </Badge>
                    <Badge
                      variant={
                        extracurricular.status === "ACTIVE"
                          ? "default"
                          : "secondary"
                      }
                      className="ml-2"
                    >
                      {extracurricular.status === "ACTIVE"
                        ? "Aktif"
                        : "Tidak Aktif"}
                    </Badge>
                  </div>
                </div>

                {extracurricular.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Deskripsi</p>
                    <p className="text-sm">{extracurricular.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Unit</p>
                    <p className="font-medium">
                      {extracurricular.unit?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pembina</p>
                    <p className="font-medium">
                      {extracurricular.coach?.name ||
                        extracurricular.coachName ||
                        "-"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Jadwal Kegiatan</CardTitle>
              </CardHeader>
              <CardContent>
                {extracurricular.schedules &&
                extracurricular.schedules.length > 0 ? (
                  <div className="space-y-3">
                    {extracurricular.schedules.map((schedule, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="p-2 bg-background rounded-lg">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">
                            {DAY_NAMES[schedule.dayOfWeek]}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {schedule.startTime} - {schedule.endTime}
                          </p>
                        </div>
                        {schedule.location && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {schedule.location}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    Belum ada jadwal ditentukan
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Zona Berbahaya</CardTitle>
              <CardDescription>
                Tindakan di bawah ini tidak dapat dibatalkan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Hapus Ekstrakurikuler
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          {/* Pending Enrollments */}
          {pendingEnrollments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Pendaftaran Menunggu
                  <Badge variant="destructive">
                    {pendingEnrollments.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NISN</TableHead>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Tanggal Daftar</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingEnrollments.map((enrollment) => (
                      <TableRow key={enrollment.id}>
                        <TableCell>{enrollment.student?.nisn}</TableCell>
                        <TableCell className="font-medium">
                          {enrollment.student?.name}
                        </TableCell>
                        <TableCell>
                          {enrollment.student?.currentClass?.name || "-"}
                        </TableCell>
                        <TableCell>
                          {format(
                            new Date(enrollment.enrolledAt),
                            "dd MMM yyyy",
                            { locale: localeId },
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleApprove(enrollment.id)}
                              disabled={approveMutation.isPending}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Terima
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setRejectDialog({
                                  open: true,
                                  enrollmentId: enrollment.id,
                                })
                              }
                            >
                              <X className="h-3 w-3 mr-1" />
                              Tolak
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Approved Members */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>
                  Daftar Anggota ({approvedEnrollments.length})
                </CardTitle>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Anggota
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {enrollmentsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : approvedEnrollments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Belum ada anggota terdaftar</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NISN</TableHead>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Bergabung</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedEnrollments.map((enrollment) => (
                      <TableRow key={enrollment.id}>
                        <TableCell>{enrollment.student?.nisn}</TableCell>
                        <TableCell className="font-medium">
                          {enrollment.student?.name}
                        </TableCell>
                        <TableCell>
                          {enrollment.student?.currentClass?.name || "-"}
                        </TableCell>
                        <TableCell>
                          {format(
                            new Date(
                              enrollment.approvedAt || enrollment.enrolledAt,
                            ),
                            "dd MMM yyyy",
                            { locale: localeId },
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <User className="h-4 w-4 mr-2" />
                                Lihat Profil
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <X className="h-4 w-4 mr-2" />
                                Keluarkan
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Absensi Kegiatan</CardTitle>
                <Button>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Input Absensi
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Fitur absensi akan segera tersedia</p>
                <p className="text-sm">
                  Rekam kehadiran anggota setiap kegiatan
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Prestasi ({achievements.length})</CardTitle>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Prestasi
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {achievements.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Belum ada prestasi tercatat</p>
                  <p className="text-sm">Catat prestasi untuk dokumentasi</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {achievements.map((achievement) => {
                    const levelConfig = getLevelConfig(achievement.level);
                    return (
                      <div
                        key={achievement.id}
                        className="flex items-start gap-4 p-4 border rounded-lg"
                      >
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <Award className="h-6 w-6 text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">
                              {achievement.title}
                            </h4>
                            <Badge className={levelConfig?.color}>
                              {levelConfig?.label}
                            </Badge>
                            {achievement.rank && (
                              <Badge variant="outline">
                                {achievement.rank}
                              </Badge>
                            )}
                          </div>
                          {achievement.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {achievement.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {format(
                              new Date(achievement.date),
                              "dd MMMM yyyy",
                              { locale: localeId },
                            )}
                            {achievement.participants &&
                              achievement.participants.length > 0 && (
                                <>
                                  {" "}
                                  • {achievement.participants.length} peserta
                                </>
                              )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Ekstrakurikuler?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Semua data anggota, absensi,
              dan prestasi akan ikut terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) => setRejectDialog({ open, enrollmentId: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Pendaftaran</DialogTitle>
            <DialogDescription>
              Berikan alasan penolakan pendaftaran
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Alasan penolakan..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRejectDialog({ open: false, enrollmentId: null })
              }
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Menolak..." : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
