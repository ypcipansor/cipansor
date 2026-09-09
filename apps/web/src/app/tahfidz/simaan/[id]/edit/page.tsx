"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useSimaanExam, useUpdateSimaan } from "@/hooks/use-simaan";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BookOpen,
  CalendarIcon,
  Save,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const formSchema = z.object({
  examDate: z.date({
    error: "Tanggal ujian wajib diisi",
  }),
  examType: z.enum(["JUZ_30", "JUZ_PILIHAN", "FULL_QURAN", "CUSTOM"], {
    error: "Tipe ujian wajib dipilih",
  }),
  startSurah: z.string().optional(),
  startAyat: z.coerce.number().min(1).optional(),
  endSurah: z.string().optional(),
  endAyat: z.coerce.number().min(1).optional(),
  totalJuz: z.coerce.number().min(1).max(30).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  status: z
    .enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function EditSimaanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();

  const { data: exam, isLoading, error } = useSimaanExam(resolvedParams.id);
  const updateMutation = useUpdateSimaan();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      examType: "JUZ_30",
      startAyat: 1,
    },
  });

  const selectedType = form.watch("examType");

  // Populate form when data is loaded
  useEffect(() => {
    if (exam) {
      form.reset({
        examDate: new Date(exam.examDate),
        examType: exam.simaanType as any,
        startSurah: "", // Placeholder
        startAyat: 1, // Placeholder
        endSurah: "", // Placeholder
        endAyat: 1, // Placeholder
        totalJuz: exam.juzEnd - exam.juzStart + 1, // Approximate
        location: "", // Placeholder
        notes: exam.notes || "",
        status: "SCHEDULED", // Default
      });
    }
  }, [exam, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        id: resolvedParams.id,
        data: {
          examDate: data.examDate.toISOString(),
          simaanType: data.examType as any, // Map to correct enum value
          // startSurah, etc. might not be in the update type directly if they are virtual or mapped
          juzStart: 1, // Placeholder
          juzEnd: (data.totalJuz || 1), // Placeholder
          notes: data.notes,
          // status is not typically updated here directly unless exposed in UpdateSimaanData
        },
      });
      toast.success("Data ujian simaan berhasil diperbarui");
      router.push(`/tahfidz/simaan/${resolvedParams.id}`);
    } catch {
      toast.error("Gagal memperbarui data ujian simaan");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96" />
        </div>
      </MainLayout>
    );
  }

  if (error || !exam) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-4 text-lg font-semibold">Data Tidak Ditemukan</h2>
          <p className="text-muted-foreground">
            Data ujian simaan tidak ditemukan
          </p>
          <Button
            className="mt-4"
            onClick={() => router.push("/tahfidz/simaan")}
          >
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  // Check if editable
  // Use passed boolean as proxy or assume editable
  if (exam.passed) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500" />
          <h2 className="mt-4 text-lg font-semibold">Tidak Dapat Diedit</h2>
          <p className="text-muted-foreground">
            Ujian simaan yang sudah selesai atau dibatalkan tidak dapat diedit
          </p>
          <Button
            className="mt-4"
            onClick={() => router.push(`/tahfidz/simaan/${resolvedParams.id}`)}
          >
            Kembali ke Detail
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/tahfidz/simaan/${resolvedParams.id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader
            title="Edit Ujian Simaan"
            description={`Santri: ${exam.student?.user?.name || "N/A"}`}
            icon={BookOpen}
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Ujian</CardTitle>
                <CardDescription>Perbarui data ujian simaan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Exam Date */}
                  <FormField
                    control={form.control}
                    name="examDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Tanggal Ujian *</FormLabel>
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
                                {field.value ? (
                                  format(field.value, "EEEE, dd MMMM yyyy", {
                                    locale: id,
                                  })
                                ) : (
                                  <span>Pilih tanggal</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              autoFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Exam Type */}
                  <FormField
                    control={form.control}
                    name="examType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipe Ujian *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tipe ujian" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="JUZ_30">
                              Juz 30 (Juz &apos;Amma)
                            </SelectItem>
                            <SelectItem value="JUZ_PILIHAN">
                              Juz Pilihan
                            </SelectItem>
                            <SelectItem value="FULL_QURAN">
                              30 Juz (Full Quran)
                            </SelectItem>
                            <SelectItem value="CUSTOM">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Status */}
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="SCHEDULED">Terjadwal</SelectItem>
                            <SelectItem value="IN_PROGRESS">
                              Sedang Berlangsung
                            </SelectItem>
                            <SelectItem value="CANCELLED">
                              Dibatalkan
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Location */}
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lokasi</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: Masjid Al-Hikmah"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Conditional Fields based on exam type */}
                {(selectedType === "JUZ_PILIHAN" ||
                  selectedType === "CUSTOM") && (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <FormField
                      control={form.control}
                      name="startSurah"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Surah Mulai</FormLabel>
                          <FormControl>
                            <Input placeholder="Al-Fatihah" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="startAyat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ayat Mulai</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endSurah"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Surah Akhir</FormLabel>
                          <FormControl>
                            <Input placeholder="An-Nas" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endAyat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ayat Akhir</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {selectedType === "JUZ_PILIHAN" && (
                  <FormField
                    control={form.control}
                    name="totalJuz"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Juz</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={30} {...field} />
                        </FormControl>
                        <FormDescription>
                          Jumlah juz yang akan diujikan
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catatan</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Catatan tambahan tentang ujian simaan..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(`/tahfidz/simaan/${resolvedParams.id}`)
                }
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
