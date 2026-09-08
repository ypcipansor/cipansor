"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Switch } from "@/components/ui/switch";
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
import { useUnits } from "@/hooks/use-units";
import { useCreateAcademicYear } from "@/hooks/use-academic-years";
import { cn } from "@/lib/utils";

const academicYearSchema = z
  .object({
    name: z.string().min(1, "Nama tahun ajaran wajib diisi"),
    unitId: z.string().min(1, "Unit wajib dipilih"),
    startDate: z.date({ error: "Tanggal mulai wajib diisi" }),
    endDate: z.date({ error: "Tanggal selesai wajib diisi" }),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate <= data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tanggal selesai harus setelah tanggal mulai",
        path: ["endDate"],
      });
    }
  });

type AcademicYearFormData = z.infer<typeof academicYearSchema>;

export default function NewAcademicYearPage() {
  const router = useRouter();
  const createAcademicYear = useCreateAcademicYear();

  const { data: units, isLoading: unitsLoading } = useUnits();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AcademicYearFormData>({
    resolver: zodResolver(academicYearSchema),
    defaultValues: {
      isActive: false,
    },
  });

  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const isActive = watch("isActive");

  const onSubmit = async (data: AcademicYearFormData) => {
    try {
      await createAcademicYear.mutateAsync({
        name: data.name,
        unitId: data.unitId,
        startDate: format(data.startDate, "yyyy-MM-dd"),
        endDate: format(data.endDate, "yyyy-MM-dd"),
        isActive: data.isActive,
      });
      toast.success("Tahun ajaran berhasil dibuat");
      router.push("/academic-years");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal membuat tahun ajaran";
      toast.error(errorMessage);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/academic-years">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Tambah Tahun Ajaran
            </h1>
            <p className="text-muted-foreground">Buat tahun ajaran baru</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Informasi Tahun Ajaran</CardTitle>
              <CardDescription>
                Data tahun ajaran untuk unit pendidikan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Tahun Ajaran *</Label>
                <Input
                  id="name"
                  placeholder="Contoh: 2024/2025"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="unitId">Unit Pendidikan *</Label>
                <Select
                  onValueChange={(value) => setValue("unitId", value)}
                  disabled={unitsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units?.map((unit) => (
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tanggal Mulai *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate
                          ? format(startDate, "d MMMM yyyy", {
                              locale: localeId,
                            })
                          : "Pilih tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => date && setValue("startDate", date)}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.startDate && (
                    <p className="text-sm text-destructive">
                      {errors.startDate.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Tanggal Selesai *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate
                          ? format(endDate, "d MMMM yyyy", { locale: localeId })
                          : "Pilih tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(date) => date && setValue("endDate", date)}
                        disabled={(date) =>
                          startDate ? date <= startDate : false
                        }
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.endDate && (
                    <p className="text-sm text-destructive">
                      {errors.endDate.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="isActive" className="text-base">
                    Aktifkan Tahun Ajaran
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Mengaktifkan akan menonaktifkan tahun ajaran lain di unit
                    yang sama
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={(checked) => setValue("isActive", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" asChild>
              <Link href="/academic-years">Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createAcademicYear.isPending}
            >
              {isSubmitting || createAcademicYear.isPending
                ? "Menyimpan..."
                : "Simpan"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
