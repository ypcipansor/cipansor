"use client";

import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import * as z from "zod";
import {
  Form,
  FormControl,
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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateExam, useQuestionBanks } from "@/hooks/use-cbt";
import { useUnits } from "@/hooks/use-units";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useSubjects } from "@/hooks/use-curriculum";
import { useClasses } from "@/hooks/use-classes";
import { useTeachers } from "@/hooks/use-teachers";
import { useAuthStore } from "@/stores/auth";
import { getEffectiveRole } from "@/lib/rbac";

const examSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  type: z.enum(["DAILY_TEST", "QUIZ", "MIDTERM", "FINAL", "PRACTICAL", "PROJECT", "TAHFIDZ_TEST"]).default("MIDTERM"),
  unitId: z.string().min(1, "Unit harus diisi"),
  academicYearId: z.string().min(1, "Tahun Ajaran harus diisi"),
  subjectId: z.string().min(1, "Mata Pelajaran harus diisi"),
  classId: z.string().min(1, "Kelas harus diisi"),
  teacherId: z.string().optional(),
  questionBankId: z.string().min(1, "Bank Soal harus dipilih"),
  scheduledAt: z.string().min(1, "Waktu Pelaksanaan harus diisi"),
  duration: z.coerce.number().min(10, "Durasi minimal 10 menit"),
  maxScore: z.coerce.number().min(1, "Nilai maksimal harus lebih dari 0"),
  passingScore: z.coerce.number().min(1, "KKM harus lebih dari 0"),
  status: z.enum(["DRAFT", "SCHEDULED"]).default("DRAFT"),
});

export default function NewExamPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = getEffectiveRole(user) === "SUPER_ADMIN" || getEffectiveRole(user) === "UNIT_ADMIN";

  const createExam = useCreateExam();
  const { data: banksRes } = useQuestionBanks();

  const { data: unitsRes } = useUnits({ limit: 100 });
  const { data: academicYearsRes } = useAcademicYears({ limit: 100 });
  const { data: subjectsRes } = useSubjects();
  const { data: classesRes } = useClasses({ limit: 100 });
  const { data: teachersRes } = useTeachers({ limit: 100 });

  const banks = banksRes?.data || [];
  const units = Array.isArray(unitsRes) ? unitsRes : ((unitsRes as any)?.data || []);
  const academicYears = academicYearsRes?.data || [];
  const subjects = Array.isArray(subjectsRes) ? subjectsRes : ((subjectsRes as any)?.data || []);
  const classes = classesRes?.data || [];
  const teachers = teachersRes?.data || [];

  const form = useForm<z.infer<typeof examSchema>>({
    resolver: zodResolver(examSchema) as any,
    defaultValues: {
      title: "",
      description: "",
      type: "MIDTERM",
      unitId: "",
      academicYearId: "",
      subjectId: "",
      classId: "",
      teacherId: "",
      questionBankId: "",
      scheduledAt: "",
      duration: 60,
      maxScore: 100,
      passingScore: 70,
      status: "DRAFT",
    },
  });

  async function onSubmit(values: z.infer<typeof examSchema>) {
    if (isAdmin && !values.teacherId) {
      toast.error("Guru Pengampu harus dipilih");
      return;
    }
    try {
      await createExam.mutateAsync({
        ...values,
        scheduledAt: new Date(values.scheduledAt).toISOString(),
      });
      toast.success("Jadwal ujian berhasil dibuat");
      router.push("/cbt/exams");
    } catch {
      // Error toast is already shown by the global Axios interceptor
    }
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Buat Ujian Baru</h1>
          <p className="text-muted-foreground">
            Konfigurasi jadwal, kelas, dan bank soal untuk ujian.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Form Konfigurasi Ujian</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Judul Ujian</FormLabel>
                        <FormControl>
                          <Input placeholder="Contoh: UTS Matematika Ganjil" {...field} />
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
                        <FormLabel>Tipe Ujian</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih Tipe Ujian" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="DAILY_TEST">Ulangan Harian</SelectItem>
                            <SelectItem value="QUIZ">Kuis</SelectItem>
                            <SelectItem value="MIDTERM">Ujian Tengah Semester (UTS)</SelectItem>
                            <SelectItem value="FINAL">Ujian Akhir Semester (UAS)</SelectItem>
                            <SelectItem value="PRACTICAL">Praktik</SelectItem>
                            <SelectItem value="PROJECT">Proyek</SelectItem>
                            <SelectItem value="TAHFIDZ_TEST">Ujian Tahfidz</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="unitId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih Unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {units.map((item: any) => (
                              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="academicYearId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tahun Ajaran</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih Tahun Ajaran" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {academicYears.map((item: any) => (
                              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih Mata Pelajaran" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subjects.map((item: any) => (
                              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                            ))}
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih Kelas" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {classes.map((item: any) => (
                              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isAdmin && (
                    <FormField
                      control={form.control}
                      name="teacherId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Guru Pengampu (Admin Only)</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih Guru" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {teachers.map((t: any) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.user?.name || t.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="questionBankId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Soal</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Bank Soal" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {banks.map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.title} ({b._count?.questions || 0} Soal)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Waktu Pelaksanaan</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Durasi (Menit)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="passingScore"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>KKM (Passing Score)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status Ujian</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="DRAFT">Draft</SelectItem>
                            <SelectItem value="SCHEDULED">Terjadwal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={createExam.isPending}>
                    {createExam.isPending ? "Menyimpan..." : "Simpan Ujian"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
