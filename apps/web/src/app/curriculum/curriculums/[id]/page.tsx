"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  GraduationCap,
  Trash2,
  Edit,
  BookOpen,
  Plus,
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
  useCurriculum,
  useDeleteCurriculum,
  useRemoveSubjectFromCurriculum,
  SUBJECT_TYPE_LABELS,
  SUBJECT_TYPE_BADGE_CLASS,
  SubjectType,
} from "@/hooks/use-curriculum";

function getTypeBadgeColor(type: SubjectType) {
  return SUBJECT_TYPE_BADGE_CLASS[type];
}

function CurriculumDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: curriculum, isLoading } = useCurriculum(id);
  const deleteMutation = useDeleteCurriculum();
  const removeSubjectMutation = useRemoveSubjectFromCurriculum();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Kurikulum berhasil dihapus");
      router.push("/curriculum");
    } catch {
      toast.error("Gagal menghapus kurikulum");
    }
  };

  const handleRemoveSubject = async (curriculumSubjectId: string) => {
    try {
      await removeSubjectMutation.mutateAsync({
        curriculumId: id,
        curriculumSubjectId,
      });
      toast.success("Mata pelajaran berhasil dihapus dari kurikulum");
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

  if (!curriculum) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <GraduationCap className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Kurikulum tidak ditemukan</p>
        <Button asChild className="mt-4">
          <Link href="/curriculum">Kembali ke Kurikulum</Link>
        </Button>
      </div>
    );
  }

  // Group subjects by semester
  const subjectsBySemester =
    curriculum.subjects?.reduce(
      (acc, cs) => {
        if (!acc[cs.semester]) {
          acc[cs.semester] = [];
        }
        acc[cs.semester].push(cs);
        return acc;
      },
      {} as Record<number, typeof curriculum.subjects>,
    ) || {};

  const semesters = Object.keys(subjectsBySemester).map(Number).sort();

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
              {curriculum.name}
            </h1>
            <Badge variant={curriculum.isActive ? "default" : "secondary"}>
              {curriculum.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
          </div>
          <p className="text-muted-foreground">Kode: {curriculum.code}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/curriculum/curriculums/${id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <ConfirmDialog
            title="Hapus Kurikulum"
            description={`Apakah Anda yakin ingin menghapus "${curriculum.name}"? Semua mata pelajaran yang terhubung akan terputus.`}
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
        {/* Curriculum Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Informasi Kurikulum</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-24 w-24 flex items-center justify-center rounded-full bg-primary/10">
                <GraduationCap className="h-12 w-12 text-primary" />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kode</span>
                <span className="font-mono font-medium">{curriculum.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit</span>
                <span className="font-medium">
                  {curriculum.unit?.name || "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tahun Ajaran</span>
                <span className="font-medium">
                  {curriculum.academicYear?.name || "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tingkat Kelas</span>
                <span className="font-medium">
                  Kelas {curriculum.gradeLevel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Mapel</span>
                <span className="font-medium">
                  {curriculum.subjects?.length || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={curriculum.isActive ? "default" : "secondary"}>
                  {curriculum.isActive ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
            </div>

            {curriculum.description && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Deskripsi
                  </p>
                  <p className="text-sm">{curriculum.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Subjects */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Mata Pelajaran
                </CardTitle>
                <CardDescription>
                  Daftar mata pelajaran dalam kurikulum ini
                </CardDescription>
              </div>
              <Button asChild>
                <Link href={`/curriculum/curriculums/${id}/add-subject`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Mapel
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {curriculum.subjects && curriculum.subjects.length > 0 ? (
                <div className="space-y-6">
                  {semesters.map((semester) => (
                    <div key={semester}>
                      <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
                        Semester {semester}
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Mata Pelajaran</TableHead>
                            <TableHead>Kode</TableHead>
                            <TableHead>Tipe</TableHead>
                            <TableHead>SKS</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subjectsBySemester[semester]
                            ?.sort((a, b) => a.sequence - b.sequence)
                            .map((cs, idx) => (
                              <TableRow key={cs.id}>
                                <TableCell className="text-muted-foreground">
                                  {idx + 1}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {cs.subject?.name || "-"}
                                </TableCell>
                                <TableCell className="font-mono text-sm">
                                  {cs.subject?.code || "-"}
                                </TableCell>
                                <TableCell>
                                  {cs.subject?.type && (
                                    <Badge
                                      className={getTypeBadgeColor(
                                        cs.subject.type,
                                      )}
                                    >
                                      {SUBJECT_TYPE_LABELS[cs.subject.type]}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {cs.subject?.credits || 0}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      cs.isRequired ? "default" : "outline"
                                    }
                                  >
                                    {cs.isRequired ? "Wajib" : "Pilihan"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <ConfirmDialog
                                    title="Hapus Mata Pelajaran"
                                    description={`Hapus "${cs.subject?.name}" dari kurikulum ini?`}
                                    onConfirm={() => handleRemoveSubject(cs.id)}
                                    loading={removeSubjectMutation.isPending}
                                  >
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </ConfirmDialog>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <BookOpen className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">
                    Belum ada mata pelajaran
                  </p>
                  <Button asChild className="mt-4" variant="outline">
                    <Link href={`/curriculum/curriculums/${id}/add-subject`}>
                      Tambah Mata Pelajaran
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

export default function CurriculumDetailPage(
  props: Parameters<typeof CurriculumDetailPageContent>[0],
) {
  return (
    <MainLayout>
      <CurriculumDetailPageContent {...props} />
    </MainLayout>
  );
}
