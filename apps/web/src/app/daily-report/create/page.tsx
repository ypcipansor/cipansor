"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Loader2,
  Calendar as CalendarIcon,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
import { id as dateLocale } from "date-fns/locale";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LoadingSpinner,
  PhotoGallery,
  type PhotoGalleryItem,
} from "@/components/shared";
import { toast } from "sonner";
import { uploadApi } from "@/lib/api";

import { useUnits } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";
import { useClassEnrollments } from "@/hooks/use-class-enrollments";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useCreateDailyReport } from "@/hooks/use-daily-report";
import { cn } from "@/lib/utils";
import type { DailyMood } from "@cipansor/shared";
import { MainLayout } from "@/components/layout";

const MOOD_OPTIONS: { value: DailyMood; label: string; emoji: string }[] = [
  { value: "HAPPY", label: "Senang", emoji: "😊" },
  { value: "EXCITED", label: "Antusias", emoji: "🤩" },
  { value: "NEUTRAL", label: "Biasa", emoji: "😐" },
  { value: "TIRED", label: "Lelah", emoji: "😴" },
  { value: "SAD", label: "Sedih", emoji: "😢" },
  { value: "SICK", label: "Sakit", emoji: "🤒" },
];

const MEAL_OPTIONS = [
  { value: "FULL", label: "Habis" },
  { value: "HALF", label: "Setengah" },
  { value: "QUARTER", label: "Sedikit" },
  { value: "NONE", label: "Tidak Mau" },
];

function CreateDailyReportPageContent() {
  const router = useRouter();
  const createReport = useCreateDailyReport();

  // Basic Info
  const [unitId, setUnitId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());

  // Report Data
  const [mood, setMood] = useState<DailyMood>("HAPPY");
  const [arrivalTime, setArrivalTime] = useState("07:00");
  const [temperature, setTemperature] = useState("");
  const [healthNotes, setHealthNotes] = useState("");

  // Meals
  const [breakfast, setBreakfast] = useState("FULL");
  const [lunch, setLunch] = useState("FULL");
  const [snack, setSnack] = useState("FULL");

  // Activities
  const [activities, setActivities] = useState("");
  const [achievements, setAchievements] = useState("");
  const [tahfidz, setTahfidz] = useState("");
  const [napDuration, setNapDuration] = useState("0");
  const [toiletNotes, setToiletNotes] = useState("");

  // Notes
  const [behaviorNotes, setBehaviorNotes] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [homework, setHomework] = useState("");

  // Photos
  const [photos, setPhotos] = useState<PhotoGalleryItem[]>([]);

  // Queries
  const { data: unitsData } = useUnits();
  const { data: classesData } = useClasses({ unitId: unitId || undefined });
  const { data: academicYearsData } = useAcademicYears();
  const { data: enrollmentsData } = useClassEnrollments(classId);

  const units = unitsData || [];
  const classes = classesData?.data || [];
  const academicYears = academicYearsData?.data || [];
  const students = enrollmentsData || [];

  const handleSubmit = async () => {
    if (!unitId || !studentId || !academicYearId || !date) {
      toast.error("Mohon lengkapi data dasar laporan");
      return;
    }

    try {
      await createReport.mutateAsync({
        unitId,
        studentId,
        academicYearId,
        reportDate: format(date, "yyyy-MM-dd"),
        morningMood: mood,
        temperature: temperature ? parseFloat(temperature) : undefined,
        healthNotes,
        breakfastConsumption: breakfast,
        lunchConsumption: lunch,
        snackConsumption: snack,
        napDurationMinutes: napDuration ? parseInt(napDuration) : 0,
        toiletingNotes: toiletNotes,
        activitiesSummary: activities,
        learningAchievements: achievements,
        surahPractice: tahfidz,
        behaviorNotes,
        parentNotes: teacherNotes,
        homeworkSuggestion: homework,
        photoUrls: photos.map((p) => p.url),
      });

      toast.success("Laporan berhasil dibuat");
      router.push("/daily-report");
    } catch (error) {
      toast.error("Gagal membuat laporan");
      console.error(error);
    }
  };

  const handleUploadPhotos = async (files: File[]) => {
    try {
      const uploadPromises = files.map((file) => uploadApi.uploadFile(file));
      const responses = await Promise.all(uploadPromises);

      const newPhotos: PhotoGalleryItem[] = responses.map((res, index) => ({
        id: `temp-${Date.now()}-${index}`,
        // Persist the STABLE reference (never a short-lived SAS); the SAS is
        // only used for the immediate preview below.
        url: res.data.data.url,
        thumbnail: res.data.data.downloadUrl || res.data.data.url,
        uploadedAt: new Date(),
        category: "Kegiatan", // Default category
      }));

      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch (error) {
      console.error("Upload failed:", error);
      throw error; // Let PhotoGallery handle the error toast
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Buat Laporan Baru
          </h1>
          <p className="text-muted-foreground">
            Laporan harian individual untuk siswa
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Basic Info */}
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Siswa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tahun Ajaran</Label>
                <Select
                  value={academicYearId}
                  onValueChange={setAcademicYearId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Tahun" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Kelas</Label>
                <Select
                  value={classId}
                  onValueChange={setClassId}
                  disabled={!unitId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Siswa</Label>
                <Select
                  value={studentId}
                  onValueChange={setStudentId}
                  disabled={!classId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Siswa" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((enrollment) =>
                      enrollment.student ? (
                        <SelectItem
                          key={enrollment.student.id}
                          value={enrollment.student.id}
                        >
                          {enrollment.student.user?.name ||
                            enrollment.student.name}
                        </SelectItem>
                      ) : null,
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tanggal Laporan</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? (
                        format(date, "PPP", { locale: dateLocale })
                      ) : (
                        <span>Pilih Tanggal</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => d && setDate(d)}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={createReport.isPending}
          >
            {createReport.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Simpan Laporan
          </Button>
        </div>

        {/* Right Column: Report Details */}
        <div className="md:col-span-2">
          <Tabs defaultValue="activity" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="activity">Aktivitas</TabsTrigger>
              <TabsTrigger value="health">Kesehatan</TabsTrigger>
              <TabsTrigger value="meals">Makan</TabsTrigger>
              <TabsTrigger value="notes">Catatan</TabsTrigger>
              <TabsTrigger value="photos">Foto</TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Ringkasan Aktivitas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Mood Pagi</Label>
                    <div className="flex gap-2 flex-wrap">
                      {MOOD_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          variant={
                            mood === option.value ? "default" : "outline"
                          }
                          className="flex-1 min-w-[80px]"
                          onClick={() => setMood(option.value)}
                        >
                          <span className="mr-2">{option.emoji}</span>
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Ringkasan Kegiatan</Label>
                    <Textarea
                      placeholder="Apa saja kegiatan siswa hari ini?"
                      className="min-h-[100px]"
                      value={activities}
                      onChange={(e) => setActivities(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Capaian Pembelajaran (Achievements)</Label>
                    <Textarea
                      placeholder="Pencapaian khusus hari ini..."
                      value={achievements}
                      onChange={(e) => setAchievements(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tahfidz / Ibadah</Label>
                    <Textarea
                      placeholder="Surah yang dihafal/murajaah..."
                      value={tahfidz}
                      onChange={(e) => setTahfidz(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="photos" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Dokumentasi Kegiatan</CardTitle>
                  <CardDescription>
                    Upload foto kegiatan siswa hari ini
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PhotoGallery
                    photos={photos}
                    onUpload={handleUploadPhotos}
                    onDelete={handleDeletePhoto}
                    categories={[
                      "Kegiatan",
                      "Hasil Karya",
                      "Makan",
                      "Tidur",
                      "Bermain",
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="health" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Kondisi Fisik</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Jam Datang</Label>
                      <Input
                        type="time"
                        value={arrivalTime}
                        onChange={(e) => setArrivalTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Suhu Tubuh (°C)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="36.5"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Catatan Kesehatan</Label>
                    <Textarea
                      placeholder="Keluhan sakit, obat yang diminum, dll..."
                      value={healthNotes}
                      onChange={(e) => setHealthNotes(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Durasi Tidur Siang (menit)</Label>
                      <Input
                        type="number"
                        value={napDuration}
                        onChange={(e) => setNapDuration(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Catatan Toilet (BAB/BAK)</Label>
                      <Input
                        placeholder="Frekuensi/Kondisi..."
                        value={toiletNotes}
                        onChange={(e) => setToiletNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="meals" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Konsumsi Makan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Sarapan / Snack Pagi</Label>
                    <Select value={breakfast} onValueChange={setBreakfast}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Makan Siang</Label>
                    <Select value={lunch} onValueChange={setLunch}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Snack Sore</Label>
                    <Select value={snack} onValueChange={setSnack}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Catatan & Komunikasi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Catatan Perilaku</Label>
                    <Textarea
                      placeholder="Perilaku baik atau yang perlu perhatian..."
                      value={behaviorNotes}
                      onChange={(e) => setBehaviorNotes(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Catatan Guru untuk Orang Tua</Label>
                    <Textarea
                      placeholder="Pesan khusus untuk orang tua..."
                      value={teacherNotes}
                      onChange={(e) => setTeacherNotes(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>PR / Tugas di Rumah</Label>
                    <Textarea
                      placeholder="Tugas yang perlu dikerjakan di rumah..."
                      value={homework}
                      onChange={(e) => setHomework(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function CreateDailyReportPage() {
  return (
    <MainLayout>
      <CreateDailyReportPageContent />
    </MainLayout>
  );
}
