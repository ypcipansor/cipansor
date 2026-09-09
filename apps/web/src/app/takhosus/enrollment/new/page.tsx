"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ArrowLeft, CalendarIcon } from "lucide-react";
import Link from "next/link";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCreateEnrollment, useHalaqohs } from "@/hooks/use-takhosus";
import { useStudents } from "@/hooks/use-students";
import { cn } from "@/lib/utils";

const enrollmentFormSchema = z.object({
  studentId: z.string().min(1, "Santri wajib dipilih"),
  halaqohId: z.string().min(1, "Halaqoh wajib dipilih"),
  targetJuz: z.coerce
    .number()
    .min(1, "Target minimal 1 juz")
    .max(30, "Target maksimal 30 juz"),
  currentJuz: z.coerce
    .number()
    .min(0, "Juz saat ini minimal 0")
    .max(30, "Juz saat ini maksimal 30"),
  targetCompletionDate: z.date().optional(),
  notes: z.string().optional(),
});

type EnrollmentFormValues = z.infer<typeof enrollmentFormSchema>;

export default function NewEnrollmentPage() {
  const router = useRouter();
  const createEnrollment = useCreateEnrollment();

  const { data: halaqohData } = useHalaqohs({ isActive: true, limit: 100 });
  const { data: studentsData } = useStudents({ limit: 100 });

  const halaqohs = halaqohData?.data || [];
  const students = studentsData?.data || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EnrollmentFormValues>({
    resolver: zodResolver(enrollmentFormSchema),
    defaultValues: {
      studentId: "",
      halaqohId: "",
      targetJuz: 30,
      currentJuz: 0,
      notes: "",
    },
  });

  const targetCompletionDate = watch("targetCompletionDate");

  const onSubmit = async (data: EnrollmentFormValues) => {
    try {
      await createEnrollment.mutateAsync({
        ...data,
        targetCompletionDate: data.targetCompletionDate
          ? format(data.targetCompletionDate, "yyyy-MM-dd")
          : undefined,
      });
      toast.success("Santri berhasil didaftarkan ke program takhosus");
      router.push("/takhosus");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal mendaftarkan santri";
      toast.error(errorMessage);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/takhosus">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Daftarkan Santri ke Takhosus
            </h1>
            <p className="text-muted-foreground">
              Daftarkan santri ke program tahfidz intensif
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Pendaftaran</CardTitle>
              <CardDescription>
                Data pendaftaran santri ke program takhosus
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="studentId">Santri *</Label>
                <Select onValueChange={(value) => setValue("studentId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih santri" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name} - {student.nis}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Pilih santri yang akan didaftarkan ke program takhosus
                </p>
                {errors.studentId && (
                  <p className="text-sm text-destructive">
                    {errors.studentId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="halaqohId">Halaqoh *</Label>
                <Select onValueChange={(value) => setValue("halaqohId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih halaqoh" />
                  </SelectTrigger>
                  <SelectContent>
                    {halaqohs.map((halaqoh) => (
                      <SelectItem key={halaqoh.id} value={halaqoh.id}>
                        {halaqoh.code} - {halaqoh.name} ({halaqoh.teacher?.name}
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Pilih kelompok halaqoh untuk santri
                </p>
                {errors.halaqohId && (
                  <p className="text-sm text-destructive">
                    {errors.halaqohId.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentJuz">Juz Saat Ini *</Label>
                  <Input
                    type="number"
                    id="currentJuz"
                    min={0}
                    max={30}
                    {...register("currentJuz")}
                  />
                  <p className="text-sm text-muted-foreground">
                    Jumlah juz yang sudah dihafal santri
                  </p>
                  {errors.currentJuz && (
                    <p className="text-sm text-destructive">
                      {errors.currentJuz.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetJuz">Target Juz *</Label>
                  <Input
                    type="number"
                    id="targetJuz"
                    min={1}
                    max={30}
                    {...register("targetJuz")}
                  />
                  <p className="text-sm text-muted-foreground">
                    Target jumlah juz yang akan dihafal
                  </p>
                  {errors.targetJuz && (
                    <p className="text-sm text-destructive">
                      {errors.targetJuz.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Selesai</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full md:w-[280px] justify-start text-left font-normal",
                        !targetCompletionDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {targetCompletionDate
                        ? format(targetCompletionDate, "d MMMM yyyy", {
                            locale: localeId,
                          })
                        : "Pilih tanggal target"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={targetCompletionDate}
                      onSelect={(date) =>
                        date && setValue("targetCompletionDate", date)
                      }
                      disabled={(date) => date < new Date()}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-sm text-muted-foreground">
                  Tanggal target penyelesaian hafalan (opsional)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Catatan</Label>
                <Textarea
                  id="notes"
                  placeholder="Catatan tambahan..."
                  className="resize-none"
                  {...register("notes")}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/takhosus">Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createEnrollment.isPending}
            >
              {isSubmitting || createEnrollment.isPending
                ? "Menyimpan..."
                : "Daftarkan Santri"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
