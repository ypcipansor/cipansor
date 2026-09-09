"use client";

import { useRouter } from "next/navigation";
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
  useAssessmentCreation as useCreateAssessment,
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABELS,
  useClasses,
  useSubjects,
  useAcademicYears,
  ExamType,
} from "@/hooks";
import { useQuestionBanks } from "@/hooks/use-cbt";
import { useAuthStore } from "@/stores/auth";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
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
  questionBankId: z.string().optional(),
});

type AssessmentFormData = z.infer<typeof assessmentSchema>;

export default function NewAssessmentPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const createAssessment = useCreateAssessment();

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
      academicYearId: academicYears?.data?.find((ay) => ay.isActive)?.id ?? "",
      semester: 1,
      scheduledAt: new Date().toISOString().split("T")[0],
      maxScore: 100,
      passingScore: 70,
      weight: 1,
      description: "",
      questionBankId: "",
    },
  });

  const selectedSubject = form.watch("subjectId");
  const { data: questionBanks } = useQuestionBanks({
    subjectId: selectedSubject || undefined,
  });

  const onSubmit = async (data: AssessmentFormData) => {
    if (!user) {
      toast.error("Sesi berakhir, silakan login kembali");
      return;
    }

    try {
      await createAssessment.mutateAsync({
        ...data,
        unitId: user.unitId || "",
        teacherId: user.id,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
      });
      toast.success("Penilaian berhasil dibuat");
      router.push("/assessment");
    } catch (error) {
      toast.error("Gagal membuat penilaian");
    }
  };

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
              Buat Penilaian Baru
            </h1>
            <p className="text-muted-foreground">
              Tambahkan penilaian baru untuk kelas
            </p>
          </div>
        </div>

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

                  {/* CBT Option */}
                  <FormField
                    control={form.control}
                    name="questionBankId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Soal (Opsional - Mode CBT)</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih Bank Soal (Kosongkan jika manual)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">
                              -- Tidak Menggunakan Bank Soal --
                            </SelectItem>
                            {questionBanks?.data?.map((bank: any) => (
                              <SelectItem key={bank.id} value={bank.id}>
                                {bank.title} ({bank._count?.questions} soal)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Jika dipilih, siswa akan mengerjakan soal secara
                          online (CBT).
                        </FormDescription>
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
              <Button type="submit" disabled={createAssessment.isPending}>
                {createAssessment.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan Penilaian
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
