"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { useCreateDailyReport, DailyMood } from "@/hooks/use-daily-report";
import { useClasses } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, CalendarIcon, Save, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { MOOD_OPTIONS, CONSUMPTION_OPTIONS } from "../constants";
import {
  PhotoUploader,
  PhotoItem,
} from "@/components/daily-report/PhotoUploader";
import { useAddDailyReportPhoto } from "@/hooks/use-daily-report";

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
  parentNotes: z.string().optional(),
  homeworkSuggestion: z.string().optional(),
});

type DailyReportFormData = z.infer<typeof dailyReportSchema>;

export default function CreateDailyReportPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  const { data: classes } = useClasses({ unitId: user?.unitId });
  const { data: students } = useStudents({
    classId: selectedClassId || undefined,
    unitId: user?.unitId,
    limit: 100,
  });

  const createMutation = useCreateDailyReport();
  const addPhotoMutation = useAddDailyReportPhoto();

  const form = useForm<DailyReportFormData>({
    resolver: zodResolver(dailyReportSchema),
    defaultValues: {
      studentId: "",
      classId: "",
      reportDate: new Date(),
      morningMood: "HAPPY",
      healthNotes: "",
      temperature: 36.5,
      breakfastConsumption: "HABIS",
      lunchConsumption: "HABIS",
      snackConsumption: "HABIS",
      napDurationMinutes: 0,
      toiletingNotes: "",
      activitiesSummary: "",
      learningAchievements: "",
      surahPractice: "",
      behaviorNotes: "",
      parentNotes: "",
      homeworkSuggestion: "",
    },
  });

  const onSubmit = async (data: DailyReportFormData) => {
    try {
      // 1. Create Daily Report
      const report = await createMutation.mutateAsync({
        ...data,
        reportDate: format(data.reportDate, "yyyy-MM-dd"),
        morningMood: data.morningMood as DailyMood | undefined,
        unitId: user?.unitId || "",
        academicYearId: user?.academicYearId || "",
      });

      // 2. Upload Photos (Mock implementation since we lack a real file upload endpoint)
      if (photos.length > 0 && report.id) {
        await Promise.all(
          photos.map(async (photo) => {
            // In a real app, we would upload photo.file to S3/Cloudinary here
            // const url = await uploadService.upload(photo.file);

            // Using a placeholder URL for now to satisfy the requirement
            const mockUrl = `https://storage.cipansor.or.id/daily-reports/${report.id}/${photo.id}.jpg`;

            if (!photo.file) return;

            return addPhotoMutation.mutateAsync({
              reportId: report.id,
              file: photo.file,
              caption: photo.caption,
              activityType: "ACTIVITY",
            });
          }),
        );
      }

      toast.success("Laporan harian berhasil dibuat");
      router.push("/tk/daily-reports");
    } catch {
      toast.error("Gagal membuat laporan harian");
    }
  };

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    form.setValue("classId", classId);
    form.setValue("studentId", "");
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Buat Laporan Harian"
          description="Buat laporan harian aktivitas siswa TK"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informasi Dasar</CardTitle>
                <CardDescription>
                  Data siswa dan tanggal laporan
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kelas *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={handleClassChange}
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
                  name="studentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Siswa *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!selectedClassId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih siswa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {students?.data?.map((student) => (
                            <SelectItem key={student.id} value={student.id}>
                              {student.name} ({student.nis})
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

            {/* Condition */}
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

            {/* Activities & Notes */}
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
                  name="parentNotes"
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

            <Card>
              <CardHeader>
                <CardTitle>Foto Kegiatan</CardTitle>
                <CardDescription>
                  Dokumentasi kegiatan siswa hari ini
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PhotoUploader
                  photos={photos}
                  onChange={setPhotos}
                  maxPhotos={5}
                  showCaption={true}
                />
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan Laporan
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
