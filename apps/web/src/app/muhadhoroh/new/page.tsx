"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Mic2,
  Calendar,
  User,
  Languages,
  FileText,
  Save,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { useStudents } from "@/hooks/use-students";
import { useUnits } from "@/hooks/use-units";
import { useCreateMuhadhoroh } from "@/hooks/use-muhadhoroh";

// Form Schema
const muhadhorohSchema = z.object({
  studentId: z.string().min(1, "Santri harus dipilih"),
  unitId: z.string().min(1, "Unit harus dipilih"),
  scheduledAt: z.date({
    error: "Tanggal dan waktu harus diisi",
  }),
  topic: z
    .string()
    .min(3, "Topik minimal 3 karakter")
    .max(200, "Topik maksimal 200 karakter"),
  language: z.enum(["Indonesian", "Arabic", "English"], {
    error: "Bahasa harus dipilih",
  }),
});

type MuhadhorohFormData = z.infer<typeof muhadhorohSchema>;

// Language options
const LANGUAGE_OPTIONS = [
  { value: "Indonesian", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { value: "Arabic", label: "Bahasa Arab", flag: "🕌" },
  { value: "English", label: "Bahasa Inggris", flag: "🇬🇧" },
];

// Sample topics for suggestions
const TOPIC_SUGGESTIONS = {
  Indonesian: [
    "Pentingnya Menuntut Ilmu",
    "Menjaga Kebersihan Lingkungan",
    "Berbakti Kepada Orang Tua",
    "Menjadi Pemuda yang Bertanggung Jawab",
    "Indahnya Persaudaraan dalam Islam",
  ],
  Arabic: [
    "أهمية طلب العلم",
    "فضل الصبر في الإسلام",
    "حسن الخلق",
    "بر الوالدين",
    "فضائل الأخوة في الإسلام",
  ],
  English: [
    "The Importance of Seeking Knowledge",
    "The Value of Honesty",
    "Respecting Our Parents",
    "Building Strong Character",
    "The Beauty of Brotherhood in Islam",
  ],
};

export default function NewMuhadhorohPage() {
  const router = useRouter();
  const [studentSearch, setStudentSearch] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState("08:00");

  // Form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MuhadhorohFormData>({
    resolver: zodResolver(muhadhorohSchema),
    defaultValues: {
      language: "Indonesian",
    },
  });

  const selectedUnitId = watch("unitId");
  const selectedLanguage = watch("language");
  const selectedDate = watch("scheduledAt");
  const selectedStudentId = watch("studentId");

  // Data fetching
  const { data: unitsData } = useUnits();
  const units = unitsData || [];

  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    unitId: selectedUnitId,
    search: studentSearch,
    limit: 50,
    status: "ACTIVE",
  });
  const students = studentsData?.data || [];

  const createMuhadhoroh = useCreateMuhadhoroh();

  // Get selected student info
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  // Handle form submit
  const onSubmit = async (data: MuhadhorohFormData) => {
    try {
      // Combine date and time
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = new Date(data.scheduledAt);
      scheduledAt.setHours(hours, minutes, 0, 0);

      await createMuhadhoroh.mutateAsync({
        unitId: data.unitId,
        studentId: data.studentId,
        scheduledAt: scheduledAt.toISOString(),
        topic: data.topic,
        language: data.language,
      });

      toast.success("Jadwal muhadhoroh berhasil dibuat");
      router.push("/muhadhoroh");
    } catch (error) {
      toast.error("Gagal membuat jadwal muhadhoroh");
    }
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/muhadhoroh">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Link>
        </Button>
        <PageHeader
          title="Jadwalkan Muhadhoroh"
          description="Buat jadwal latihan pidato baru untuk santri"
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Form */}
          <div className="md:col-span-2 space-y-6">
            {/* Unit & Student Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" />
                  Pilih Santri
                </CardTitle>
                <CardDescription>
                  Pilih unit dan santri yang akan melaksanakan muhadhoroh
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Unit Selection */}
                <div className="space-y-2">
                  <Label htmlFor="unitId">Unit / Sekolah *</Label>
                  <Select
                    value={selectedUnitId}
                    onValueChange={(value) => {
                      setValue("unitId", value);
                      setValue("studentId", ""); // Reset student when unit changes
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih unit..." />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.unitId && (
                    <p className="text-sm text-destructive">
                      {errors.unitId.message}
                    </p>
                  )}
                </div>

                {/* Student Selection */}
                <div className="space-y-2">
                  <Label htmlFor="studentId">Santri *</Label>
                  <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={studentOpen}
                        className="w-full justify-between"
                        disabled={!selectedUnitId}
                      >
                        {selectedStudent ? (
                          <span className="flex items-center gap-2">
                            <span>{selectedStudent.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {selectedStudent.nis}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {selectedUnitId
                              ? "Pilih santri..."
                              : "Pilih unit terlebih dahulu"}
                          </span>
                        )}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Cari nama atau NIS santri..."
                          value={studentSearch}
                          onValueChange={setStudentSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {studentsLoading
                              ? "Memuat..."
                              : "Santri tidak ditemukan"}
                          </CommandEmpty>
                          <CommandGroup>
                            {students.map((student) => (
                              <CommandItem
                                key={student.id}
                                value={`${student.name} ${student.nis}`}
                                onSelect={() => {
                                  setValue("studentId", student.id);
                                  setStudentOpen(false);
                                }}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div>
                                    <p className="font-medium">
                                      {student.name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {student.nis} •{" "}
                                      {student.currentClass?.name ||
                                        "Belum ada kelas"}
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="ml-2">
                                    {student.gender === "MALE" ? "L" : "P"}
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.studentId && (
                    <p className="text-sm text-destructive">
                      {errors.studentId.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5" />
                  Jadwal Pelaksanaan
                </CardTitle>
                <CardDescription>
                  Tentukan tanggal dan waktu pelaksanaan muhadhoroh
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Date */}
                  <div className="space-y-2">
                    <Label>Tanggal *</Label>
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {selectedDate ? (
                            format(selectedDate, "EEEE, dd MMMM yyyy", {
                              locale: localeId,
                            })
                          ) : (
                            <span className="text-muted-foreground">
                              Pilih tanggal
                            </span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => {
                            if (date) {
                              setValue("scheduledAt", date);
                              setDateOpen(false);
                            }
                          }}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          autoFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {errors.scheduledAt && (
                      <p className="text-sm text-destructive">
                        {errors.scheduledAt.message}
                      </p>
                    )}
                  </div>

                  {/* Time */}
                  <div className="space-y-2">
                    <Label htmlFor="time">Waktu *</Label>
                    <Select
                      value={selectedTime}
                      onValueChange={setSelectedTime}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih waktu" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Morning slots */}
                        <SelectItem value="05:00">
                          05:00 - Ba'da Subuh
                        </SelectItem>
                        <SelectItem value="06:00">06:00</SelectItem>
                        <SelectItem value="07:00">07:00</SelectItem>
                        <SelectItem value="08:00">08:00</SelectItem>
                        <SelectItem value="09:00">09:00</SelectItem>
                        <SelectItem value="10:00">10:00</SelectItem>
                        <SelectItem value="11:00">11:00</SelectItem>
                        {/* Afternoon slots */}
                        <SelectItem value="13:00">
                          13:00 - Ba'da Dzuhur
                        </SelectItem>
                        <SelectItem value="14:00">14:00</SelectItem>
                        <SelectItem value="15:00">15:00</SelectItem>
                        <SelectItem value="16:00">
                          16:00 - Ba'da Ashar
                        </SelectItem>
                        {/* Evening slots */}
                        <SelectItem value="18:30">
                          18:30 - Ba'da Maghrib
                        </SelectItem>
                        <SelectItem value="19:30">
                          19:30 - Ba'da Isya
                        </SelectItem>
                        <SelectItem value="20:00">20:00</SelectItem>
                        <SelectItem value="21:00">21:00</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Topic & Language */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  Materi Muhadhoroh
                </CardTitle>
                <CardDescription>
                  Tentukan topik dan bahasa yang akan digunakan
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Language */}
                <div className="space-y-2">
                  <Label>Bahasa *</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <Button
                        key={lang.value}
                        type="button"
                        variant={
                          selectedLanguage === lang.value
                            ? "default"
                            : "outline"
                        }
                        className="h-auto py-3 flex flex-col gap-1"
                        onClick={() =>
                          setValue(
                            "language",
                            lang.value as "Indonesian" | "Arabic" | "English",
                          )
                        }
                      >
                        <span className="text-xl">{lang.flag}</span>
                        <span className="text-xs">{lang.label}</span>
                      </Button>
                    ))}
                  </div>
                  {errors.language && (
                    <p className="text-sm text-destructive">
                      {errors.language.message}
                    </p>
                  )}
                </div>

                {/* Topic */}
                <div className="space-y-2">
                  <Label htmlFor="topic">Topik / Judul Pidato *</Label>
                  <Textarea
                    id="topic"
                    placeholder="Masukkan topik pidato..."
                    {...register("topic")}
                    className="min-h-20"
                  />
                  {errors.topic && (
                    <p className="text-sm text-destructive">
                      {errors.topic.message}
                    </p>
                  )}
                </div>

                {/* Topic Suggestions */}
                {selectedLanguage && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">
                      Saran Topik:
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {TOPIC_SUGGESTIONS[
                        selectedLanguage as keyof typeof TOPIC_SUGGESTIONS
                      ].map((topic) => (
                        <Badge
                          key={topic}
                          variant="outline"
                          className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                          onClick={() => setValue("topic", topic)}
                        >
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Summary */}
          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mic2 className="h-5 w-5 text-primary" />
                  Ringkasan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Student Info */}
                <div>
                  <p className="text-sm text-muted-foreground">Santri</p>
                  <p className="font-medium">{selectedStudent?.name || "-"}</p>
                  {selectedStudent && (
                    <p className="text-sm text-muted-foreground">
                      {selectedStudent.nis} •{" "}
                      {selectedStudent.currentClass?.name || "-"}
                    </p>
                  )}
                </div>

                <Separator />

                {/* Schedule */}
                <div>
                  <p className="text-sm text-muted-foreground">Jadwal</p>
                  <p className="font-medium">
                    {selectedDate
                      ? format(selectedDate, "EEEE, dd MMMM yyyy", {
                          locale: localeId,
                        })
                      : "-"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Pukul {selectedTime}
                  </p>
                </div>

                <Separator />

                {/* Language */}
                <div>
                  <p className="text-sm text-muted-foreground">Bahasa</p>
                  <p className="font-medium">
                    {LANGUAGE_OPTIONS.find((l) => l.value === selectedLanguage)
                      ?.label || "-"}
                  </p>
                </div>

                <Separator />

                {/* Topic Preview */}
                <div>
                  <p className="text-sm text-muted-foreground">Topik</p>
                  <p className="font-medium line-clamp-3">
                    {watch("topic") || "-"}
                  </p>
                </div>

                <Separator />

                {/* Actions */}
                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || createMuhadhoroh.isPending}
                  >
                    {isSubmitting || createMuhadhoroh.isPending ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Simpan Jadwal
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => router.back()}
                  >
                    Batal
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tips Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">💡 Tips Muhadhoroh</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Persiapkan materi minimal 3 hari sebelumnya</li>
                  <li>• Durasi ideal: 5-7 menit untuk pemula</li>
                  <li>• Latih di depan cermin sebelum tampil</li>
                  <li>• Buat outline/kerangka pidato</li>
                  <li>• Gunakan bahasa yang sederhana dan jelas</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </MainLayout>
  );
}
