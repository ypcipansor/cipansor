"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useCreateTKAssessment,
  useTKIndicators,
  TKAspect,
  TKAchievementLevel,
  ASPECT_LABELS,
  ACHIEVEMENT_LABELS,
} from "@/hooks/use-tk-assessment";
import { useStudents } from "@/hooks/use-students";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useAddEvidence } from "@/hooks/use-tk-assessment";
import {
  ImagePlus,
  X,
  CheckCircle2,
  Star,
  Activity,
  Lightbulb,
  MessageCircle,
  HeartHandshake,
  Palette,
  FileText,
} from "lucide-react";

const formSchema = z.object({
  studentId: z.string().min(1, "Pilih siswa"),
  academicYearId: z.string().min(1, "Pilih tahun ajaran"),
  semester: z.enum(["GANJIL", "GENAP"]),
  aspect: z.enum(["NAM", "FM", "KOG", "BHS", "SE", "SNI"], {
    error: "Pilih aspek perkembangan",
  }),
  indicatorId: z.string().optional(),
  periodType: z.enum(["HARIAN", "MINGGUAN", "BULANAN", "SEMESTER"], {
    error: "Pilih tipe periode",
  }),
  periodDate: z.date({ error: "Pilih tanggal penilaian" }),
  achievementLevel: z.enum(["BB", "MB", "BSH", "BSB"], {
    error: "Pilih tingkat capaian",
  }),
  narrativeText: z.string().max(2000).optional(),
  teacherNotes: z.string().max(1000).optional(),
  recommendations: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const PERIOD_TYPES = [
  { value: "HARIAN", label: "Harian", description: "Penilaian harian" },
  { value: "MINGGUAN", label: "Mingguan", description: "Penilaian mingguan" },
  { value: "BULANAN", label: "Bulanan", description: "Penilaian bulanan" },
  { value: "SEMESTER", label: "Semester", description: "Penilaian semester" },
];

const ACHIEVEMENT_OPTIONS = [
  {
    value: "BB",
    label: "BB",
    description: "Belum Berkembang",
    color: "border-red-500",
  },
  {
    value: "MB",
    label: "MB",
    description: "Mulai Berkembang",
    color: "border-yellow-500",
  },
  {
    value: "BSH",
    label: "BSH",
    description: "Berkembang Sesuai Harapan",
    color: "border-blue-500",
  },
  {
    value: "BSB",
    label: "BSB",
    description: "Berkembang Sangat Baik",
    color: "border-green-500",
  },
];

export default function CreateTKAssessmentPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const { data: students, isLoading: loadingStudents } = useStudents({
    unitId: user?.unitId,
    status: "ACTIVE",
    limit: 100,
  });

  const { data: academicYears, isLoading: loadingYears } = useAcademicYears();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      periodType: "HARIAN",
      periodDate: new Date(),
      semester: "GANJIL",
    },
  });

  const selectedAspect = form.watch("aspect") as TKAspect | undefined;
  const { data: indicators } = useTKIndicators({
    aspect: selectedAspect,
    isActive: true,
  });

  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const createMutation = useCreateTKAssessment();
  const addEvidenceMutation = useAddEvidence();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);

      const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
      setPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await createMutation.mutateAsync({
        ...values,
        periodDate: format(values.periodDate, "yyyy-MM-dd"),
      });

      // Upload evidences if any
      if (files.length > 0) {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          // Use uppercase for fileType to match potential DB constraints/Enums
          formData.append(
            "fileType",
            file.type.startsWith("image") ? "IMAGE" : "VIDEO",
          );
          await addEvidenceMutation.mutateAsync({
            assessmentId: result.id,
            data: formData,
          });
        }
      }

      toast.success("Penilaian berhasil disimpan");
      router.push("/paud/assessment");
    } catch (error) {
      toast.error("Gagal menyimpan penilaian");
    }
  };

  const nextStep = async () => {
    const fields = [
      ["studentId", "academicYearId", "periodType", "periodDate", "semester"],
      ["aspect", "achievementLevel"],
      ["narrativeText", "teacherNotes", "recommendations"],
      [],
    ][step - 1];

    const isValid = await form.trigger(fields as any);
    if (isValid) setStep((s) => s + 1);
  };

  const prevStep = () => setStep((s) => s - 1);

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="Tambah Penilaian Baru"
          description="Isi form untuk mencatat perkembangan anak"
          backHref="/paud/assessment"
        />

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={(step / 4) * 100} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span className={step >= 1 ? "text-primary font-medium" : ""}>
              1. Data Dasar
            </span>
            <span className={step >= 2 ? "text-primary font-medium" : ""}>
              2. Capaian
            </span>
            <span className={step >= 3 ? "text-primary font-medium" : ""}>
              3. Narasi
            </span>
            <span className={step >= 4 ? "text-primary font-medium" : ""}>
              4. Bukti
            </span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Langkah 1: Identitas & Waktu</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="studentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pilih Siswa</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih siswa" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {students?.data?.map((student) => (
                                <SelectItem key={student.id} value={student.id}>
                                  {student.name} ({student.nisn})
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
                                  {year.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="periodType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jenis Periode</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih periode" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PERIOD_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
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
                      name="periodDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Tanggal Penilaian</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground",
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP", {
                                      locale: idLocale,
                                    })
                                  ) : (
                                    <span>Pilih tanggal</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date > new Date() ||
                                  date < new Date("1900-01-01")
                                }
                                autoFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="semester"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Semester *</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih semester" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="GANJIL">
                                Semester 1 (Ganjil)
                              </SelectItem>
                              <SelectItem value="GENAP">
                                Semester 2 (Genap)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Langkah 2: Aspek & Capaian</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  <FormField
                    control={form.control}
                    name="aspect"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Aspek Perkembangan</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid grid-cols-2 md:grid-cols-3 gap-4"
                          >
                            {Object.entries(ASPECT_LABELS).map(
                              ([value, label]) => {
                                // Dynamic icon selection based on aspect
                                let Icon = FileText; // Default
                                if (value === "NAM") Icon = Star;
                                if (value === "FM") Icon = Activity; // or PersonStanding if available
                                if (value === "KOG") Icon = Lightbulb;
                                if (value === "BHS") Icon = MessageCircle;
                                if (value === "SE") Icon = HeartHandshake;
                                if (value === "SNI") Icon = Palette;

                                return (
                                  <div key={value}>
                                    <RadioGroupItem
                                      value={value}
                                      id={`aspect-${value}`}
                                      className="peer sr-only"
                                    />
                                    <label
                                      htmlFor={`aspect-${value}`}
                                      className={cn(
                                        "flex flex-col items-center justify-center rounded-xl border-2 border-muted bg-card p-4 hover:bg-accent/50 hover:border-primary/50 transition-all cursor-pointer h-full gap-3 text-center peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary shadow-sm hover:shadow-md",
                                        field.value === value &&
                                          "ring-2 ring-primary ring-offset-2",
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "p-2 rounded-full bg-muted peer-data-[state=checked]:bg-primary/20",
                                          field.value === value &&
                                            "bg-primary/20",
                                        )}
                                      >
                                        <Icon className="h-6 w-6" />
                                      </div>
                                      <span className="text-sm font-semibold">
                                        {label}
                                      </span>
                                    </label>
                                  </div>
                                );
                              },
                            )}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="achievementLevel"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Tingkat Capaian</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                          >
                            {ACHIEVEMENT_OPTIONS.map((option) => (
                              <div key={option.value}>
                                <RadioGroupItem
                                  value={option.value}
                                  id={option.value}
                                  className="peer sr-only"
                                />
                                <label
                                  htmlFor={option.value}
                                  className={cn(
                                    "flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-card p-4 hover:scale-[1.02] transition-all cursor-pointer h-full relative overflow-hidden group shadow-sm hover:shadow-md",
                                    "peer-data-[state=checked]:border-primary peer-data-[state=checked]:shadow-lg",
                                    field.value === option.value &&
                                      option.color.replace(
                                        "border-",
                                        "border-",
                                      ) + " bg-accent/20",
                                  )}
                                >
                                  {/* Color Indicator Strip */}
                                  <div
                                    className={cn(
                                      "absolute top-0 left-0 w-full h-1.5",
                                      option.color.replace("border-", "bg-"),
                                    )}
                                  />

                                  <div className="mt-2 text-3xl font-bold tracking-tight">
                                    {option.value}
                                  </div>
                                  <div className="text-xs font-semibold uppercase text-muted-foreground mt-1 text-center">
                                    {option.label}
                                  </div>
                                  <p className="text-[10px] text-center text-muted-foreground leading-tight mt-3 px-2">
                                    {option.description}
                                  </p>

                                  {/* Checkmark for active state */}
                                  {field.value === option.value && (
                                    <div className="absolute top-2 right-2 text-primary animate-in zoom-in duration-300">
                                      <CheckCircle2 className="w-4 h-4" />
                                    </div>
                                  )}
                                </label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Langkah 3: Detail & Narasi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedAspect && indicators && indicators.length > 0 && (
                    <FormField
                      control={form.control}
                      name="indicatorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Indikator (Opsional)</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih indikator" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {indicators.map((indicator) => (
                                <SelectItem
                                  key={indicator.id}
                                  value={indicator.id}
                                >
                                  {indicator.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="narrativeText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Narasi Deskriptif</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Jelaskan secara mendetail perkembangan atau kejadian yang diamati..."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="flex justify-between">
                          <span>
                            Focus on specific evidence or behavior observed.
                          </span>
                          <span>{field.value?.length || 0} / 2000</span>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="teacherNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Catatan Internal Guru</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Catatan tambahan untuk evaluasi internal..."
                              className="min-h-[80px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="recommendations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rekomendasi / Tindak Lanjut</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Saran untuk orang tua atau langkah stimulasi selanjutnya..."
                              className="min-h-[80px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Langkah 4: Bukti & Review Akhir</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <FormLabel>Unggah Foto/Video Bukti</FormLabel>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {previews.map((preview, index) => (
                          <div
                            key={index}
                            className="relative aspect-square rounded-md overflow-hidden border"
                          >
                            <img
                              src={preview}
                              alt={`Evidence ${index}`}
                              className="object-cover w-full h-full"
                            />
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <label className="flex flex-col items-center justify-center aspect-square rounded-md border-2 border-dashed border-muted-foreground/25 hover:border-primary hover:bg-accent/50 cursor-pointer transition-all">
                          <ImagePlus className="h-8 w-8 text-muted-foreground" />
                          <span className="text-[10px] mt-2 font-medium">
                            Tambah Bukti
                          </span>
                          <input
                            type="file"
                            multiple
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                      <p className="text-[11px] text-muted-foreground italic">
                        * Unggah foto atau video yang menunjukkan aktivitas
                        terkait capaian ini.
                      </p>
                    </div>

                    <div className="mt-8 p-4 bg-accent/30 rounded-lg border space-y-4">
                      <h4 className="text-sm font-semibold flex items-center">
                        <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                        Ringkasan Penilaian
                      </h4>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-muted-foreground">Siswa:</span>
                        <span className="font-medium">
                          {
                            students?.data?.find(
                              (s) => s.id === form.getValues("studentId"),
                            )?.name
                          }
                        </span>
                        <span className="text-muted-foreground">Aspek:</span>
                        <span className="font-medium">
                          {ASPECT_LABELS[form.getValues("aspect")]}
                        </span>
                        <span className="text-muted-foreground">Capaian:</span>
                        <span className="font-medium">
                          {
                            ACHIEVEMENT_LABELS[
                              form.getValues("achievementLevel")
                            ]
                          }
                        </span>
                        <span className="text-muted-foreground">
                          Indikator:
                        </span>
                        <span className="font-medium">
                          {indicators?.find(
                            (i) => i.id === form.getValues("indicatorId"),
                          )?.name || "-"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center bg-background/80 backdrop-blur-sm p-4 border rounded-lg sticky bottom-4 z-10">
              <Button
                type="button"
                variant="ghost"
                onClick={step === 1 ? () => router.back() : prevStep}
              >
                {step === 1 ? "Batal" : "Kembali"}
              </Button>

              <div className="flex gap-3">
                {step < 4 ? (
                  <Button type="button" onClick={nextStep}>
                    Lanjut
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      createMutation.isPending || addEvidenceMutation.isPending
                    }
                  >
                    {createMutation.isPending ||
                    addEvidenceMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Selesaikan & Simpan
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
    </MainLayout>
  );
}
