"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ArrowLeft, CalendarIcon, Search } from "lucide-react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  useCreateTahfidz,
  TAHFIDZ_TYPES,
  TAHFIDZ_GRADES,
  SURAH_LIST,
  TahfidzType,
  TahfidzGrade,
} from "@/hooks/use-tahfidz";
import { useStudents } from "@/hooks/use-students";
import { cn } from "@/lib/utils";

const tahfidzSchema = z
  .object({
    studentId: z.string().min(1, "Santri wajib dipilih"),
    date: z.date({ error: "Tanggal wajib diisi" }),
    surah: z.string().min(1, "Surah wajib dipilih"),
    startAyah: z.coerce.number().min(1, "Ayat awal minimal 1"),
    endAyah: z.coerce.number().min(1, "Ayat akhir minimal 1"),
    type: z.enum(["ZIYADAH", "MUROJAAH", "TASMI", "ASSESSMENT"] as const, {
      error: "Tipe wajib dipilih",
    }),
    grade: z.enum(
      ["MUMTAZ", "JAYYID_JIDDAN", "JAYYID", "MAQBUL", "RASIB"] as const,
      {
        error: "Nilai wajib dipilih",
      },
    ),
    notes: z.string().optional(),
  })
  .refine((data) => data.endAyah >= data.startAyah, {
    message: "Ayat akhir harus sama atau lebih besar dari ayat awal",
    path: ["endAyah"],
  });

type TahfidzFormData = z.infer<typeof tahfidzSchema>;

export default function NewTahfidzPage() {
  const router = useRouter();
  const createTahfidz = useCreateTahfidz();

  const [studentSearch, setStudentSearch] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [surahOpen, setSurahOpen] = useState(false);

  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    search: studentSearch,
    limit: 20,
  });
  const students = studentsData?.data || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TahfidzFormData>({
    resolver: zodResolver(tahfidzSchema),
    defaultValues: {
      date: new Date(),
      startAyah: 1,
      endAyah: 1,
    },
  });

  const date = watch("date");
  const studentId = watch("studentId");
  const surah = watch("surah");
  const selectedStudent = students.find((s) => s.id === studentId);

  const onSubmit = async (data: TahfidzFormData) => {
    try {
      await createTahfidz.mutateAsync({
        studentId: data.studentId,
        recordedAt: format(data.date, "yyyy-MM-dd"),
        surahName: data.surah,
        surahNumber: SURAH_LIST.indexOf(data.surah) + 1,
        ayahStart: data.startAyah,
        ayahEnd: data.endAyah,
        activityType: data.type,
        score:
          data.grade === "MUMTAZ"
            ? 100
            : data.grade === "JAYYID_JIDDAN"
              ? 90
              : data.grade === "JAYYID"
                ? 80
                : data.grade === "MAQBUL"
                  ? 70
                  : 60,
        juz: 30, // Defaulting to 30 as form does not provide it yet
        notes: data.notes || undefined,
      });
      toast.success("Catatan tahfidz berhasil disimpan");
      router.push("/tahfidz");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menyimpan catatan";
      toast.error(errorMessage);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/tahfidz">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Tambah Catatan Tahfidz
            </h1>
            <p className="text-muted-foreground">
              Catat setoran atau murajaah hafalan santri
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Santri</CardTitle>
                <CardDescription>Pilih santri dan tanggal</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Santri *</Label>
                  <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={studentOpen}
                        className="w-full justify-between"
                      >
                        {selectedStudent ? (
                          <span>
                            {selectedStudent.name} ({selectedStudent.nis})
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Cari santri...
                          </span>
                        )}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Cari nama atau NIS santri..."
                          value={studentSearch}
                          onValueChange={setStudentSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {studentsLoading
                              ? "Mencari..."
                              : "Santri tidak ditemukan"}
                          </CommandEmpty>
                          <CommandGroup>
                            {students.map((student) => (
                              <CommandItem
                                key={student.id}
                                value={student.id}
                                onSelect={() => {
                                  setValue("studentId", student.id);
                                  setStudentOpen(false);
                                }}
                              >
                                <div>
                                  <p className="font-medium">{student.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {student.nis}
                                  </p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.studentId && (
                    <p className="text-sm text-destructive">
                      {errors.studentId.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Tanggal *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !date && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date
                          ? format(date, "d MMMM yyyy", { locale: localeId })
                          : "Pilih tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(d) => d && setValue("date", d)}
                        disabled={(d) => d > new Date()}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.date && (
                    <p className="text-sm text-destructive">
                      {errors.date.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipe *</Label>
                    <Select
                      onValueChange={(value) =>
                        setValue("type", value as TahfidzType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih tipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAHFIDZ_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.type && (
                      <p className="text-sm text-destructive">
                        {errors.type.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="grade">Nilai *</Label>
                    <Select
                      onValueChange={(value) =>
                        setValue("grade", value as TahfidzGrade)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih nilai" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAHFIDZ_GRADES.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.grade && (
                      <p className="text-sm text-destructive">
                        {errors.grade.message}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detail Hafalan</CardTitle>
                <CardDescription>
                  Surah dan ayat yang dihafalkan
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Surah *</Label>
                  <Popover open={surahOpen} onOpenChange={setSurahOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={surahOpen}
                        className="w-full justify-between"
                      >
                        {surah || (
                          <span className="text-muted-foreground">
                            Pilih surah...
                          </span>
                        )}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Cari surah..." />
                        <CommandList>
                          <CommandEmpty>Surah tidak ditemukan</CommandEmpty>
                          <CommandGroup>
                            {SURAH_LIST.map((s, index) => (
                              <CommandItem
                                key={s}
                                value={s}
                                onSelect={() => {
                                  setValue("surah", s);
                                  setSurahOpen(false);
                                }}
                              >
                                {index + 1}. {s}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.surah && (
                    <p className="text-sm text-destructive">
                      {errors.surah.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startAyah">Ayat Awal *</Label>
                    <Input
                      id="startAyah"
                      type="number"
                      min={1}
                      {...register("startAyah")}
                    />
                    {errors.startAyah && (
                      <p className="text-sm text-destructive">
                        {errors.startAyah.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="endAyah">Ayat Akhir *</Label>
                    <Input
                      id="endAyah"
                      type="number"
                      min={1}
                      {...register("endAyah")}
                    />
                    {errors.endAyah && (
                      <p className="text-sm text-destructive">
                        {errors.endAyah.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Catatan</Label>
                  <Textarea
                    id="notes"
                    placeholder="Catatan tambahan (opsional)"
                    rows={4}
                    {...register("notes")}
                  />
                  {errors.notes && (
                    <p className="text-sm text-destructive">
                      {errors.notes.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" asChild>
              <Link href="/tahfidz">Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createTahfidz.isPending}
            >
              {isSubmitting || createTahfidz.isPending
                ? "Menyimpan..."
                : "Simpan Catatan"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
