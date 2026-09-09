"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  useCreateHalaqoh,
  HALAQOH_DAYS,
  HalaqohDay,
} from "@/hooks/use-takhosus";
import { useUnits } from "@/hooks/use-units";
import { useUsers } from "@/hooks/use-users";

const halaqohFormSchema = z.object({
  unitId: z.string().min(1, "Unit wajib dipilih"),
  teacherId: z.string().min(1, "Pembimbing wajib dipilih"),
  code: z.string().min(1, "Kode halaqoh wajib diisi"),
  name: z.string().min(1, "Nama halaqoh wajib diisi"),
  description: z.string().optional(),
  level: z.coerce
    .number()
    .min(1, "Level minimal 1")
    .max(10, "Level maksimal 10"),
  maxStudents: z.coerce.number().min(1, "Kapasitas minimal 1"),
  scheduleDay: z.array(z.string()).min(1, "Minimal pilih satu hari"),
  scheduleTime: z.string().optional(),
  location: z.string().optional(),
  isActive: z.boolean(),
});

type HalaqohFormValues = z.infer<typeof halaqohFormSchema>;

export default function NewHalaqohPage() {
  const router = useRouter();
  const createHalaqoh = useCreateHalaqoh();

  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: usersData } = useUsers({ role: "TEACHER", limit: 100 });

  const teachers = usersData?.data || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<HalaqohFormValues>({
    resolver: zodResolver(halaqohFormSchema),
    defaultValues: {
      unitId: "",
      teacherId: "",
      code: "",
      name: "",
      description: "",
      level: 1,
      maxStudents: 15,
      scheduleDay: [],
      scheduleTime: "",
      location: "",
      isActive: true,
    },
  });

  const selectedDays = watch("scheduleDay") || [];
  const isActive = watch("isActive");

  const toggleDay = (day: string) => {
    const current = selectedDays;
    if (current.includes(day)) {
      setValue(
        "scheduleDay",
        current.filter((d) => d !== day),
      );
    } else {
      setValue("scheduleDay", [...current, day]);
    }
  };

  const onSubmit = async (data: HalaqohFormValues) => {
    try {
      await createHalaqoh.mutateAsync({
        ...data,
        scheduleDay: data.scheduleDay as HalaqohDay[],
      });
      toast.success("Halaqoh berhasil dibuat");
      router.push("/takhosus");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal membuat halaqoh";
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
              Tambah Halaqoh Baru
            </h1>
            <p className="text-muted-foreground">
              Buat kelompok halaqoh untuk program takhosus
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Halaqoh</CardTitle>
              <CardDescription>Data dasar kelompok halaqoh</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Kode Halaqoh *</Label>
                  <Input
                    id="code"
                    placeholder="HLQ-001"
                    {...register("code")}
                  />
                  {errors.code && (
                    <p className="text-sm text-destructive">
                      {errors.code.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Nama Halaqoh *</Label>
                  <Input
                    id="name"
                    placeholder="Halaqoh Al-Fatih"
                    {...register("name")}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Deskripsi</Label>
                <Textarea
                  id="description"
                  placeholder="Deskripsi halaqoh..."
                  className="resize-none"
                  {...register("description")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unitId">Unit *</Label>
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

                <div className="space-y-2">
                  <Label htmlFor="teacherId">Pembimbing *</Label>
                  <Select
                    onValueChange={(value) => setValue("teacherId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih pembimbing" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.teacherId && (
                    <p className="text-sm text-destructive">
                      {errors.teacherId.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="level">Level *</Label>
                  <Input
                    type="number"
                    id="level"
                    min={1}
                    max={10}
                    {...register("level")}
                  />
                  <p className="text-sm text-muted-foreground">
                    Level kesulitan halaqoh (1-10)
                  </p>
                  {errors.level && (
                    <p className="text-sm text-destructive">
                      {errors.level.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxStudents">Kapasitas Maksimal *</Label>
                  <Input
                    type="number"
                    id="maxStudents"
                    min={1}
                    {...register("maxStudents")}
                  />
                  <p className="text-sm text-muted-foreground">
                    Jumlah maksimal santri dalam halaqoh
                  </p>
                  {errors.maxStudents && (
                    <p className="text-sm text-destructive">
                      {errors.maxStudents.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jadwal</CardTitle>
              <CardDescription>
                Pengaturan jadwal pelaksanaan halaqoh
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Hari Pelaksanaan *</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                  {HALAQOH_DAYS.map((day) => (
                    <div
                      key={day.value}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`day-${day.value}`}
                        checked={selectedDays.includes(day.value)}
                        onCheckedChange={() => toggleDay(day.value)}
                      />
                      <label
                        htmlFor={`day-${day.value}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {day.label}
                      </label>
                    </div>
                  ))}
                </div>
                {errors.scheduleDay && (
                  <p className="text-sm text-destructive">
                    {errors.scheduleDay.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduleTime">Waktu</Label>
                  <Input
                    id="scheduleTime"
                    placeholder="05:00 - 06:00"
                    {...register("scheduleTime")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Lokasi</Label>
                  <Input
                    id="location"
                    placeholder="Masjid, Aula, dll"
                    {...register("location")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="isActive" className="text-base">
                    Status Aktif
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Halaqoh yang tidak aktif tidak akan muncul dalam pendaftaran
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

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/takhosus">Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createHalaqoh.isPending}
            >
              {isSubmitting || createHalaqoh.isPending
                ? "Menyimpan..."
                : "Simpan Halaqoh"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
