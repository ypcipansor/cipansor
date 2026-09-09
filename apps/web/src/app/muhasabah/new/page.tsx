"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";

import { id as localeId } from "date-fns/locale";
import Link from "next/link";
import { Moon, Sun, BookOpen, Heart, Sparkles, ArrowLeft } from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useCreateMuhasabah,
  MUHASABAH_MOODS,
  SHOLAT_WAJIB,
  SHOLAT_SUNNAH,
  MuhasabahMood,
} from "@/hooks/use-muhasabah";
import { cn } from "@/lib/utils";

const muhasabahFormSchema = z.object({
  date: z.string().min(1, "Tanggal wajib diisi"),
  sholatSubuh: z.boolean(),
  sholatDzuhur: z.boolean(),
  sholatAshar: z.boolean(),
  sholatMaghrib: z.boolean(),
  sholatIsya: z.boolean(),
  sholatTahajud: z.boolean(),
  sholatDhuha: z.boolean(),
  tilawahPages: z.coerce.number().min(0),
  dzikirPagi: z.boolean(),
  dzikirSore: z.boolean(),
  istighfar: z.coerce.number().min(0),
  shalawat: z.coerce.number().min(0),
  murojaahJuz: z.coerce.number().min(0).max(30).optional(),
  mood: z.enum(["EXCELLENT", "GOOD", "NEUTRAL", "LOW", "STRUGGLING"]),
  gratitude: z.string().optional(),
  improvement: z.string().optional(),
  notes: z.string().optional(),
});

type MuhasabahFormValues = z.infer<typeof muhasabahFormSchema>;

export default function NewMuhasabahPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");

  const createMuhasabah = useCreateMuhasabah();

  const today = dateParam || safeFormat(new Date(), "yyyy-MM-dd");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MuhasabahFormValues>({
    resolver: zodResolver(muhasabahFormSchema),
    defaultValues: {
      date: today,
      sholatSubuh: false,
      sholatDzuhur: false,
      sholatAshar: false,
      sholatMaghrib: false,
      sholatIsya: false,
      sholatTahajud: false,
      sholatDhuha: false,
      tilawahPages: 0,
      dzikirPagi: false,
      dzikirSore: false,
      istighfar: 0,
      shalawat: 0,
      mood: "NEUTRAL",
      gratitude: "",
      improvement: "",
      notes: "",
    },
  });

  // Watch values for interactive UI
  const sholatSubuh = watch("sholatSubuh");
  const sholatDzuhur = watch("sholatDzuhur");
  const sholatAshar = watch("sholatAshar");
  const sholatMaghrib = watch("sholatMaghrib");
  const sholatIsya = watch("sholatIsya");
  const sholatTahajud = watch("sholatTahajud");
  const sholatDhuha = watch("sholatDhuha");
  const dzikirPagi = watch("dzikirPagi");
  const dzikirSore = watch("dzikirSore");
  const tilawahPages = watch("tilawahPages");
  const mood = watch("mood");

  const sholatWajibValues: Record<string, boolean> = {
    sholatSubuh,
    sholatDzuhur,
    sholatAshar,
    sholatMaghrib,
    sholatIsya,
  };

  const sholatSunnahValues: Record<string, boolean> = {
    sholatTahajud,
    sholatDhuha,
  };

  const onSubmit = async (data: MuhasabahFormValues) => {
    try {
      await createMuhasabah.mutateAsync({
        ...data,
        mood: data.mood as MuhasabahMood,
      });
      toast.success("Muhasabah berhasil disimpan");
      router.push("/muhasabah");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menyimpan muhasabah";
      toast.error(errorMessage);
    }
  };

  const fillAllSholat = (value: boolean) => {
    setValue("sholatSubuh", value);
    setValue("sholatDzuhur", value);
    setValue("sholatAshar", value);
    setValue("sholatMaghrib", value);
    setValue("sholatIsya", value);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/muhasabah">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Isi Muhasabah Harian
            </h1>
            <p className="text-muted-foreground">
              Tanggal:{" "}
              {safeFormat(new Date(today), "EEEE, d MMMM yyyy", {
                locale: localeId,
              })}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Sholat Wajib */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Moon className="h-5 w-5" />
                    Sholat Wajib
                  </CardTitle>
                  <CardDescription>
                    Centang sholat yang telah dilaksanakan
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fillAllSholat(true)}
                  >
                    Semua ✓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fillAllSholat(false)}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {SHOLAT_WAJIB.map((sholat) => {
                  const value = sholatWajibValues[sholat.key];
                  return (
                    <div
                      key={sholat.key}
                      className={cn(
                        "flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-colors",
                        value
                          ? "border-green-500 bg-green-50 dark:bg-green-950"
                          : "border-gray-200 hover:border-gray-300",
                      )}
                      onClick={() => setValue(sholat.key, !value)}
                    >
                      <Checkbox checked={value} className="sr-only" />
                      <span className="text-2xl mb-1">
                        {value ? "✅" : "⬜"}
                      </span>
                      <Label className="font-medium cursor-pointer">
                        {sholat.label}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {sholat.time}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Sholat Sunnah */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5" />
                Sholat Sunnah
              </CardTitle>
              <CardDescription>Sholat sunnah yang dilaksanakan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {SHOLAT_SUNNAH.map((sholat) => {
                  const value = sholatSunnahValues[sholat.key];
                  return (
                    <div
                      key={sholat.key}
                      className={cn(
                        "flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-colors",
                        value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                          : "border-gray-200 hover:border-gray-300",
                      )}
                      onClick={() => setValue(sholat.key, !value)}
                    >
                      <Checkbox checked={value} className="sr-only" />
                      <span className="text-2xl mb-1">
                        {value ? "✅" : "⬜"}
                      </span>
                      <Label className="font-medium cursor-pointer">
                        {sholat.label}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {sholat.time}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Tilawah & Dzikir */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Tilawah & Dzikir
              </CardTitle>
              <CardDescription>
                Aktivitas tilawah dan dzikir harian
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Halaman Tilawah Al-Quran</Label>
                  <div className="space-y-2">
                    <Slider
                      value={[tilawahPages]}
                      onValueChange={(v: number[]) =>
                        setValue("tilawahPages", v[0])
                      }
                      max={20}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">0 halaman</span>
                      <span className="font-bold text-lg">
                        {tilawahPages} halaman
                      </span>
                      <span className="text-muted-foreground">20 halaman</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="murojaahJuz">Murojaah Juz</Label>
                  <Input
                    type="number"
                    id="murojaahJuz"
                    min={0}
                    max={30}
                    placeholder="Juz yang dimurojaah"
                    {...register("murojaahJuz")}
                  />
                  <p className="text-sm text-muted-foreground">
                    Opsional: juz yang dimurojaah hari ini
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                    dzikirPagi
                      ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                  onClick={() => setValue("dzikirPagi", !dzikirPagi)}
                >
                  <Sun className="h-6 w-6 text-yellow-600" />
                  <div>
                    <Label className="font-medium cursor-pointer">
                      Dzikir Pagi
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Setelah Subuh
                    </p>
                  </div>
                  <Checkbox checked={dzikirPagi} className="ml-auto" />
                </div>

                <div
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                    dzikirSore
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                  onClick={() => setValue("dzikirSore", !dzikirSore)}
                >
                  <Moon className="h-6 w-6 text-orange-600" />
                  <div>
                    <Label className="font-medium cursor-pointer">
                      Dzikir Sore
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Setelah Ashar
                    </p>
                  </div>
                  <Checkbox checked={dzikirSore} className="ml-auto" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="istighfar">Istighfar</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      id="istighfar"
                      min={0}
                      {...register("istighfar")}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">kali</span>
                    <div className="flex gap-1 ml-auto">
                      {[33, 70, 100].map((n) => (
                        <Button
                          key={n}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setValue("istighfar", n)}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shalawat">Shalawat</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      id="shalawat"
                      min={0}
                      {...register("shalawat")}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">kali</span>
                    <div className="flex gap-1 ml-auto">
                      {[10, 33, 100].map((n) => (
                        <Button
                          key={n}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setValue("shalawat", n)}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mood & Refleksi */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Refleksi
              </CardTitle>
              <CardDescription>
                Bagaimana kondisi spiritual Anda hari ini?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Kondisi Hari Ini</Label>
                <RadioGroup
                  value={mood}
                  onValueChange={(v) => setValue("mood", v as MuhasabahMood)}
                  className="grid grid-cols-5 gap-2"
                >
                  {MUHASABAH_MOODS.map((m) => (
                    <div key={m.value}>
                      <RadioGroupItem
                        value={m.value}
                        className="sr-only"
                        id={m.value}
                      />
                      <label
                        htmlFor={m.value}
                        className={cn(
                          "flex flex-col items-center p-3 rounded-lg border-2 cursor-pointer transition-colors",
                          mood === m.value
                            ? "border-primary bg-primary/10"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <span className="text-3xl mb-1">{m.emoji}</span>
                        <span className="text-xs font-medium">{m.label}</span>
                      </label>
                    </div>
                  ))}
                </RadioGroup>
                {errors.mood && (
                  <p className="text-sm text-destructive">
                    {errors.mood.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gratitude" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Syukur Hari Ini
                </Label>
                <Textarea
                  id="gratitude"
                  placeholder="Apa yang Anda syukuri hari ini?"
                  className="resize-none"
                  rows={3}
                  {...register("gratitude")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="improvement">Yang Perlu Diperbaiki</Label>
                <Textarea
                  id="improvement"
                  placeholder="Apa yang ingin Anda perbaiki?"
                  className="resize-none"
                  rows={3}
                  {...register("improvement")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Catatan Tambahan</Label>
                <Textarea
                  id="notes"
                  placeholder="Catatan lainnya..."
                  className="resize-none"
                  rows={3}
                  {...register("notes")}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/muhasabah">Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createMuhasabah.isPending}
            >
              {isSubmitting || createMuhasabah.isPending
                ? "Menyimpan..."
                : "Simpan Muhasabah"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
