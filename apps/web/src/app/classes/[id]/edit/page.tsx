"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
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
import { useClass, useUpdateClass } from "@/hooks/use-classes";

const classSchema = z.object({
  name: z.string().min(1, "Nama kelas wajib diisi"),
  level: z.string().min(1, "Level wajib diisi"), // Maps to grade/level
  unitId: z.string().min(1, "Unit wajib dipilih"),
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
  homeroomTeacherId: z.string().optional(),
  capacity: z.coerce.number().min(1, "Kapasitas minimal 1").optional(),
});

type ClassFormData = z.infer<typeof classSchema>;

export default function EditClassPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;

  const { data: classData, isLoading: classLoading } = useClass(classId);
  const updateClass = useUpdateClass();

  const { data: units, isLoading: unitsLoading } = useUnits();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassFormData>({
    resolver: zodResolver(classSchema),
  });

  const selectedUnitId = watch("unitId");

  // Fetch teachers filtered by unit from the backend directly
  const { data: teachers, isLoading: teachersLoading } = useTeachers({
    unitId: selectedUnitId,
    status: "ACTIVE",
    limit: 100,
  });

  // Fetch academic years filtered by unit from the backend directly
  const { data: academicYearsData, isLoading: academicYearsLoading } =
    useAcademicYears({
      unitId: selectedUnitId,
      limit: 100,
    });

  const academicYears = academicYearsData?.data || [];
  const teachersList = teachers?.data || [];

  // Radix <SelectValue> renders the *selected item's* text, not the trigger's
  // children, so the current unit/year only shows once a matching <SelectItem>
  // exists. Merge the class's own unit/year (carried on classData) into the
  // option lists so the edit form displays its current values immediately,
  // even before the units/years list queries resolve (or if they fail).
  const unitOptions = useMemo(() => {
    const rest = (units ?? []).filter((u) => u.id !== classData?.unit?.id);
    return classData?.unit
      ? [classData.unit as (typeof rest)[number], ...rest]
      : rest;
  }, [units, classData?.unit]);

  const academicYearOptions = useMemo(() => {
    const list = [...academicYears];
    // Always keep the class's own academic year selectable, even after the
    // unit select is re-touched (which clears academicYearId) or before the
    // per-unit years query resolves.
    if (
      classData?.academicYear &&
      !list.some((ay) => ay.id === classData.academicYear!.id)
    ) {
      list.unshift(classData.academicYear as (typeof list)[number]);
    }
    return list;
  }, [academicYears, classData?.academicYear]);

  // Populate form with existing data
  useEffect(() => {
    if (classData) {
      reset({
        name: classData.name,
        level: classData.level || String(classData.grade),
        unitId: classData.unitId,
        academicYearId: classData.academicYearId,
        homeroomTeacherId: classData.homeroomTeacherId || "",
        capacity: classData.capacity || undefined,
      });
    }
  }, [classData, reset]);

  const onSubmit = async (data: ClassFormData) => {
    try {
      await updateClass.mutateAsync({
        id: classId,
        data: {
          ...data,
          homeroomTeacherId: data.homeroomTeacherId || undefined, // Send undefined if empty string, or let it be handled
          capacity: data.capacity || 30, // Default fallback
        },
      });
      toast.success("Kelas berhasil diperbarui");
      router.push(`/classes/${classId}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal memperbarui kelas";
      toast.error(errorMessage);
    }
  };

  if (classLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!classData) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <p className="text-muted-foreground">Kelas tidak ditemukan</p>
          <Button asChild>
            <Link href="/classes">Kembali ke Daftar Kelas</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/classes/${classId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Kelas</h1>
            <p className="text-muted-foreground">
              Perbarui data kelas {classData.name}
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
                    value={selectedUnitId}
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
                      {unitOptions.map((unit) => (
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
                    value={watch("academicYearId")}
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
                      {academicYearOptions.map((ay) => (
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
                    value={watch("homeroomTeacherId") || ""}
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
                      >
                        {
                          teachersList?.find(
                            (t) => t.id === watch("homeroomTeacherId"),
                          )?.user?.name
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {teachersList?.map((teacher) => (
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
              <Link href={`/classes/${classId}`}>Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || updateClass.isPending}
            >
              {isSubmitting || updateClass.isPending
                ? "Menyimpan..."
                : "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
