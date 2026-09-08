"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useCreateSanad, useEnrollments } from "@/hooks/use-takhosus";
import { useTeachers } from "@/hooks/use-teachers";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BookOpen,
  CalendarIcon,
  Save,
  Loader2,
  User,
  GraduationCap,
} from "lucide-react";

const formSchema = z.object({
  enrollmentId: z.string().min(1, "Enrollment wajib dipilih"),
  teacherId: z.string().min(1, "Pensahih wajib dipilih"),
  juz: z.coerce.number().min(1, "Juz minimal 1").max(30, "Juz maksimal 30"),
  surahStart: z.coerce.number().min(1).max(114).optional(),
  surahEnd: z.coerce.number().min(1).max(114).optional(),
  certifiedAt: z.date({
    required_error: "Tanggal pengesahan wajib diisi",
  }),
  grade: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function NewSanadPage() {
  const router = useRouter();

  // Fetch enrollments from API
  const { data: enrollmentsData, isLoading: isLoadingEnrollments } =
    useEnrollments({
      limit: 100,
      status: "ACTIVE",
    });
  const { data: teachersData, isLoading: isLoadingTeachers } = useTeachers();
  const createMutation = useCreateSanad();

  // Get enrollments from API response
  const enrollments = enrollmentsData?.data || [];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      juz: 1,
      notes: "",
      certifiedAt: new Date(),
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync({
        enrollmentId: data.enrollmentId,
        teacherId: data.teacherId,
        juz: data.juz,
        surahStart: data.surahStart,
        surahEnd: data.surahEnd,
        certifiedAt: data.certifiedAt.toISOString(),
        grade: data.grade || "",
        notes: data.notes || "",
      });
      toast.success("Sanad hafidz berhasil ditambahkan");
      router.push("/tahfidz/sanad");
    } catch {
      toast.error("Gagal menambahkan sanad hafidz");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/tahfidz/sanad")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader
            title="Tambah Sanad"
            description="Catat pengesahan hafalan (sanad) santri"
            icon={BookOpen}
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Student/Enrollment Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Santri
                </CardTitle>
                <CardDescription>
                  Pilih santri yang hafalannya disahkan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="enrollmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Santri (Enrollment) *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                isLoadingEnrollments
                                  ? "Memuat..."
                                  : "Pilih santri"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingEnrollments ? (
                            <div className="p-2">
                              <Skeleton className="h-8 w-full" />
                            </div>
                          ) : enrollments.length === 0 ? (
                            <div className="p-2 text-center text-sm text-muted-foreground">
                              Tidak ada santri terdaftar
                            </div>
                          ) : (
                            enrollments.map((enrollment) => (
                              <SelectItem
                                key={enrollment.id}
                                value={enrollment.id}
                              >
                                {enrollment.student?.user?.name ||
                                  "Unknown"}{" "}
                                - {(enrollment.student as any)?.nisn || "—"}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Santri yang terdaftar di program Takhosus/Tahfidz
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Juz & Surah Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Detail Hafalan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Juz */}
                  <FormField
                    control={form.control}
                    name="juz"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Juz *</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v))}
                          value={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih juz" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from({ length: 30 }, (_, i) => i + 1).map(
                              (juz) => (
                                <SelectItem key={juz} value={String(juz)}>
                                  Juz {juz}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Surah Start */}
                  <FormField
                    control={form.control}
                    name="surahStart"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Surah Mulai</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={114}
                            placeholder="Nomor surah"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>Opsional (1-114)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Surah End */}
                  <FormField
                    control={form.control}
                    name="surahEnd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Surah Akhir</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={114}
                            placeholder="Nomor surah"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>Opsional (1-114)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Certification Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Pengesahan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Teacher */}
                  <FormField
                    control={form.control}
                    name="teacherId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pensahih (Musyrif/Syeikh) *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih pensahih" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingTeachers ? (
                              <SelectItem value="" disabled>
                                Memuat...
                              </SelectItem>
                            ) : (
                              teachersData?.data?.map((teacher: any) => (
                                <SelectItem key={teacher.id} value={teacher.id}>
                                  {teacher.user?.name || teacher.nip}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Certified Date */}
                  <FormField
                    control={form.control}
                    name="certifiedAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Tanggal Pengesahan *</FormLabel>
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
                              disabled={(date) => date > new Date()}
                              autoFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Grade */}
                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Predikat/Nilai</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih predikat" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Mumtaz">
                            Mumtaz (Istimewa)
                          </SelectItem>
                          <SelectItem value="Jayyid Jiddan">
                            Jayyid Jiddan (Sangat Baik)
                          </SelectItem>
                          <SelectItem value="Jayyid">Jayyid (Baik)</SelectItem>
                          <SelectItem value="Maqbul">Maqbul (Cukup)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Nilai berdasarkan kualitas bacaan dan hafalan
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catatan</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Catatan tambahan tentang pengesahan..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Catatan khusus dari pensahih (opsional)
                      </FormDescription>
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
                onClick={() => router.push("/tahfidz/sanad")}
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
                    Simpan Sanad
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
