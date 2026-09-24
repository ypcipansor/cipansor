"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Trash2,
  Edit,
  Calendar,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useSubject,
  useDeleteSubject,
  useSchedules,
  useTeacherAssignments,
  SUBJECT_TYPE_LABELS,
  SCHEDULE_DAY_LABELS,
  SubjectType,
} from "@/hooks/use-curriculum";

function getTypeBadgeColor(type: SubjectType) {
  const colors: Record<SubjectType, string> = {
    REQUIRED: "bg-blue-100 text-blue-800",
    ELECTIVE: "bg-green-100 text-green-800",
    EXTRACURRICULAR: "bg-purple-100 text-purple-800",
  };
  return colors[type];
}

function SubjectDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: subject, isLoading } = useSubject(id);
  const { data: schedules } = useSchedules({ subjectId: id });
  const { data: assignments } = useTeacherAssignments({ subjectId: id });
  const deleteMutation = useDeleteSubject();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Mata pelajaran berhasil dihapus");
      router.push("/curriculum");
    } catch {
      toast.error("Gagal menghapus mata pelajaran");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BookOpen className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">
          Mata pelajaran tidak ditemukan
        </p>
        <Button asChild className="mt-4">
          <Link href="/curriculum">Kembali ke Kurikulum</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/curriculum">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {subject.name}
            </h1>
            <Badge className={getTypeBadgeColor(subject.type)}>
              {SUBJECT_TYPE_LABELS[subject.type]}
            </Badge>
            <Badge variant={subject.isActive ? "default" : "secondary"}>
              {subject.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
          </div>
          <p className="text-muted-foreground">Kode: {subject.code}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/curriculum/subjects/${id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <ConfirmDialog
            title="Hapus Mata Pelajaran"
            description={`Apakah Anda yakin ingin menghapus "${subject.name}"? Tindakan ini tidak dapat dibatalkan.`}
            onConfirm={handleDelete}
            loading={deleteMutation.isPending}
          >
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </Button>
          </ConfirmDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Subject Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Informasi Mata Pelajaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-24 w-24 flex items-center justify-center rounded-full bg-primary/10">
                <BookOpen className="h-12 w-12 text-primary" />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kode</span>
                <span className="font-mono font-medium">{subject.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit</span>
                <span className="font-medium">{subject.unit?.name || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipe</span>
                <Badge className={getTypeBadgeColor(subject.type)}>
                  {SUBJECT_TYPE_LABELS[subject.type]}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SKS</span>
                <span className="font-medium">{subject.credits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jam/Minggu</span>
                <span className="font-medium">{subject.hoursPerWeek} jam</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={subject.isActive ? "default" : "secondary"}>
                  {subject.isActive ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
            </div>

            {subject.description && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Deskripsi
                  </p>
                  <p className="text-sm">{subject.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Schedules & Assignments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Teacher Assignments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Guru Pengajar
              </CardTitle>
              <CardDescription>
                Daftar guru yang mengajar mata pelajaran ini
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignments && assignments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guru</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Tahun Ajaran</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">
                          {assignment.teacher?.name || "-"}
                        </TableCell>
                        <TableCell>{assignment.class?.name || "-"}</TableCell>
                        <TableCell>
                          {assignment.academicYear?.name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              assignment.isActive ? "default" : "secondary"
                            }
                          >
                            {assignment.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">
                    Belum ada guru yang ditugaskan
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedules */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Jadwal Pelajaran
              </CardTitle>
              <CardDescription>
                Jadwal mata pelajaran ini dalam seminggu
              </CardDescription>
            </CardHeader>
            <CardContent>
              {schedules && schedules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hari</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Guru</TableHead>
                      <TableHead>Ruang</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">
                          {SCHEDULE_DAY_LABELS[schedule.day]}
                        </TableCell>
                        <TableCell>
                          {schedule.startTime} - {schedule.endTime}
                        </TableCell>
                        <TableCell>{schedule.class?.name || "-"}</TableCell>
                        <TableCell>{schedule.teacher?.name || "-"}</TableCell>
                        <TableCell>{schedule.room || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <Calendar className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">Belum ada jadwal</p>
                  <Button asChild className="mt-4" variant="outline">
                    <Link href={`/curriculum/schedules/new?subjectId=${id}`}>
                      Tambah Jadwal
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SubjectDetailPage(
  props: Parameters<typeof SubjectDetailPageContent>[0],
) {
  return (
    <MainLayout>
      <SubjectDetailPageContent {...props} />
    </MainLayout>
  );
}
