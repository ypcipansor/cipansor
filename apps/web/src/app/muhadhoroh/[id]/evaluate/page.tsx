"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Star,
  Award,
  Video,
  MessageSquare,
  Save,
  Clock,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import {
  useMuhadhorohDetail,
  useEvaluateMuhadhoroh,
  getLanguageLabel,
  getGradeColor,
} from "@/hooks/use-muhadhoroh";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Form Schema
const evaluateSchema = z.object({
  contentScore: z.number().min(0).max(100),
  deliveryScore: z.number().min(0).max(100),
  languageScore: z.number().min(0).max(100),
  duration: z.number().min(1).max(60).optional(),
  feedback: z.string().max(2000).optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
});

type EvaluateFormData = z.infer<typeof evaluateSchema>;

// Helper to calculate grade
function calculateGrade(totalScore: number): string {
  if (totalScore >= 86) return "A";
  if (totalScore >= 71) return "B";
  if (totalScore >= 56) return "C";
  if (totalScore >= 41) return "D";
  return "E";
}

// Helper to get grade label in Indonesian (pesantren style)
function getGradeLabel(grade: string): string {
  switch (grade) {
    case "A":
      return "Mumtaz (Sangat Baik)";
    case "B":
      return "Jayyid Jiddan (Baik Sekali)";
    case "C":
      return "Jayyid (Baik)";
    case "D":
      return "Maqbul (Cukup)";
    case "E":
      return "Rasib (Kurang)";
    default:
      return grade;
  }
}

export default function EvaluateMuhadhorohPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: muhadhoroh, isLoading } = useMuhadhorohDetail(id);
  const evaluateMutation = useEvaluateMuhadhoroh();

  // Form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EvaluateFormData>({
    resolver: zodResolver(evaluateSchema),
    defaultValues: {
      contentScore: muhadhoroh?.contentScore || 75,
      deliveryScore: muhadhoroh?.deliveryScore || 75,
      languageScore: muhadhoroh?.languageScore || 75,
      duration: muhadhoroh?.duration || 5,
      feedback: muhadhoroh?.feedback || "",
      videoUrl: muhadhoroh?.videoUrl || "",
    },
  });

  const contentScore = watch("contentScore") || 75;
  const deliveryScore = watch("deliveryScore") || 75;
  const languageScore = watch("languageScore") || 75;
  const duration = watch("duration") || 5;

  // Calculate total and grade
  const totalScore = Math.round(
    (contentScore + deliveryScore + languageScore) / 3,
  );
  const grade = calculateGrade(totalScore);

  const onSubmit = async (data: EvaluateFormData) => {
    try {
      await evaluateMutation.mutateAsync({
        id,
        input: {
          contentScore: data.contentScore,
          deliveryScore: data.deliveryScore,
          languageScore: data.languageScore,
          duration: data.duration,
          feedback: data.feedback || undefined,
          videoUrl: data.videoUrl || undefined,
        },
      });
      toast.success("Penilaian berhasil disimpan");
      router.push(`/muhadhoroh/${id}`);
    } catch {
      toast.error("Gagal menyimpan penilaian");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/muhadhoroh">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Link>
          </Button>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-[600px] w-full" />
      </MainLayout>
    );
  }

  if (!muhadhoroh) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Data tidak ditemukan</p>
          <Button asChild className="mt-4">
            <Link href="/muhadhoroh">Kembali</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href={`/muhadhoroh/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali ke Detail
          </Link>
        </Button>
        <div className="flex items-center gap-3 mb-2">
          <Award className="h-8 w-8 text-yellow-500" />
          <h1 className="text-2xl font-bold tracking-tight">
            Penilaian Muhadhoroh
          </h1>
        </div>
        <p className="text-muted-foreground">
          Berikan penilaian untuk penampilan muhadhoroh santri
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Form */}
          <div className="md:col-span-2 space-y-6">
            {/* Student & Topic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" />
                  Informasi Muhadhoroh
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="text-lg">
                      {muhadhoroh.student?.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("") || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">
                      {muhadhoroh.student?.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      NISN: {muhadhoroh.student?.nisn} •{" "}
                      {muhadhoroh.student?.class?.name}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline">
                        {muhadhoroh.language === "Indonesian" && "🇮🇩"}
                        {muhadhoroh.language === "Arabic" && "🕌"}
                        {muhadhoroh.language === "English" && "🇬🇧"}{" "}
                        {getLanguageLabel(muhadhoroh.language)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(
                          new Date(muhadhoroh.scheduledAt),
                          "dd MMM yyyy",
                          { locale: localeId },
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <Separator className="my-4" />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Topik</p>
                  <p className="font-medium">{muhadhoroh.topic}</p>
                </div>
              </CardContent>
            </Card>

            {/* Scoring */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Star className="h-5 w-5" />
                  Komponen Penilaian
                </CardTitle>
                <CardDescription>
                  Geser slider untuk memberikan nilai pada setiap komponen
                  (0-100)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Content Score */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base font-medium">
                        Konten / Isi Materi
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Kualitas materi, kedalaman pembahasan, relevansi dengan
                        topik
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold">{contentScore}</span>
                      <span className="text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <Slider
                    value={[contentScore]}
                    onValueChange={([value]) => setValue("contentScore", value)}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Kurang</span>
                    <span>Cukup</span>
                    <span>Baik</span>
                    <span>Sangat Baik</span>
                    <span>Sempurna</span>
                  </div>
                </div>

                <Separator />

                {/* Delivery Score */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base font-medium">
                        Penyampaian / Delivery
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Cara berbicara, intonasi, gestur, kontak mata,
                        kepercayaan diri
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold">
                        {deliveryScore}
                      </span>
                      <span className="text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <Slider
                    value={[deliveryScore]}
                    onValueChange={([value]) =>
                      setValue("deliveryScore", value)
                    }
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Kurang</span>
                    <span>Cukup</span>
                    <span>Baik</span>
                    <span>Sangat Baik</span>
                    <span>Sempurna</span>
                  </div>
                </div>

                <Separator />

                {/* Language Score */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-base font-medium">
                        Penggunaan Bahasa
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Tata bahasa, kosa kata, pengucapan/pelafalan, kelancaran
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold">
                        {languageScore}
                      </span>
                      <span className="text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <Slider
                    value={[languageScore]}
                    onValueChange={([value]) =>
                      setValue("languageScore", value)
                    }
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Kurang</span>
                    <span>Cukup</span>
                    <span>Baik</span>
                    <span>Sangat Baik</span>
                    <span>Sempurna</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Duration & Additional Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5" />
                  Durasi & Catatan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Duration */}
                <div className="space-y-2">
                  <Label htmlFor="duration">Durasi Penampilan (menit)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[duration]}
                      onValueChange={([value]) => setValue("duration", value)}
                      max={30}
                      min={1}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-20 text-center font-medium">
                      {duration} menit
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Durasi ideal: 5-7 menit untuk pemula, 7-10 menit untuk
                    tingkat lanjut
                  </p>
                </div>

                {/* Video URL */}
                <div className="space-y-2">
                  <Label htmlFor="videoUrl" className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Link Rekaman Video (Opsional)
                  </Label>
                  <Input
                    id="videoUrl"
                    placeholder="https://youtube.com/... atau https://drive.google.com/..."
                    {...register("videoUrl")}
                  />
                  {errors.videoUrl && (
                    <p className="text-sm text-destructive">
                      {errors.videoUrl.message}
                    </p>
                  )}
                </div>

                {/* Feedback */}
                <div className="space-y-2">
                  <Label htmlFor="feedback" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Catatan / Feedback untuk Santri
                  </Label>
                  <Textarea
                    id="feedback"
                    placeholder="Berikan masukan konstruktif untuk perbaikan santri..."
                    {...register("feedback")}
                    className="min-h-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tips: Berikan apresiasi terlebih dahulu, lalu sampaikan
                    saran perbaikan dengan bahasa yang memotivasi
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Score Summary */}
          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Award className="h-5 w-5 text-yellow-500" />
                  Ringkasan Nilai
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Total Score Display */}
                <div className="text-center p-6 bg-linear-to-br from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-muted-foreground mb-2">
                    Nilai Total
                  </p>
                  <div className="text-5xl font-bold text-yellow-600 mb-2">
                    {totalScore}
                  </div>
                  <Badge
                    className={`${getGradeColor(grade)} text-lg px-4 py-1`}
                  >
                    {grade}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    {getGradeLabel(grade)}
                  </p>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Konten</span>
                    <span className="font-medium">{contentScore}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Penyampaian</span>
                    <span className="font-medium">{deliveryScore}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Bahasa</span>
                    <span className="font-medium">{languageScore}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Rata-rata</span>
                    <span className="font-bold text-lg">{totalScore}</span>
                  </div>
                </div>

                <Separator />

                {/* Actions */}
                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || evaluateMutation.isPending}
                  >
                    {isSubmitting || evaluateMutation.isPending ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Simpan Penilaian
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => router.back()}
                  >
                    Batal
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Grade Legend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Keterangan Predikat</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getGradeColor("A")}>A</Badge>
                      <span>Mumtaz</span>
                    </div>
                    <span className="text-muted-foreground">86-100</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getGradeColor("B")}>B</Badge>
                      <span>Jayyid Jiddan</span>
                    </div>
                    <span className="text-muted-foreground">71-85</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getGradeColor("C")}>C</Badge>
                      <span>Jayyid</span>
                    </div>
                    <span className="text-muted-foreground">56-70</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getGradeColor("D")}>D</Badge>
                      <span>Maqbul</span>
                    </div>
                    <span className="text-muted-foreground">41-55</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getGradeColor("E")}>E</Badge>
                      <span>Rasib</span>
                    </div>
                    <span className="text-muted-foreground">0-40</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </MainLayout>
  );
}
