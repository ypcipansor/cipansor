"use client";

import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useDailyReport,
  useUpdateDailyReport,
  DailyMood,
} from "@/hooks/use-daily-report";
import { useStudents } from "@/hooks/use-students";
import { useClasses } from "@/hooks/use-classes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Save, ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { MOOD_OPTIONS, CONSUMPTION_OPTIONS } from "../../constants";

const dailyReportSchema = z.object({
  studentId: z.string().min(1, "Siswa wajib dipilih"),
  classId: z.string().min(1, "Kelas wajib dipilih"),
  reportDate: z.date({ error: "Tanggal wajib diisi" }),
  morningMood: z.string().optional(),
  healthNotes: z.string().optional(),
  temperature: z.number().optional(),
  breakfastConsumption: z.string().optional(),
  lunchConsumption: z.string().optional(),
  snackConsumption: z.string().optional(),
  napDurationMinutes: z.number().optional(),
  toiletingNotes: z.string().optional(),
  activitiesSummary: z.string().optional(),
  learningAchievements: z.string().optional(),
  surahPractice: z.string().optional(),
  behaviorNotes: z.string().optional(),
  teacherNotes: z.string().optional(),
  homeworkSuggestion: z.string().optional(),
});

type DailyReportFormData = z.infer<typeof dailyReportSchema>;

export default function EditDailyReportPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuthStore();

  const { data: report, isLoading: loadingReport } = useDailyReport(id);
  const { data: students } = useStudents({ unitId: user?.unitId, limit: 100 });
  const { data: classes } = useClasses({ unitId: user?.unitId });

  const form = useForm<DailyReportFormData>({
    resolver: zodResolver(dailyReportSchema),
    defaultValues: {
      studentId: "",
      classId: "",
      reportDate: new Date(),
    },
  });

  const updateMutation = useUpdateDailyReport();

  useEffect(() => {
    if (report) {
      // Safe access for classId using optional chaining
      form.reset({
        studentId: report.studentId,
        classId: report.student?.classId || "",
        reportDate: new Date(report.reportDate),
        morningMood: report.mood || "HAPPY",
        healthNotes: report.healthStatus || "",
        temperature: report.temperature || 36.5,
        breakfastConsumption: report.hadBreakfast ? "HABIS" : "TIDAK_MAU", // Simplified mapping
        lunchConsumption: report.mealStatus || "HABIS",
        snackConsumption: report.snackStatus || "HABIS",
        napDurationMinutes: report.napDuration || 0,
        toiletingNotes: report.toiletNotes || "",
        activitiesSummary: report.activitiesSummary || "",
        learningAchievements: report.achievements || "",
        surahPractice: report.tahfidzActivity || "",
        behaviorNotes: report.behaviorNotes || "",
        teacherNotes: report.teacherNotes || "",
        homeworkSuggestion: report.homeActivity || "",
      });
    }
  }, [report, form]);

  const onSubmit = async (data: DailyReportFormData) => {
    try {
      // Remove fields that shouldn't be updated
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { reportDate, studentId, classId, ...updateData } = data;

      await updateMutation.mutateAsync({
        id,
        data: {
          ...updateData,
          morningMood: updateData.morningMood as DailyMood | undefined,
        },
      });
      toast.success("Laporan harian berhasil diperbarui");
      router.push("/paud/daily-reports");
    } catch {
      toast.error("Gagal memperbarui laporan harian");
    }
  };

  if (loadingReport) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Edit Laporan Harian"
          description="Perbarui laporan aktivitas harian siswa"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 max-w-5xl mx-auto"
          >
            <Card>
              <CardHeader>
                <CardTitle>Informasi Dasar</CardTitle>
                <CardDescription>
                  Pilih siswa dan tanggal laporan
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="studentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Siswa *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih siswa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {students?.data?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
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
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kelas *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih kelas" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {classes?.data?.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
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
                  name="reportDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tanggal *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value
                                ? format(field.value, "dd MMMM yyyy", {
                                    locale: idLocale,
                                  })
                                : "Pilih tanggal"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            locale={idLocale}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kondisi & Kesehatan</CardTitle>
                <CardDescription>
                  Mood, kesehatan, dan suhu tubuh
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="morningMood"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mood Pagi</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih mood" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MOOD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
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
                  name="temperature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Suhu Tubuh (°C)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="healthNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catatan Kesehatan</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Cth: Sehat, Batuk, dll"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Nutrition */}
            <Card>
              <CardHeader>
                <CardTitle>Nutrisi & Istirahat</CardTitle>
                <CardDescription>
                  Konsumsi makanan dan waktu tidur siang
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="breakfastConsumption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sarapan</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih konsumsi" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONSUMPTION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
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
                    name="lunchConsumption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Makan Siang</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih konsumsi" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONSUMPTION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
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
                    name="snackConsumption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Snack/Cemilan</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih konsumsi" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONSUMPTION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="napDurationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Durasi Tidur Siang (menit)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="toiletingNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Catatan Toileting</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Cth: BAB 1x, Ganti popok 2x"
                            {...field}
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kegiatan & Catatan</CardTitle>
                <CardDescription>
                  Detail kegiatan dan catatan harian
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="activitiesSummary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ringkasan Kegiatan Hari Ini</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Tuliskan kegiatan utama yang dilakukan hari ini..."
                          rows={4}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="learningAchievements"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pencapaian Belajar</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Cth: Sudah hafal doa sebelum makan..."
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="surahPractice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hafalan/Tahfidz</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Cth: Murajaah Surah Al-Fatihah..."
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="behaviorNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Perilaku & Sosial</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Cth: Berbagi mainan dengan teman..."
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="homeworkSuggestion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Saran Kegiatan di Rumah</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Cth: Mohon dibantu murajaah Surah An-Nas..."
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="teacherNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pesan untuk Orang Tua</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Pesan tambahan dari guru..."
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Batal
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
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
