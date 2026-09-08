"use client";

import { useParams, useRouter } from "next/navigation";
import { authFileUrl } from "@/lib/files";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useTKAssessment,
  useUpdateTKAssessment,
  useTKIndicators,
  TKAspect,
  TKAchievementLevel,
  ASPECT_LABELS,
  ACHIEVEMENT_LABELS,
  useDeleteEvidence,
  useAddEvidence,
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
import {
  CalendarIcon,
  Save,
  ArrowLeft,
  Loader2,
  ImagePlus,
  X,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const formSchema = z.object({
  studentId: z.string().min(1, "Pilih siswa"),
  academicYearId: z.string().min(1, "Pilih tahun ajaran"),
  semester: z.enum(["GANJIL", "GENAP"]),
  aspect: z.enum(["NAM", "FM", "KOG", "BHS", "SE", "SNI"], {
    required_error: "Pilih aspek perkembangan",
  }),
  indicatorId: z.string().optional(),
  periodType: z.enum(["HARIAN", "MINGGUAN", "BULANAN", "SEMESTER"], {
    required_error: "Pilih tipe periode",
  }),
  periodDate: z.date({ required_error: "Pilih tanggal penilaian" }),
  achievementLevel: z.enum(["BB", "MB", "BSH", "BSB"], {
    required_error: "Pilih tingkat capaian",
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

export default function EditTKAssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuthStore();

  const { data: assessment, isLoading: loadingAssessment } =
    useTKAssessment(id);
  const { data: students, isLoading: loadingStudents } = useStudents({
    unitId: user?.unitId,
    status: "ACTIVE",
    limit: 100,
  });
  const { data: academicYears } = useAcademicYears();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      periodType: "HARIAN",
      periodDate: new Date(),
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
  const [existingEvidences, setExistingEvidences] = useState<any[]>([]);

  const updateMutation = useUpdateTKAssessment();
  const addEvidenceMutation = useAddEvidence();
  const deleteEvidenceMutation = useDeleteEvidence();

  useEffect(() => {
    if (assessment) {
      form.reset({
        studentId: assessment.studentId,
        academicYearId: assessment.academicYearId,
        semester: assessment.semester as "GANJIL" | "GENAP",
        aspect: assessment.aspect,
        indicatorId: assessment.indicatorId || undefined,
        periodType: assessment.periodType,
        periodDate: new Date(assessment.periodDate),
        achievementLevel: assessment.achievementLevel,
        narrativeText: assessment.narrativeText || "",
        teacherNotes: assessment.teacherNotes || "",
        recommendations: assessment.recommendations || "",
      });
      setExistingEvidences(assessment.evidences || []);
    }
  }, [assessment, form]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);

      const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
      setPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeNewFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const deleteExistingEvidence = async (evidenceId: string) => {
    try {
      await deleteEvidenceMutation.mutateAsync(evidenceId);
      setExistingEvidences((prev) => prev.filter((e) => e.id !== evidenceId));
      toast.success("Bukti berhasil dihapus");
    } catch {
      toast.error("Gagal menghapus bukti");
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          ...values,
          periodDate: format(values.periodDate, "yyyy-MM-dd"),
        },
      });

      // Upload new evidence if any
      if (files.length > 0) {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append(
            "fileType",
            file.type.startsWith("image/") ? "IMAGE" : "VIDEO",
          );
          await addEvidenceMutation.mutateAsync({
            assessmentId: id,
            data: formData,
          });
        }
      }

      toast.success("Penilaian berhasil diperbarui");
      router.push("/paud/assessment");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Gagal memperbarui penilaian";
      toast.error(message);
    }
  };

  const nextStep = async () => {
    let fieldsToValidate: (keyof FormValues)[] = [];
    if (step === 1)
      fieldsToValidate = [
        "studentId",
        "academicYearId",
        "periodType",
        "periodDate",
      ];
    if (step === 2) fieldsToValidate = ["aspect", "achievementLevel"];
    if (step === 3)
      fieldsToValidate = [
        "indicatorId",
        "narrativeText",
        "teacherNotes",
        "recommendations",
      ];

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) setStep((prev) => prev + 1);
  };

  const prevStep = () => setStep((prev) => prev - 1);

  if (loadingAssessment) {
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
          title="Edit Penilaian TK Qur'an"
          description="Perbarui data perkembangan anak"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        <div className="max-w-4xl mx-auto space-y-4">
          <Progress value={(step / 4) * 100} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
            <span>Siswa & Periode</span>
            <span>Aspek & Capaian</span>
            <span>Detail & Narasi</span>
            <span>Bukti & Review</span>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 max-w-4xl mx-auto"
          >
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Langkah 1: Informasi Siswa & Periode</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="studentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Siswa *</FormLabel>
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
                            {loadingStudents ? (
                              <div className="p-2 text-center text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                Memuat...
                              </div>
                            ) : (
                              students?.data?.map((student) => (
                                <SelectItem key={student.id} value={student.id}>
                                  {student.name} ({student.nisn})
                                </SelectItem>
                              ))
                            )}
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
                        <FormLabel>Tahun Ajaran *</FormLabel>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="periodType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipe Periode *</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih tipe" />
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
                        <FormItem>
                          <FormLabel>Tanggal *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground",
                                  )}
                                >
                                  {field.value
                                    ? format(field.value, "dd/MM/yyyy", {
                                        locale: idLocale,
                                      })
                                    : "Pilih tanggal"}
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
                                disabled={(date) => date > new Date()}
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
                  <CardTitle>Langkah 2: Aspek & Tingkat Capaian</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="aspect"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aspek Perkembangan *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih aspek" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(ASPECT_LABELS).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {value} - {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="achievementLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tingkat Capaian *</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="grid grid-cols-2 md:grid-cols-4 gap-4"
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
                                    "flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent transition-all cursor-pointer h-full",
                                    option.color,
                                  )}
                                >
                                  <span className="text-2xl font-bold">
                                    {option.value}
                                  </span>
                                  <span className="text-[10px] text-center font-medium uppercase mt-2">
                                    {option.label}
                                  </span>
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
                              placeholder="Catatan tambahan..."
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
                          <FormLabel>Rekomendasi</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Saran tindak lanjut..."
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
                  <CardContent className="space-y-6">
                    {/* Existing Evidence */}
                    {existingEvidences.length > 0 && (
                      <div className="space-y-3">
                        <FormLabel>Bukti yang Sudah Ada</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {existingEvidences.map((evidence) => (
                            <div
                              key={evidence.id}
                              className="relative aspect-square rounded-md overflow-hidden border group"
                            >
                              <img
                                src={authFileUrl(evidence.fileUrl)}
                                alt="Evidence"
                                className="object-cover w-full h-full"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  deleteExistingEvidence(evidence.id)
                                }
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                disabled={deleteEvidenceMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* New Evidence Upload */}
                    <div className="space-y-3">
                      <FormLabel>Tambah Bukti Baru</FormLabel>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {previews.map((preview, index) => (
                          <div
                            key={index}
                            className="relative aspect-square rounded-md overflow-hidden border"
                          >
                            <img
                              src={preview}
                              alt={`Preview ${index}`}
                              className="object-cover w-full h-full"
                            />
                            <button
                              type="button"
                              onClick={() => removeNewFile(index)}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <label className="flex flex-col items-center justify-center aspect-square rounded-md border-2 border-dashed border-muted-foreground/25 hover:border-primary hover:bg-accent/50 cursor-pointer transition-all">
                          <ImagePlus className="h-8 w-8 text-muted-foreground" />
                          <span className="text-[10px] mt-2 font-medium">
                            Tambah Foto
                          </span>
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="p-4 bg-accent/30 rounded-lg border space-y-4">
                      <h4 className="text-sm font-semibold flex items-center text-primary">
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Ringkasan Perubahan
                      </h4>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
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
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

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
                      updateMutation.isPending || addEvidenceMutation.isPending
                    }
                  >
                    {updateMutation.isPending ||
                    addEvidenceMutation.isPending ? (
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
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
    </MainLayout>
  );
}
