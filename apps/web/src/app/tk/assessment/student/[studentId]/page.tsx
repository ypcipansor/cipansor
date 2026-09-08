"use client";

import { useRouter, useParams } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useStudentProgressSummary,
  useTKAssessments,
  TKAspect,
  ASPECT_LABELS,
  ACHIEVEMENT_LABELS,
  ACHIEVEMENT_COLORS,
  StudentProgressSummary,
  TKAchievementLevel,
} from "@/hooks/use-tk-assessment";
import { useStudent } from "@/hooks/use-students";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Calendar,
  BarChart3,
  List,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { TKRadarChart } from "@/components/tk";

const ASPECT_ORDER: TKAspect[] = ["NAM", "FM", "KOG", "BHS", "SE", "SNI"];

const achievementToProgress: Record<string, number> = {
  BB: 25,
  MB: 50,
  BSH: 75,
  BSB: 100,
};

function TrendIcon({ trend }: { trend: "UP" | "DOWN" | "STABLE" | "NONE" }) {
  switch (trend) {
    case "UP":
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    case "DOWN":
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    case "STABLE":
      return <Minus className="h-4 w-4 text-blue-600" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function StudentProgressDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;
  const [academicYearId, setAcademicYearId] = useState<string>("");

  const { data: student, isLoading: loadingStudent } = useStudent(studentId);
  const { data: academicYears } = useAcademicYears();
  const { data: summary, isLoading: loadingSummary } =
    useStudentProgressSummary(studentId, academicYearId || undefined);
  const { data: assessments, isLoading: loadingAssessments } = useTKAssessments(
    {
      studentId,
      academicYearId: academicYearId || undefined,
      limit: 20,
    },
  );

  const isLoading = loadingStudent || loadingSummary;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  // Find latest assessment date from summary array
  const lastAssessmentDate = summary?.summary?.reduce(
    (latest: Date | null, item) => {
      if (!item.latestDate) return latest;
      const date = new Date(item.latestDate);
      return !latest || date > latest ? date : latest;
    },
    null,
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Progress Perkembangan"
          description={
            student ? `${student.name} - ${student.nisn}` : "Loading..."
          }
          actions={
            <div className="flex items-center gap-4">
              <Select value={academicYearId} onValueChange={setAcademicYearId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Semua Tahun Ajaran" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua Tahun Ajaran</SelectItem>
                  {academicYears?.data?.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali
              </Button>
            </div>
          }
        />

        {/* Student Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              {student?.photoUrl ? (
                <img
                  src={student.photoUrl}
                  alt=""
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              <div className="text-center md:text-left flex-1">
                <h2 className="text-2xl font-bold">{student?.name}</h2>
                <p className="text-muted-foreground">NISN: {student?.nisn}</p>
                <div className="flex flex-wrap gap-2 mt-2 justify-center md:justify-start">
                  {student?.currentClass && (
                    <Badge variant="outline">{student.currentClass.name}</Badge>
                  )}
                  {student?.unit && (
                    <Badge variant="secondary">{student.unit.name}</Badge>
                  )}
                </div>
              </div>
              <div className="text-center md:text-right">
                <p className="text-sm text-muted-foreground">Total Penilaian</p>
                <p className="text-3xl font-bold">
                  {summary?.totalAssessments || 0}
                </p>
                {lastAssessmentDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Terakhir:{" "}
                    {format(lastAssessmentDate, "dd MMM yyyy", {
                      locale: idLocale,
                    })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Ringkasan
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <List className="h-4 w-4" />
              Riwayat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Aspect Progress Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ASPECT_ORDER.map((aspect) => {
                const aspectData = summary?.summary?.find(
                  (s) => s.aspect === aspect,
                );
                const progressValue = aspectData?.latestLevel
                  ? achievementToProgress[aspectData.latestLevel]
                  : 0;

                return (
                  <Card key={aspect} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-sm font-medium">
                          {aspect}
                        </CardTitle>
                      </div>
                      <CardDescription>{ASPECT_LABELS[aspect]}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold">
                            {aspectData?.latestLevel || "-"}
                          </span>
                          {aspectData?.latestLevel && (
                            <Badge
                              className={cn(
                                "font-normal",
                                ACHIEVEMENT_COLORS[aspectData.latestLevel],
                              )}
                            >
                              {ACHIEVEMENT_LABELS[aspectData.latestLevel]}
                            </Badge>
                          )}
                        </div>
                        <Progress value={progressValue} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          {aspectData?.totalAssessments || 0} penilaian
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Legend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Keterangan Tingkat Capaian
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(ACHIEVEMENT_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "w-12 justify-center",
                          ACHIEVEMENT_COLORS[key as TKAchievementLevel],
                        )}
                      >
                        {key}
                      </Badge>
                      <span className="text-sm">{label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {loadingAssessments ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : assessments?.data?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold">Belum Ada Penilaian</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Siswa ini belum memiliki catatan penilaian perkembangan.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {assessments?.data?.map((assessment) => (
                  <Card
                    key={assessment.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() =>
                      router.push(`/paud/assessment/${assessment.id}`)
                    }
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold">
                              {safeFormat(
                                new Date(assessment.periodDate),
                                "dd",
                                {
                                  locale: idLocale,
                                },
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(
                                new Date(assessment.periodDate),
                                "MMM yy",
                                { locale: idLocale },
                              )}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {assessment.aspect}
                              </Badge>
                              <span className="text-sm font-medium">
                                {ASPECT_LABELS[assessment.aspect]}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {assessment.narrativeText || "Tidak ada catatan"}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "text-lg px-3 py-1",
                            ACHIEVEMENT_COLORS[assessment.achievementLevel],
                          )}
                        >
                          {assessment.achievementLevel}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
