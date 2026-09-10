"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useParams, useRouter } from "next/navigation";

import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Users,
  Building2,
  Pencil,
  Trash2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { type ColumnDef } from "@/components/shared";

import {
  useP5Project,
  useP5Assessments,
  useCreateP5Assessment,
  useUpdateP5Assessment,
  useDeleteP5Assessment,
  useDeleteP5Project,
  useUpdateP5Project,
  P5Assessment,
  P5Grade,
  P5_DIMENSIONS,
  P5_GRADES,
  PROJECT_STATUSES,
  ProjectStatus,
} from "@/hooks/use-kurikulum-merdeka";
import { useStudents } from "@/hooks/use-students";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

export default function P5ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const projectId = params.id as string;

  // State
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddAssessmentOpen, setIsAddAssessmentOpen] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(
    null,
  );
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteAssessmentId, setDeleteAssessmentId] = useState<string | null>(
    null,
  );

  // Form state for assessment
  const [assessmentForm, setAssessmentForm] = useState({
    studentId: "",
    beriman: "" as P5Grade | "",
    berkebinekaan: "" as P5Grade | "",
    bergotongroyong: "" as P5Grade | "",
    mandiri: "" as P5Grade | "",
    bernalarkritis: "" as P5Grade | "",
    kreatif: "" as P5Grade | "",
    overallGrade: "" as P5Grade | "",
    notes: "",
  });

  // Edit project form
  const [editForm, setEditForm] = useState({
    status: "" as ProjectStatus | "",
  });

  // Data fetching
  const { data: project, isLoading: loadingProject } = useP5Project(projectId);
  const { data: assessmentsData, isLoading: loadingAssessments } =
    useP5Assessments({
      projectId,
      limit: 100,
    });
  const { data: studentsData } = useStudents({
    classId: project?.classId || undefined,
    limit: 100,
  });

  const assessments = assessmentsData?.data || [];
  const students = studentsData?.data || [];

  // Mutations
  const createAssessment = useCreateP5Assessment();
  const updateAssessment = useUpdateP5Assessment();
  const deleteAssessment = useDeleteP5Assessment();
  const deleteProject = useDeleteP5Project();
  const updateProject = useUpdateP5Project();

  const getGradeBadge = (grade?: P5Grade) => {
    if (!grade) return <span className="text-muted-foreground">-</span>;
    const gradeConfig = P5_GRADES.find((g) => g.value === grade);
    return (
      <Badge className={cn("font-medium", gradeConfig?.color)}>
        {gradeConfig?.label || grade}
      </Badge>
    );
  };

  const getStatusBadge = (status: ProjectStatus) => {
    const statusConfig = PROJECT_STATUSES.find((s) => s.value === status);
    return (
      <Badge className={cn("font-medium", statusConfig?.color)}>
        {statusConfig?.label || status}
      </Badge>
    );
  };

  const getDimensionBadge = (dimension: string) => {
    const dimConfig = P5_DIMENSIONS.find((d) => d.value === dimension);
    return (
      <Badge key={dimension} className={cn("font-medium", dimConfig?.color)}>
        {dimConfig?.label || dimension}
      </Badge>
    );
  };

  const handleAddAssessment = async () => {
    if (!assessmentForm.studentId) {
      toast.error("Pilih siswa terlebih dahulu");
      return;
    }

    try {
      await createAssessment.mutateAsync({
        projectId,
        studentId: assessmentForm.studentId,
        beriman: assessmentForm.beriman || undefined,
        berkebinekaan: assessmentForm.berkebinekaan || undefined,
        bergotongroyong: assessmentForm.bergotongroyong || undefined,
        mandiri: assessmentForm.mandiri || undefined,
        bernalarkritis: assessmentForm.bernalarkritis || undefined,
        kreatif: assessmentForm.kreatif || undefined,
        overallGrade: assessmentForm.overallGrade || undefined,
        notes: assessmentForm.notes || undefined,
        assessedById: user?.id || "",
      });
      toast.success("Penilaian berhasil ditambahkan");
      setIsAddAssessmentOpen(false);
      resetAssessmentForm();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menambahkan penilaian";
      toast.error(errorMessage);
    }
  };

  const handleUpdateAssessment = async () => {
    if (!editingAssessmentId) return;

    try {
      await updateAssessment.mutateAsync({
        id: editingAssessmentId,
        data: {
          beriman: assessmentForm.beriman || undefined,
          berkebinekaan: assessmentForm.berkebinekaan || undefined,
          bergotongroyong: assessmentForm.bergotongroyong || undefined,
          mandiri: assessmentForm.mandiri || undefined,
          bernalarkritis: assessmentForm.bernalarkritis || undefined,
          kreatif: assessmentForm.kreatif || undefined,
          overallGrade: assessmentForm.overallGrade || undefined,
          notes: assessmentForm.notes || undefined,
        },
      });
      toast.success("Penilaian berhasil diperbarui");
      setEditingAssessmentId(null);
      resetAssessmentForm();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal memperbarui penilaian";
      toast.error(errorMessage);
    }
  };

  const handleDeleteAssessment = async () => {
    if (!deleteAssessmentId) return;
    try {
      await deleteAssessment.mutateAsync(deleteAssessmentId);
      toast.success("Penilaian berhasil dihapus");
      setDeleteAssessmentId(null);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus penilaian";
      toast.error(errorMessage);
    }
  };

  const handleDeleteProject = async () => {
    try {
      await deleteProject.mutateAsync(projectId);
      toast.success("Proyek berhasil dihapus");
      router.push("/curriculum/merdeka");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus proyek";
      toast.error(errorMessage);
    }
  };

  const handleUpdateStatus = async () => {
    if (!editForm.status) return;
    try {
      await updateProject.mutateAsync({
        id: projectId,
        data: { status: editForm.status },
      });
      toast.success("Status proyek berhasil diperbarui");
      setIsEditMode(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal memperbarui status";
      toast.error(errorMessage);
    }
  };

  const resetAssessmentForm = () => {
    setAssessmentForm({
      studentId: "",
      beriman: "",
      berkebinekaan: "",
      bergotongroyong: "",
      mandiri: "",
      bernalarkritis: "",
      kreatif: "",
      overallGrade: "",
      notes: "",
    });
  };

  const openEditAssessment = (assessment: P5Assessment) => {
    setAssessmentForm({
      studentId: assessment.studentId,
      beriman: assessment.beriman || "",
      berkebinekaan: assessment.berkebinekaan || "",
      bergotongroyong: assessment.bergotongroyong || "",
      mandiri: assessment.mandiri || "",
      bernalarkritis: assessment.bernalarkritis || "",
      kreatif: assessment.kreatif || "",
      overallGrade: assessment.overallGrade || "",
      notes: assessment.notes || "",
    });
    setEditingAssessmentId(assessment.id);
  };

  // Table columns for assessments
  const assessmentColumns: ColumnDef<P5Assessment>[] = [
    {
      accessorKey: "student",
      header: "Siswa",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            {row.original.student?.user?.name || "-"}
          </p>
          <p className="text-sm text-muted-foreground">
            {row.original.student?.nisn}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "beriman",
      header: "Beriman",
      cell: ({ row }) => getGradeBadge(row.original.beriman),
    },
    {
      accessorKey: "berkebinekaan",
      header: "Berkebinekaan",
      cell: ({ row }) => getGradeBadge(row.original.berkebinekaan),
    },
    {
      accessorKey: "bergotongroyong",
      header: "Gotong Royong",
      cell: ({ row }) => getGradeBadge(row.original.bergotongroyong),
    },
    {
      accessorKey: "mandiri",
      header: "Mandiri",
      cell: ({ row }) => getGradeBadge(row.original.mandiri),
    },
    {
      accessorKey: "bernalarkritis",
      header: "Bernalar Kritis",
      cell: ({ row }) => getGradeBadge(row.original.bernalarkritis),
    },
    {
      accessorKey: "kreatif",
      header: "Kreatif",
      cell: ({ row }) => getGradeBadge(row.original.kreatif),
    },
    {
      accessorKey: "overallGrade",
      header: "Nilai Akhir",
      cell: ({ row }) => getGradeBadge(row.original.overallGrade),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditAssessment(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteAssessmentId(row.original.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (loadingProject) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!project) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-muted-foreground">Proyek tidak ditemukan</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/curriculum/merdeka")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader
        title={project.title}
        description="Detail Proyek Penguatan Profil Pelajar Pancasila (P5)"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Kurikulum", href: "/curriculum" },
          { label: "Kurikulum Merdeka", href: "/curriculum/merdeka" },
          { label: project.title },
        ]}
      />

      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => router.push("/curriculum/merdeka")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali
        </Button>
      </div>

      {/* Project Info Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Unit</span>
            </div>
            <p className="font-semibold">{project.unit?.name || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Tahun Ajaran
              </span>
            </div>
            <p className="font-semibold">{project.academicYear?.name || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Periode</span>
            </div>
            <p className="font-semibold">
              {project.startDate && project.endDate
                ? `${safeFormat(new Date(project.startDate), "d MMM", { locale: localeId })} - ${safeFormat(new Date(project.endDate), "d MMM yyyy", { locale: localeId })}`
                : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Siswa Dinilai
              </span>
            </div>
            <p className="font-semibold">
              {project._count?.assessments || 0} siswa
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project Details */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Informasi Proyek</CardTitle>
              <CardDescription>Detail proyek P5</CardDescription>
            </div>
            <div className="flex gap-2">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditMode(false)}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Batal
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleUpdateStatus}
                    disabled={updateProject.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Simpan
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditForm({ status: project.status });
                      setIsEditMode(true);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteProjectOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Hapus
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Tema</Label>
                <p className="font-medium">{project.theme?.name || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                {isEditMode ? (
                  <Select
                    value={editForm.status}
                    onValueChange={(val: ProjectStatus) =>
                      setEditForm({ status: val })
                    }
                  >
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="mt-1">{getStatusBadge(project.status)}</div>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground">Kelas</Label>
                <p className="font-medium">
                  {project.class?.name || "Semua Kelas"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Supervisor</Label>
                <div className="flex items-center gap-2 mt-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {project.supervisor?.name || "-"}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-muted-foreground">Deskripsi</Label>
              <p className="mt-1 text-sm">{project.description}</p>
            </div>

            <div>
              <Label className="text-muted-foreground">
                Dimensi P5 yang Dinilai
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {project.dimensions?.map((dim) => getDimensionBadge(dim))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* P5 Grade Legend */}
        <Card>
          <CardHeader>
            <CardTitle>Keterangan Nilai P5</CardTitle>
            <CardDescription>
              Standar penilaian Profil Pelajar Pancasila
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {P5_GRADES.map((grade) => (
              <div key={grade.value} className="flex items-center gap-3">
                <Badge className={cn("w-12 justify-center", grade.color)}>
                  {grade.value}
                </Badge>
                <span className="text-sm">{grade.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Assessments Table */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Penilaian Siswa</CardTitle>
            <CardDescription>
              Daftar penilaian P5 siswa untuk proyek ini
            </CardDescription>
          </div>
          <Button onClick={() => setIsAddAssessmentOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Penilaian
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={assessmentColumns}
            data={assessments}
            isLoading={loadingAssessments}
          />
        </CardContent>
      </Card>

      {/* Add/Edit Assessment Dialog */}
      <Dialog
        open={isAddAssessmentOpen || !!editingAssessmentId}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddAssessmentOpen(false);
            setEditingAssessmentId(null);
            resetAssessmentForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAssessmentId ? "Edit Penilaian" : "Tambah Penilaian"}
            </DialogTitle>
            <DialogDescription>
              {editingAssessmentId
                ? "Perbarui nilai P5 siswa untuk proyek ini"
                : "Masukkan nilai P5 siswa untuk proyek ini"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {!editingAssessmentId && (
              <div className="grid gap-2">
                <Label>Siswa *</Label>
                <Select
                  value={assessmentForm.studentId}
                  onValueChange={(val) =>
                    setAssessmentForm({ ...assessmentForm, studentId: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih siswa" />
                  </SelectTrigger>
                  <SelectContent>
                    {students
                      .filter(
                        (s) => !assessments.some((a) => a.studentId === s.id),
                      )
                      .map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name} ({student.nisn})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              {P5_DIMENSIONS.map((dim) => {
                const key = dim.value
                  .toLowerCase()
                  .replace("_", "") as keyof typeof assessmentForm;
                const displayKey =
                  key === "bergotongroyong" ? "bergotongroyong" : key;
                return (
                  <div key={dim.value} className="grid gap-2">
                    <Label className="flex items-center gap-2">
                      <Badge className={cn("text-xs", dim.color)}>
                        {dim.value}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {dim.label}
                      </span>
                    </Label>
                    <Select
                      value={(assessmentForm[displayKey] as string) || ""}
                      onValueChange={(val: P5Grade) =>
                        setAssessmentForm({
                          ...assessmentForm,
                          [displayKey]: val,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih nilai" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Belum dinilai</SelectItem>
                        {P5_GRADES.map((grade) => (
                          <SelectItem key={grade.value} value={grade.value}>
                            {grade.value} - {grade.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label>Nilai Akhir</Label>
              <Select
                value={assessmentForm.overallGrade}
                onValueChange={(val: P5Grade) =>
                  setAssessmentForm({ ...assessmentForm, overallGrade: val })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih nilai akhir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Belum dinilai</SelectItem>
                  {P5_GRADES.map((grade) => (
                    <SelectItem key={grade.value} value={grade.value}>
                      {grade.value} - {grade.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Catatan</Label>
              <Textarea
                placeholder="Catatan penilaian..."
                value={assessmentForm.notes}
                onChange={(e) =>
                  setAssessmentForm({
                    ...assessmentForm,
                    notes: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddAssessmentOpen(false);
                setEditingAssessmentId(null);
                resetAssessmentForm();
              }}
            >
              Batal
            </Button>
            <Button
              onClick={
                editingAssessmentId
                  ? handleUpdateAssessment
                  : handleAddAssessment
              }
              disabled={
                createAssessment.isPending || updateAssessment.isPending
              }
            >
              {createAssessment.isPending || updateAssessment.isPending
                ? "Menyimpan..."
                : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Dialog */}
      <ConfirmDialog
        open={deleteProjectOpen}
        onOpenChange={setDeleteProjectOpen}
        title="Hapus Proyek P5"
        description="Apakah Anda yakin ingin menghapus proyek ini? Semua data penilaian siswa akan ikut terhapus."
        onConfirm={handleDeleteProject}
        isLoading={deleteProject.isPending}
      />

      {/* Delete Assessment Dialog */}
      <ConfirmDialog
        open={!!deleteAssessmentId}
        onOpenChange={(open) => !open && setDeleteAssessmentId(null)}
        title="Hapus Penilaian"
        description="Apakah Anda yakin ingin menghapus penilaian ini?"
        onConfirm={handleDeleteAssessment}
        isLoading={deleteAssessment.isPending}
      />
    </MainLayout>
  );
}
