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
  type DailyReport,
} from "@/hooks/use-daily-report";
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
import { Save, ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/api-error";
import { DAILY_MOOD_VALUES, MEAL_CONSUMPTION_VALUES } from "@cipansor/shared";
import { MOOD_OPTIONS, CONSUMPTION_OPTIONS } from "../../constants";

const dailyReportSchema = z.object({
  morningMood: z.enum(DAILY_MOOD_VALUES).optional(),
  healthNotes: z.string().optional(),
  temperature: z.number().optional(),
  breakfastConsumption: z.enum(MEAL_CONSUMPTION_VALUES).optional(),
  lunchConsumption: z.enum(MEAL_CONSUMPTION_VALUES).optional(),
  snackConsumption: z.enum(MEAL_CONSUMPTION_VALUES).optional(),
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

/**
 * What the report holds, as the form's starting values. A field the teacher
 * left empty stays empty: filling it with a likely value ("Senang", 36.5 °C,
 * "Habis") would write that value into the child's record on save.
 */
function toFormValues(report: DailyReport): DailyReportFormData {
  return {
    morningMood: report.mood ?? undefined,
    healthNotes: report.healthStatus ?? "",
    temperature: report.temperature ?? undefined,
    // Only whether the child had breakfast is kept.
    breakfastConsumption:
      report.hadBreakfast == null
        ? undefined
        : report.hadBreakfast
          ? "HABIS"
          : "TIDAK_MAU",
    lunchConsumption: report.mealStatus ?? undefined,
    snackConsumption: report.snackStatus ?? undefined,
    napDurationMinutes: report.napDuration ?? undefined,
    toiletingNotes: report.toiletNotes ?? "",
    activitiesSummary: report.activitiesSummary ?? "",
    learningAchievements: report.achievements ?? "",
    surahPractice: report.tahfidzActivity ?? "",
    behaviorNotes: report.behaviorNotes ?? "",
    teacherNotes: report.teacherNotes ?? "",
    homeworkSuggestion: report.homeActivity ?? "",
  };
}

export default function EditDailyReportPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: report, isLoading } = useDailyReport(id);

  if (isLoading || !report) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <p className="text-muted-foreground">Laporan tidak ditemukan.</p>
          )}
        </div>
      </MainLayout>
    );
  }

  // Built once the report is here, so its values are the form's defaults
  // rather than a reset the controlled Selects can lose.
  return <EditDailyReportForm key={report.id} report={report} />;
}

function EditDailyReportForm({ report }: { report: DailyReport }) {
  const router = useRouter();
  const form = useForm<DailyReportFormData>({
    resolver: zodResolver(dailyReportSchema),
    defaultValues: toFormValues(report),
  });

  const updateMutation = useUpdateDailyReport();

  const onSubmit = async (data: DailyReportFormData) => {
    try {
      // The pupil and the day are fixed. The form's "catatan guru" is the
      // contract's `parentNotes` (the note for the family).
      await updateMutation.mutateAsync({
        id: report.id,
        data: {
          morningMood: data.morningMood,
          healthNotes: data.healthNotes,
          temperature: data.temperature,
          breakfastConsumption: data.breakfastConsumption,
          lunchConsumption: data.lunchConsumption,
          snackConsumption: data.snackConsumption,
          napDurationMinutes: data.napDurationMinutes,
          toiletingNotes: data.toiletingNotes,
          activitiesSummary: data.activitiesSummary,
          learningAchievements: data.learningAchievements,
          surahPractice: data.surahPractice,
          behaviorNotes: data.behaviorNotes,
          parentNotes: data.teacherNotes,
          homeworkSuggestion: data.homeworkSuggestion,
        },
      });
      toast.success("Laporan harian berhasil diperbarui");
      router.push("/tk/daily-reports");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

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
                  Siswa dan tanggal laporan tidak dapat diubah
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Siswa</p>
                  <p className="text-sm">
                    {report.student?.user?.name ?? "-"}
                    {report.student?.nis ? ` (${report.student.nis})` : ""}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Tanggal</p>
                  <p className="text-sm">
                    {format(new Date(report.reportDate), "EEEE, dd MMMM yyyy", {
                      locale: idLocale,
                    })}
                  </p>
                </div>
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
