"use client";

import { useState } from "react";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  Target,
  BookOpen,
  Award,
  Star,
  CheckCircle2,
  Circle,
  Clock,
  Users,
  TrendingUp,
  Calendar,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyProgress } from "@/hooks/use-takhosus";

// Takhosus program milestones/levels
const TAKHOSUS_LEVELS = [
  {
    level: 1,
    name: "Mubtadi (Pemula)",
    juzTarget: 5,
    durationMonths: 6,
    color: "bg-slate-500",
  },
  {
    level: 2,
    name: "Mutawassith (Menengah)",
    juzTarget: 15,
    durationMonths: 12,
    color: "bg-blue-500",
  },
  {
    level: 3,
    name: "Mutaqaddim (Lanjutan)",
    juzTarget: 25,
    durationMonths: 18,
    color: "bg-purple-500",
  },
  {
    level: 4,
    name: "Hafizh (30 Juz)",
    juzTarget: 30,
    durationMonths: 24,
    color: "bg-amber-500",
  },
  {
    level: 5,
    name: "Mutqin (Penguat)",
    juzTarget: 30,
    durationMonths: 36,
    color: "bg-green-500",
  },
];

// Fallback data for when API returns empty
const fallbackProgress = {
  studentId: "",
  studentName: "Memuat...",
  class: "-",
  currentLevel: 1,
  currentJuz: 0,
  totalAyahMemorized: 0,
  startDate: new Date().toISOString(),
  expectedCompletion: new Date().toISOString(),
  weeklyTarget: 3,
  lastWeekProgress: 0,
  streakDays: 0,
  sanadCount: 0,
  milestones: TAKHOSUS_LEVELS.map((level, index) => ({
    level: level.level,
    completed: false,
    progress: 0,
    currentJuz: 0,
    targetJuz: level.juzTarget,
    completedDate: undefined as string | undefined,
    sanadId: undefined as string | undefined,
  })),
};

const getMilestoneIcon = (completed: boolean, inProgress: boolean) => {
  if (completed) return <CheckCircle2 className="h-6 w-6 text-green-600" />;
  if (inProgress) return <Clock className="h-6 w-6 text-blue-600" />;
  return <Circle className="h-6 w-6 text-muted-foreground" />;
};

export default function TakhosusMilestonePage() {
  const [selectedStudent, setSelectedStudent] = useState<string>("");

  // Fetch progress from API
  const { data: apiProgress, isLoading } = useMyProgress();

  // Transform API data to component format
  const progress = apiProgress
    ? {
        studentId: apiProgress.student.id,
        studentName: apiProgress.student.user.name,
        class: apiProgress.halaqoh.name,
        currentLevel: 1, // Default or calculated
        currentJuz: apiProgress.enrollment.currentJuz,
        totalAyahMemorized: 0, // Not available in API
        startDate: apiProgress.enrollment.enrolledAt,
        expectedCompletion:
          apiProgress.enrollment.targetCompletionDate ||
          new Date().toISOString(),
        weeklyTarget: 0, // Not available in API
        lastWeekProgress: 0, // Not available in API
        streakDays: 0, // Not available in API
        sanadCount: apiProgress.juzProgress.filter((j) => j.certified).length,
        milestones: TAKHOSUS_LEVELS.map((level) => {
          const isCompleted =
            apiProgress.enrollment.currentJuz >= level.juzTarget;
          // Calculate progress percentage for this level
          let levelProgress = 0;
          if (isCompleted) {
            levelProgress = 100;
          } else {
            // Logic to calculate progress within this level could be added here
            // For now simplifying
            levelProgress =
              (apiProgress.enrollment.currentJuz / level.juzTarget) * 100;
          }

          return {
            level: level.level,
            completed: isCompleted,
            progress: levelProgress,
            currentJuz: apiProgress.enrollment.currentJuz,
            targetJuz: level.juzTarget,
            completedDate: undefined, // Not easily available per level without more logic
            sanadId: undefined,
          };
        }),
      }
    : fallbackProgress;

  const totalProgress = (progress.currentJuz / 30) * 100;

  // Loading state
  if (isLoading) {
    return (
      <MainLayout
        allowedRoles={[
          "STUDENT",
          "TEACHER",
          "SUPER_ADMIN",
          "UNIT_ADMIN",
          "PARENT",
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Milestone Takhosus"
            description="Perjalanan menuju Hafizh 30 Juz"
          />
          <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6 text-center">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <Skeleton className="h-10 w-16 mx-auto" />
                      <Skeleton className="h-4 w-20 mt-1 mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <Skeleton className="h-4 w-full" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <Skeleton className="flex-1 h-24 rounded-xl" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      allowedRoles={[
        "STUDENT",
        "TEACHER",
        "SUPER_ADMIN",
        "UNIT_ADMIN",
        "PARENT",
      ]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Milestone Takhosus"
          description="Perjalanan menuju Hafizh 30 Juz"
        />

        {/* Student Info & Progress Overview */}
        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{progress.studentName}</h2>
                  <p className="text-muted-foreground">{progress.class}</p>
                  <Badge
                    className={
                      TAKHOSUS_LEVELS[progress.currentLevel - 1]?.color ||
                      "bg-slate-500"
                    }
                  >
                    {TAKHOSUS_LEVELS[progress.currentLevel - 1]?.name}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-3xl font-bold text-primary">
                    {progress.currentJuz}
                  </p>
                  <p className="text-sm text-muted-foreground">Juz Hafal</p>
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {progress.totalAyahMemorized.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Ayat</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-amber-600">
                    {progress.streakDays}
                  </p>
                  <p className="text-sm text-muted-foreground">Hari Streak</p>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress Keseluruhan</span>
                <span className="font-medium">
                  {progress.currentJuz}/30 Juz ({Math.round(totalProgress)}%)
                </span>
              </div>
              <Progress value={totalProgress} className="h-4" />
            </div>
          </CardContent>
        </Card>

        {/* Milestone Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Milestone Journey
            </CardTitle>
            <CardDescription>
              Tahapan perjalanan menuju hafizh 30 juz
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-muted" />

              <div className="space-y-6">
                {TAKHOSUS_LEVELS.map((level, index) => {
                  const milestone = progress.milestones[index];
                  const isCompleted = milestone?.completed;
                  const isInProgress = !isCompleted && milestone?.progress > 0;

                  return (
                    <div
                      key={level.level}
                      className="relative flex gap-4 items-start"
                    >
                      {/* Icon */}
                      <div
                        className={cn(
                          "relative z-10 w-12 h-12 rounded-full border-4 flex items-center justify-center bg-background",
                          isCompleted
                            ? "border-green-500"
                            : isInProgress
                              ? "border-blue-500"
                              : "border-muted",
                        )}
                      >
                        {getMilestoneIcon(isCompleted, isInProgress)}
                      </div>

                      {/* Content */}
                      <div
                        className={cn(
                          "flex-1 p-4 rounded-xl border",
                          isCompleted
                            ? "bg-green-50 border-green-200"
                            : isInProgress
                              ? "bg-blue-50 border-blue-200"
                              : "bg-muted/30",
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="font-semibold flex items-center gap-2">
                              Level {level.level}: {level.name}
                              {isCompleted && (
                                <Badge
                                  variant="outline"
                                  className="bg-green-100 text-green-700"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Selesai
                                </Badge>
                              )}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Target: {level.juzTarget} Juz •{" "}
                              {level.durationMonths} bulan
                            </p>
                          </div>
                          <div
                            className={cn("w-3 h-3 rounded-full", level.color)}
                          />
                        </div>

                        {isInProgress && milestone && (
                          <div className="mt-3 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress Level</span>
                              <span>
                                {milestone.currentJuz}/{milestone.targetJuz} Juz
                              </span>
                            </div>
                            <Progress
                              value={milestone.progress}
                              className="h-2"
                            />
                          </div>
                        )}

                        {isCompleted && milestone?.completedDate && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-700">
                            <Calendar className="h-4 w-4" />
                            <span>
                              Selesai:{" "}
                              {new Date(
                                milestone.completedDate,
                              ).toLocaleDateString("id-ID")}
                            </span>
                            {milestone.sanadId && (
                              <>
                                <Award className="h-4 w-4 ml-2" />
                                <span>Sanad terdaftar</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Progress Minggu Ini
                  </p>
                  <p className="text-2xl font-bold">
                    {progress.lastWeekProgress}/{progress.weeklyTarget} halaman
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Award className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Sanad Diterima
                  </p>
                  <p className="text-2xl font-bold">
                    {progress.sanadCount} Sanad
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Calendar className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Target Selesai
                  </p>
                  <p className="text-2xl font-bold">
                    {new Date(progress.expectedCompletion).toLocaleDateString(
                      "id-ID",
                      { month: "short", year: "numeric" },
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
