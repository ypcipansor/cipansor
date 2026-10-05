"use client";

import Link from "next/link";
import { useForm, Controller, type Path } from "react-hook-form";
import { ArrowLeft, Save } from "lucide-react";
import {
  createExtracurricularSchema,
  splitScheduleTime,
  updateExtracurricularSchema,
  type CreateExtracurricularInput,
  type DayOfWeek,
  type ExtracurricularCategory,
  type ExtracurricularStatus,
  type UpdateExtracurricularInput,
} from "@cipansor/shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  EXTRACURRICULAR_CATEGORIES,
  EXTRACURRICULAR_STATUS_LABELS,
  WEEKDAYS,
  type Extracurricular,
} from "@/hooks/use-extracurricular";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useTeachers } from "@/hooks/use-teachers";
import { useUnits } from "@/hooks/use-units";

/**
 * The extracurricular form, for creating one and for editing it.
 *
 * It sends exactly the contract the API validates (`@cipansor/shared`), and
 * checks the payload with that same schema before sending, so a mistake shows
 * under its field instead of as a refused request. The unit is fixed once the
 * extracurricular exists, and for anyone but the Super Admin it is their own.
 */

interface FormValues {
  name: string;
  nameEn: string;
  nameAr: string;
  code: string;
  description: string;
  category: ExtracurricularCategory | "";
  status: ExtracurricularStatus;
  unitId: string;
  academicYearId: string;
  coachId: string;
  maxParticipants: string;
  scheduleDay: DayOfWeek[];
  startTime: string;
  endTime: string;
  venue: string;
  isCompulsory: boolean;
}

type Props =
  | {
      mode: "create";
      /** The signed-in user's unit; null for the Super Admin, who chooses. */
      fixedUnitId: string | null;
      submitting: boolean;
      onSubmit: (payload: CreateExtracurricularInput) => Promise<void>;
    }
  | {
      mode: "edit";
      initial: Extracurricular;
      submitting: boolean;
      onSubmit: (payload: UpdateExtracurricularInput) => Promise<void>;
    };

/** Where an issue on a payload field is shown on the form. */
const FIELD_OF: Record<string, Path<FormValues>> = {
  scheduleTime: "endTime",
};

function valuesFrom(initial: Extracurricular | undefined): FormValues {
  const time = splitScheduleTime(initial?.scheduleTime);
  return {
    name: initial?.name ?? "",
    nameEn: initial?.nameEn ?? "",
    nameAr: initial?.nameAr ?? "",
    code: initial?.code ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "",
    status: initial?.status ?? "ACTIVE",
    unitId: initial?.unitId ?? "",
    academicYearId: initial?.academicYearId ?? "",
    coachId: initial?.coachId ?? "",
    maxParticipants: initial?.maxParticipants
      ? String(initial.maxParticipants)
      : "",
    scheduleDay: initial?.scheduleDay ?? [],
    startTime: time?.start ?? "",
    endTime: time?.end ?? "",
    venue: initial?.venue ?? "",
    isCompulsory: initial?.isCompulsory ?? false,
  };
}

/**
 * Built once the units and the academic years are in: a form of Selects filled
 * after it mounted lost its values (lessons/select-empty-value-sentinel.md).
 */
export function ExtracurricularForm(props: Props) {
  const units = useUnits();
  const years = useAcademicYears({ limit: 50 });
  if (!units.data || !years.data) {
    return <Skeleton className="h-96 w-full" />;
  }
  return (
    <FormBody {...props} units={units.data} years={years.data.data ?? []} />
  );
}

function FormBody(
  props: Props & {
    units: Array<{ id: string; name: string }>;
    years: Array<{ id: string; name: string; isActive: boolean }>;
  },
) {
  const { units, years } = props;
  const initial = props.mode === "edit" ? props.initial : undefined;

  const defaults = valuesFrom(initial);
  if (props.mode === "create") {
    defaults.unitId = props.fixedUnitId ?? "";
    defaults.academicYearId = years.find((y) => y.isActive)?.id ?? "";
  }

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: defaults });

  const unitId = watch("unitId");
  const { data: teachersData } = useTeachers(
    unitId ? { unitId, limit: 100 } : undefined,
  );
  const teachers = unitId ? (teachersData?.data ?? []) : [];

  const submit = async (v: FormValues) => {
    if (Boolean(v.startTime) !== Boolean(v.endTime)) {
      setError("endTime", { message: "Isi jam mulai dan jam selesai" });
      return;
    }
    const scheduleTime =
      v.startTime && v.endTime ? `${v.startTime}-${v.endTime}` : undefined;
    const capacity = v.maxParticipants.trim()
      ? Number(v.maxParticipants)
      : undefined;
    const common = {
      academicYearId: v.academicYearId,
      name: v.name,
      category: v.category as ExtracurricularCategory,
      scheduleDay: v.scheduleDay,
      isCompulsory: v.isCompulsory,
    };

    // An edit sends null for a field emptied, so the API clears it; a new
    // one simply leaves it out.
    const parsed =
      props.mode === "create"
        ? createExtracurricularSchema.safeParse({
            ...common,
            unitId: v.unitId,
            nameEn: v.nameEn,
            nameAr: v.nameAr,
            code: v.code,
            description: v.description,
            scheduleTime,
            venue: v.venue,
            maxParticipants: capacity,
            coachId: v.coachId || undefined,
          })
        : updateExtracurricularSchema.safeParse({
            ...common,
            nameEn: v.nameEn.trim() || null,
            nameAr: v.nameAr.trim() || null,
            code: v.code,
            description: v.description.trim() || null,
            scheduleTime: scheduleTime ?? null,
            venue: v.venue.trim() || null,
            maxParticipants: capacity ?? null,
            coachId: v.coachId || null,
            status: v.status,
          });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        const field = FIELD_OF[key] ?? (key as Path<FormValues>);
        setError(field, { message: issue.message });
      }
      return;
    }
    if (props.mode === "create") {
      await props.onSubmit(parsed.data as CreateExtracurricularInput);
    } else {
      await props.onSubmit(parsed.data as UpdateExtracurricularInput);
    }
  };

  const errorOf = (field: keyof FormValues) =>
    errors[field]?.message ? (
      <p className="text-sm text-destructive">{errors[field]?.message}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Informasi Dasar</CardTitle>
          <CardDescription>
            Nama, jenis, dan keterangan kegiatan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nama Ekstrakurikuler *</Label>
              <Input
                id="name"
                placeholder="Contoh: Pramuka, Taekwondo, English Club"
                {...register("name")}
              />
              {errorOf("name")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Kode</Label>
              <Input
                id="code"
                placeholder="Contoh: PRM, TKD"
                {...register("code")}
              />
              {errorOf("code")}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nameEn">Nama dalam bahasa Inggris</Label>
              <Input
                id="nameEn"
                lang="en"
                placeholder="Contoh: Scouting (Pramuka), Archery"
                {...register("nameEn")}
              />
              {errorOf("nameEn")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameAr">Nama dalam bahasa Arab</Label>
              <Input
                id="nameAr"
                lang="ar"
                dir="rtl"
                placeholder="مثال: الكشافة، الرماية"
                {...register("nameAr")}
              />
              {errorOf("nameAr")}
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2">
              Ekstrakurikuler aktif tampil di situs publik (halaman Kegiatan)
              dalam tiga bahasa. Kosongkan bila sama dengan nama Indonesia.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              placeholder="Deskripsi singkat kegiatan ekstrakurikuler..."
              rows={3}
              {...register("description")}
            />
            {errorOf("description")}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="category">Kategori *</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXTRACURRICULAR_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.icon} {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errorOf("category")}
            </div>

            {props.mode === "edit" && (
              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EXTRACURRICULAR_STATUS_LABELS).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="maxParticipants">Kapasitas Anggota</Label>
              <Input
                id="maxParticipants"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Kosongkan jika tidak dibatasi"
                {...register("maxParticipants")}
              />
              {errorOf("maxParticipants")}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={control}
              name="isCompulsory"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
              )}
            />
            Wajib diikuti seluruh santri unit
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unit, Tahun Ajaran & Pembina</CardTitle>
          <CardDescription>
            {props.mode === "edit"
              ? "Unit tidak dapat dipindah setelah ekstrakurikuler dibuat"
              : "Unit dan tahun ajaran ekstrakurikuler ini"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="unitId">Unit *</Label>
            <Controller
              control={control}
              name="unitId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={props.mode === "edit" || Boolean(props.fixedUnitId)}
                >
                  <SelectTrigger id="unitId">
                    <SelectValue placeholder="Pilih unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errorOf("unitId")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="academicYearId">Tahun Ajaran *</Label>
            <Controller
              control={control}
              name="academicYearId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="academicYearId">
                    <SelectValue placeholder="Pilih tahun ajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                        {year.isActive ? " (Aktif)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errorOf("academicYearId")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="coachId">Pembina</Label>
            <Controller
              control={control}
              name="coachId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="coachId">
                    <SelectValue placeholder="Pilih pembina (opsional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Belum ada pembina</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.user?.name ?? teacher.nip ?? "Guru"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jadwal Kegiatan</CardTitle>
          <CardDescription>
            Hari pertemuan rutin, jamnya, dan tempatnya
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Hari</legend>
            <Controller
              control={control}
              name="scheduleDay"
              render={({ field }) => (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {WEEKDAYS.map((day) => (
                    <label
                      key={day.value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={field.value.includes(day.value)}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            checked === true
                              ? WEEKDAYS.map((d) => d.value).filter(
                                  (d) =>
                                    d === day.value || field.value.includes(d),
                                )
                              : field.value.filter((d) => d !== day.value),
                          )
                        }
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              )}
            />
          </fieldset>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Jam Mulai</Label>
              <Input id="startTime" type="time" {...register("startTime")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Jam Selesai</Label>
              <Input id="endTime" type="time" {...register("endTime")} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="venue">Tempat</Label>
              <Input
                id="venue"
                placeholder="Contoh: Lapangan, Aula Utama"
                {...register("venue")}
              />
            </div>
          </div>
          {errorOf("endTime")}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" asChild>
          <Link
            href={
              initial ? `/extracurricular/${initial.id}` : "/extracurricular"
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Batal
          </Link>
        </Button>
        <Button type="submit" disabled={props.submitting}>
          <Save className="mr-2 h-4 w-4" />
          {props.submitting ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
