"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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
import { useUnits } from "@/hooks/use-units";
import { useTeachers } from "@/hooks/use-teachers";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useCreateClass } from "@/hooks/use-classes";

const classSchema = z.object({
  name: z.string().min(1, "Nama kelas wajib diisi"),
  level: z.string().min(1, "Level wajib diisi"), // Maps to grade/level
  unitId: z.string().min(1, "Unit wajib dipilih"),
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
  homeroomTeacherId: z.string().optional(),
  capacity: z.coerce.number().min(1, "Kapasitas minimal 1").optional(),
});

type ClassFormData = z.infer<typeof classSchema>;

export default function NewClassPage() {
  const router = useRouter();
  const createClass = useCreateClass();

  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: teachers, isLoading: teachersLoading } = useTeachers();
  const { data: academicYearsData, isLoading: academicYearsLoading } =
    useAcademicYears();
  const academicYears = academicYearsData?.data || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ClassFormData>({
    resolver: zodResolver(classSchema),
  });

  const selectedUnitId = watch("unitId");

  const onSubmit = async (data: ClassFormData) => {
    try {
      await createClass.mutateAsync({
        ...data,
        homeroomTeacherId: data.homeroomTeacherId || undefined,
        capacity: data.capacity || 30, // Default fallback
      });
      toast.success("Kelas berhasil dibuat");
      router.push("/classes");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal membuat kelas";
      toast.error(errorMessage);
    }
  };

  // Academic years are global (no unit relation in the schema) — offer all
  const filteredAcademicYears = academicYears;

  // Filter teachers by selected unit
  const filteredTeachers = selectedUnitId
    ? (teachers as any)?.data?.filter((t: any) => t.unitId === selectedUnitId)
    : (teachers as any)?.data || [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/classes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Tambah Kelas Baru
            </h1>
            <p className="text-muted-foreground">
              Buat kelas baru untuk unit pendidikan
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Kelas</CardTitle>
                <CardDescription>Data dasar kelas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Kelas *</Label>
                  <Input
                    id="name"
                    placeholder="Contoh: Kelas 7A, X IPA 1"
                    {...register("name")}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="level">Tingkat *</Label>
                    <Input id="level" placeholder="7" {...register("level")} />
                    {errors.level && (
                      <p className="text-sm text-destructive">
                        {errors.level.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="capacity">Kapasitas Maksimal</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min={1}
                    placeholder="30"
                    {...register("capacity")}
                  />
                  {errors.capacity && (
                    <p className="text-sm text-destructive">
                      {errors.capacity.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Unit & Tahun Ajaran</CardTitle>
                <CardDescription>Penempatan kelas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="unitId">Unit Pendidikan *</Label>
                  <Select
                    onValueChange={(value) => {
                      setValue("unitId", value);
                      setValue("academicYearId", "");
                      setValue("homeroomTeacherId", "");
                    }}
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

                <div className="space-y-2">
                  <Label htmlFor="academicYearId">Tahun Ajaran *</Label>
                  <Select
                    onValueChange={(value) => setValue("academicYearId", value)}
                    disabled={academicYearsLoading || !selectedUnitId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !selectedUnitId
                            ? "Pilih unit terlebih dahulu"
                            : "Pilih tahun ajaran"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAcademicYears?.map((ay) => (
                        <SelectItem key={ay.id} value={ay.id}>
                          {ay.name} {ay.isActive && "(Aktif)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.academicYearId && (
                    <p className="text-sm text-destructive">
                      {errors.academicYearId.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="homeroomTeacherId">Wali Kelas</Label>
                  <Select
                    onValueChange={(value) =>
                      setValue("homeroomTeacherId", value)
                    }
                    disabled={teachersLoading || !selectedUnitId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !selectedUnitId
                            ? "Pilih unit terlebih dahulu"
                            : "Pilih wali kelas"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredTeachers?.map((teacher: any) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.user?.name ||
                            teacher.nip ||
                            "Unknown Teacher"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.homeroomTeacherId && (
                    <p className="text-sm text-destructive">
                      {errors.homeroomTeacherId.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" asChild>
              <Link href="/classes">Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createClass.isPending}
            >
              {isSubmitting || createClass.isPending
                ? "Menyimpan..."
                : "Simpan Kelas"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
