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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, AlertCircle, Star, BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { HomeroomPerformanceOverview } from "@cipansor/shared";

// Hook: real cross-class homeroom performance from the API
function useHomeroomPerformance() {
  return useQuery({
    queryKey: ["homeroom", "performance-overview"],
    queryFn: async () => {
      const response = await api.get<{ data: HomeroomPerformanceOverview }>(
        "/homeroom/performance-overview",
      );
      return response.data.data;
    },
  });
}

const getScoreColor = (score: number) => {
  if (score >= 90) return "text-green-600";
  if (score >= 80) return "text-blue-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
};

/** Tahfidz activity scaled to 0-100 (20 records/student/month = 100). */
const tahfidzScore = (perStudent: number) => Math.min(perStudent / 20, 1) * 100;

export default function HomeroomPerformancePage() {
  const { data, isLoading } = useHomeroomPerformance();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const items = data?.items ?? [];
  const current =
    items.find((t) => t.classId === selectedClassId) ?? items[0] ?? null;

  const radarData = current
    ? [
        { metric: "Kehadiran Siswa", value: current.metrics.attendanceRate },
        {
          metric: "Disiplin Presensi",
          value: current.metrics.recordingDiscipline,
        },
        { metric: "Akademik", value: current.metrics.academicAverage },
        {
          metric: "Aktivitas Tahfidz",
          value: Math.round(
            tahfidzScore(current.metrics.tahfidzActivityPerStudent),
          ),
        },
      ]
    : [];

  const comparisonData = items.map((item) => ({
    name: item.className,
    score: item.overallScore,
  }));

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN"]}>
      <div className="space-y-6">
        <PageHeader
          title="Performa Wali Kelas"
          description="Evaluasi kinerja wali kelas dari data presensi, akademik, tahfidz, dan perilaku (30–90 hari terakhir)"
        />

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Belum ada kelas dengan wali kelas pada tahun ajaran aktif.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Wali Kelas
                      </p>
                      <p className="text-2xl font-bold">{items.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <BarChart3 className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Skor Rata-rata
                      </p>
                      <p className="text-2xl font-bold">{data!.averageScore}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-100 rounded-lg">
                      <Star className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Performa Terbaik (≥90)
                      </p>
                      <p className="text-2xl font-bold">
                        {items.filter((t) => t.overallScore >= 90).length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-100 rounded-lg">
                      <AlertCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Perlu Perhatian (&lt;80)
                      </p>
                      <p className="text-2xl font-bold">
                        {items.filter((t) => t.overallScore < 80).length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Teacher Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              {items.map((teacher) => (
                <Card
                  key={teacher.classId}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-lg",
                    current?.classId === teacher.classId &&
                      "ring-2 ring-primary",
                  )}
                  onClick={() => setSelectedClassId(teacher.classId)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold">{teacher.teacherName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {teacher.className} • {teacher.studentCount} siswa •{" "}
                          {teacher.unitName}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "text-3xl font-bold",
                          getScoreColor(teacher.overallScore),
                        )}
                      >
                        {Math.round(teacher.overallScore)}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        teacher.metrics.behaviorBalance >= 0
                          ? "text-green-700"
                          : "text-red-700",
                      )}
                    >
                      Perilaku {teacher.metrics.behaviorBalance >= 0 ? "+" : ""}
                      {teacher.metrics.behaviorBalance}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

            {current && (
              <>
                {/* Detail Charts */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Radar Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {current.teacherName} — {current.className}
                      </CardTitle>
                      <CardDescription>
                        Detail performa per kategori
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis
                              dataKey="metric"
                              tick={{ fontSize: 11 }}
                            />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} />
                            <Radar
                              name="Skor"
                              dataKey="value"
                              stroke="#6366f1"
                              fill="#6366f1"
                              fillOpacity={0.5}
                            />
                            <Tooltip />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Comparison Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Perbandingan Antar Kelas</CardTitle>
                      <CardDescription>
                        Skor komposit seluruh wali kelas
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} />
                            <Tooltip />
                            <Bar
                              dataKey="score"
                              name="Skor"
                              fill="#6366f1"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Metric Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Breakdown Metrik — {current.teacherName}
                    </CardTitle>
                    <CardDescription>
                      Kehadiran & presensi 30 hari, akademik 90 hari, tahfidz
                      per santri 30 hari
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {[
                        {
                          label: "Kehadiran Siswa",
                          value: current.metrics.attendanceRate,
                        },
                        {
                          label: "Disiplin Presensi",
                          value: current.metrics.recordingDiscipline,
                        },
                        {
                          label: "Rata-rata Akademik",
                          value: current.metrics.academicAverage,
                        },
                        {
                          label: "Aktivitas Tahfidz",
                          value: Math.round(
                            tahfidzScore(
                              current.metrics.tahfidzActivityPerStudent,
                            ),
                          ),
                          detail: `${current.metrics.tahfidzActivityPerStudent} setoran/santri`,
                        },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          className="p-4 border rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">
                              {metric.label}
                            </span>
                            <span
                              className={cn(
                                "font-bold",
                                getScoreColor(metric.value),
                              )}
                            >
                              {Math.round(metric.value)}%
                            </span>
                          </div>
                          <Progress value={metric.value} className="h-2" />
                          {"detail" in metric && metric.detail && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {metric.detail}
                            </p>
                          )}
                        </div>
                      ))}
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            Saldo Perilaku (Reward − Pelanggaran)
                          </span>
                          <span
                            className={cn(
                              "font-bold",
                              current.metrics.behaviorBalance >= 0
                                ? "text-green-600"
                                : "text-red-600",
                            )}
                          >
                            {current.metrics.behaviorBalance >= 0 ? "+" : ""}
                            {current.metrics.behaviorBalance}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          30 hari terakhir
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
