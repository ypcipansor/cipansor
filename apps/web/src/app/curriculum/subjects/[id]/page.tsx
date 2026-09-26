"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Edit,
  Trash2,
  UserMinus,
  UserPlus,
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
  SCHEDULE_DAY_LABELS,
  SUBJECT_TYPE_BADGE_CLASS,
  SUBJECT_TYPE_LABELS,
  passingScoreOf,
  useCanManageSubjects,
  useDeleteSubject,
  useRemoveTeacherFromSubject,
  useSubject,
  useSubjectSchedules,
} from "@/hooks/use-curriculum";
import { PengampuDialog } from "./pengampu-dialog";

function SubjectDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const canManage = useCanManageSubjects();
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);

  const { data: subject, isLoading } = useSubject(id);
  const { data: schedules } = useSubjectSchedules(id);
  const deleteMutation = useDeleteSubject();
  const removeMutation = useRemoveTeacherFromSubject();

  // On failure the API client has already shown the server's message.
  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Mata pelajaran dihapus");
      router.push("/curriculum");
    } catch {
      setDeleting(false);
    }
  };

  const handleEnd = async () => {
    if (!ending) return;
    try {
      await removeMutation.mutateAsync(ending);
      toast.success("Penugasan guru pengampu diakhiri");
    } catch {
      // shown already
    } finally {
      setEnding(null);
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

  const pengampu = subject.teacherSubjects ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/curriculum">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {subject.name}
              </h1>
              <Badge className={SUBJECT_TYPE_BADGE_CLASS[subject.type]}>
                {SUBJECT_TYPE_LABELS[subject.type]}
              </Badge>
              {!subject.isActive && <Badge variant="secondary">Nonaktif</Badge>}
            </div>
            <p className="text-muted-foreground">
              {subject.code} · {subject.unit?.name}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/curriculum/subjects/${id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Informasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kode</span>
              <span className="font-mono font-medium">{subject.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit</span>
              <span className="font-medium">{subject.unit?.name ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">JP per minggu</span>
              <span className="font-medium" data-testid="subject-credits">
                {subject.credits}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kelas</span>
              <span className="font-medium">{subject.level || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">KKM</span>
              <span className="font-medium">{passingScoreOf(subject)}</span>
            </div>
            {subject.description && (
              <>
                <Separator />
                <p>{subject.description}</p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Guru Pengampu
                </CardTitle>
                <CardDescription>
                  Guru yang mengajar mata pelajaran ini, untuk semua kelas atau
                  satu kelas.
                </CardDescription>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setAssigning(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Tugaskan guru
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {pengampu.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guru</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pengampu.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.teacher.user.name}
                        </TableCell>
                        <TableCell>{a.class?.name ?? "Semua kelas"}</TableCell>
                        <TableCell className="text-right">
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEnding(a.id)}
                            >
                              <UserMinus className="mr-1 h-4 w-4" />
                              Akhiri
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Belum ada guru pengampu
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="subject-schedule">
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
                          {SCHEDULE_DAY_LABELS[schedule.dayOfWeek]}
                        </TableCell>
                        <TableCell>
                          {schedule.startTime} - {schedule.endTime}
                        </TableCell>
                        <TableCell>{schedule.class?.name ?? "-"}</TableCell>
                        <TableCell>
                          {schedule.teacher?.user.name ?? "-"}
                        </TableCell>
                        <TableCell>{schedule.room || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Belum ada jadwal
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {canManage && (
        <PengampuDialog
          subject={subject}
          open={assigning}
          onOpenChange={setAssigning}
        />
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Hapus Mata Pelajaran"
        description={`"${subject.name}" tidak lagi ditawarkan untuk jadwal dan penilaian baru, dan guru pengampunya diakhiri. Nilai dan jadwal lama tetap menyebutnya. Menambah kode ${subject.code} lagi akan memulihkannya.`}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />

      <ConfirmDialog
        open={!!ending}
        onOpenChange={(open) => !open && setEnding(null)}
        title="Akhiri Guru Pengampu"
        description="Guru ini tidak lagi tercatat mengajar mata pelajaran ini untuk cakupan tersebut. Riwayatnya tetap tersimpan."
        confirmLabel="Akhiri"
        onConfirm={handleEnd}
        isLoading={removeMutation.isPending}
        variant="destructive"
      />
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
