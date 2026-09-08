"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ArrowLeft, Save, AlertTriangle, User, Shield } from "lucide-react";
import Link from "next/link";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import {
  useCreateCounselingRecord,
  COUNSELING_CATEGORIES,
  COUNSELING_PRIORITIES,
  type CreateCounselingInput,
} from "@/hooks/use-counseling";
import { useStudents } from "@/hooks/use-students";
import { useDebounce } from "@/hooks/use-debounce";

export default function NewCounselingPage() {
  const router = useRouter();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    name: string;
    nisn?: string;
    parentName: string;
    parentPhone: string;
    currentClass?: { name: string };
  } | null>(null);

  const debouncedStudentSearch = useDebounce(studentSearch, 300);

  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    search: debouncedStudentSearch || undefined,
    limit: 10,
  });

  const students = studentsData?.data || [];

  const createMutation = useCreateCounselingRecord();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateCounselingInput>({
    defaultValues: {
      isConfidential: false,
      priority: "MEDIUM",
      category: "ACADEMIC",
    },
  });

  const isConfidential = watch("isConfidential");

  const onSubmit = async (data: CreateCounselingInput) => {
    if (!selectedStudent) {
      toast.error("Pilih siswa terlebih dahulu");
      return;
    }
    if (!data.category) {
      toast.error("Pilih kategori konseling terlebih dahulu");
      return;
    }

    try {
      await createMutation.mutateAsync({
        ...data,
        studentId: selectedStudent.id,
      });
      toast.success("Sesi konseling berhasil dibuat");
      router.push("/counseling");
    } catch {
      toast.error("Gagal membuat sesi konseling");
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="Buat Sesi Konseling"
        description="Catat sesi bimbingan konseling baru"
        backHref="/counseling"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Student Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informasi Siswa
            </CardTitle>
            <CardDescription>Pilih siswa yang akan dikonseling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Cari Siswa *</Label>
              <Input
                placeholder="Ketik nama atau NISN siswa..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              {studentSearch && !selectedStudent && (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {studentsLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      Mencari...
                    </p>
                  ) : students.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      Siswa tidak ditemukan
                    </p>
                  ) : (
                    students.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        className="w-full p-3 text-left hover:bg-muted/50 border-b last:border-0"
                        onClick={() => {
                          setSelectedStudent({
                            id: student.id,
                            name: student.name,
                            nisn: student.nisn,
                            parentName: student.parentName,
                            parentPhone: student.parentPhone,
                            currentClass: student.currentClass,
                          });
                          setStudentSearch("");
                        }}
                      >
                        <p className="font-medium">{student.name}</p>
                        <p className="text-sm text-muted-foreground">
                          NISN: {student.nisn} •{" "}
                          {student.currentClass?.name || "-"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedStudent && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{selectedStudent.name}</p>
                    <p className="text-sm text-muted-foreground">
                      NISN: {selectedStudent.nisn} •{" "}
                      {selectedStudent.currentClass?.name || "-"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Orang Tua: {selectedStudent.parentName} (
                      {selectedStudent.parentPhone})
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedStudent(null)}
                  >
                    Ganti
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session Information */}
        <Card>
          <CardHeader>
            <CardTitle>Detail Sesi</CardTitle>
            <CardDescription>Informasi mengenai sesi konseling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Judul Sesi *</Label>
              <Input
                id="title"
                placeholder="Topik utama konseling..."
                {...register("title", { required: "Judul wajib diisi" })}
              />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kategori *</Label>
                <Select
                  defaultValue="ACADEMIC"
                  onValueChange={(v) =>
                    setValue(
                      "category",
                      v as CreateCounselingInput["category"],
                      { shouldValidate: true },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNSELING_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <div>
                            <p>{cat.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {cat.description}
                            </p>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Prioritas *</Label>
                <Select
                  defaultValue="MEDIUM"
                  onValueChange={(v) =>
                    setValue("priority", v as CreateCounselingInput["priority"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNSELING_PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Jadwal *</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  {...register("scheduledAt", {
                    required: "Jadwal wajib diisi",
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Durasi (menit)</Label>
                <Input
                  id="duration"
                  type="number"
                  placeholder="60"
                  {...register("duration", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Lokasi</Label>
              <Input
                id="location"
                placeholder="Ruang BK, Online, dll"
                {...register("location")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Deskripsi / Keluhan *</Label>
              <Textarea
                id="description"
                placeholder="Jelaskan detail permasalahan atau topik yang akan dibahas..."
                rows={5}
                {...register("description", {
                  required: "Deskripsi wajib diisi",
                })}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Confidentiality */}
        <Card>
          <CardHeader>
            <CardTitle>Privasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Shield
                  className={`h-5 w-5 ${isConfidential ? "text-amber-500" : "text-muted-foreground"}`}
                />
                <div>
                  <p className="font-medium">Sesi Rahasia</p>
                  <p className="text-sm text-muted-foreground">
                    Hanya konselor dan admin yang bisa melihat
                  </p>
                </div>
              </div>
              <Switch
                checked={isConfidential}
                onCheckedChange={(v) => setValue("isConfidential", v)}
              />
            </div>

            {isConfidential && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Sesi ini akan ditandai sebagai rahasia. Data hanya dapat
                  diakses oleh konselor dan admin yang berwenang.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" asChild>
            <Link href="/counseling">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Batal
            </Link>
          </Button>
          <Button
            type="submit"
            disabled={
              isSubmitting || createMutation.isPending || !selectedStudent
            }
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting || createMutation.isPending
              ? "Menyimpan..."
              : "Simpan"}
          </Button>
        </div>
      </form>
    </MainLayout>
  );
}
