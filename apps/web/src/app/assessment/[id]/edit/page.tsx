"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAssessment,
  useUpdateAssessment,
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABELS,
} from "@/hooks";
import { useClasses, useSubjects, useAcademicYears } from "@/hooks";
import { ArrowLeft, Save, Loader2, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";

const assessmentSchema = z.object({
  title: z.string().min(1, "Nama penilaian wajib diisi"),
  type: z.enum(
    [
      "DAILY_TEST",
      "MIDTERM",
      "FINAL",
      "PRACTICAL",
      "PROJECT",
      "QUIZ",
      "TAHFIDZ_TEST",
    ],
    {
      error: "Tipe penilaian wajib dipilih",
    },
  ),
  classId: z.string().min(1, "Kelas wajib dipilih"),
  subjectId: z.string().min(1, "Mata pelajaran wajib dipilih"),
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
  semester: z.coerce.number().min(1).max(2, "Semester harus 1 atau 2"),
  scheduledAt: z.string({
    error: "Tanggal wajib diisi",
  }),
  maxScore: z.coerce
    .number()
    .min(1, "Nilai maksimal minimal 1")
    .max(100, "Nilai maksimal tidak boleh lebih dari 100"),
  passingScore: z.coerce.number().min(0).max(100).optional(),
  weight: z.coerce.number().min(0.1).max(10).optional(),
  description: z.string().optional(),
});

type AssessmentFormData = z.infer<typeof assessmentSchema>;

export default function EditAssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;

  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const updateAssessment = useUpdateAssessment();

  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: academicYears } = useAcademicYears();

  const form = useForm<AssessmentFormData>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: {
      title: "",
      type: undefined,
      classId: "",
      subjectId: "",
      academicYearId: "",
      semester: 1,
      scheduledAt: "",
      maxScore: 100,
      passingScore: 70,
      weight: 1,
      description: "",
    },
  });

  useEffect(() => {
    if (assessment) {
      form.reset({
        title: assessment.title,
        type: assessment.type as any,
        classId: assessment.classId,
        subjectId: assessment.subjectId,
        academicYearId: assessment.academicYearId,
        semester: assessment.semester,
        scheduledAt: new Date(assessment.scheduledAt)
          .toISOString()
          .split("T")[0],
        maxScore: assessment.maxScore,
        passingScore: assessment.passingScore ?? 70,
        weight: assessment.weight ?? 1,
        description: assessment.description ?? "",
      });
    }
  }, [assessment, form]);

  const onSubmit = async (data: AssessmentFormData) => {
    try {
      await updateAssessment.mutateAsync({
        id: assessmentId,
        data: {
          ...data,
          scheduledAt: new Date(data.scheduledAt).toISOString(),
        },
      });
      toast.success("Penilaian berhasil diperbarui");
      router.push(`/assessment/${assessmentId}`);
    } catch (error) {
      toast.error("Gagal memperbarui penilaian");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!assessment) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Penilaian tidak ditemukan</p>
          <Button onClick={() => router.push("/assessment")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Edit Penilaian
            </h1>
            <p className="text-muted-foreground">
              Perbarui data penilaian {assessment.title}
            </p>
          </div>
        </div>

        {assessment.status !== "DRAFT" && (
          <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-green-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <span className="text-yellow-800">
              Penilaian sudah dipublikasikan. Beberapa perubahan mungkin tidak
              akan berpengaruh pada nilai yang sudah diterima.
            </span>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Informasi Dasar</CardTitle>
                  <CardDescription>Detail utama penilaian</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nama Penilaian</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: UTS Matematika"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipe Penilaian</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tipe penilaian" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ASSESSMENT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {ASSESSMENT_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Pelaksanaan</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deskripsi</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Deskripsi penilaian (opsional)"
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Class & Subject */}
              <Card>
                <CardHeader>
                  <CardTitle>Kelas & Mata Pelajaran</CardTitle>
                  <CardDescription>
                    Pilih kelas dan mata pelajaran
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="academicYearId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tahun Ajaran</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tahun ajaran" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {academicYears?.data?.map((year) => (
                              <SelectItem key={year.id} value={year.id}>
                                {year.name} {year.isActive && "(Aktif)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="semester"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Semester</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih semester" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">
                              Semester 1 (Ganjil)
                            </SelectItem>
                            <SelectItem value="2">
                              Semester 2 (Genap)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="classId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kelas</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih kelas" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {classes?.data?.map((cls) => (
                              <SelectItem key={cls.id} value={cls.id}>
                                {cls.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subjectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mata Pelajaran</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih mata pelajaran" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subjects?.map((subject) => (
                              <SelectItem key={subject.id} value={subject.id}>
                                {subject.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Scoring */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Pengaturan Nilai</CardTitle>
                  <CardDescription>Konfigurasi penilaian</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="maxScore"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nilai Maksimal</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={100} {...field} />
                          </FormControl>
                          <FormDescription>Rentang nilai 1-100</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="passingScore"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            KKM (Kriteria Ketuntasan Minimal)
                          </FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={100} {...field} />
                          </FormControl>
                          <FormDescription>
                            Nilai minimal untuk lulus
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="weight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bobot</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0.1}
                              max={10}
                              step={0.1}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Bobot nilai untuk rapor
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Batal
              </Button>
              <Button type="submit" disabled={updateAssessment.isPending}>
                {updateAssessment.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan Perubahan
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </MainLayout>
  );
}
