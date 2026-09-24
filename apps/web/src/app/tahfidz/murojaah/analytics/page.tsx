"use client";

import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { useMurojaahRecords, MurojaahRecord } from "@/hooks/use-murojaah";
import { useClasses } from "@/hooks/use-classes";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BookOpen,
  Target,
  AlertCircle,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getEffectiveRole } from "@/lib/rbac";

// Mistake type labels
const MISTAKE_TYPE_LABELS: Record<string, string> = {
  TAJWID: "Tajwid",
  MAKHROJ: "Makhroj",
  HARAKAT: "Harakat",
  WAQF: "Waqaf",
  LAFAZ: "Lafaz",
  OTHER: "Lainnya",
};

// Mistake type colors
const MISTAKE_TYPE_COLORS: Record<string, string> = {
  TAJWID: "bg-purple-500",
  MAKHROJ: "bg-blue-500",
  HARAKAT: "bg-orange-500",
  WAQF: "bg-green-500",
  LAFAZ: "bg-red-500",
  OTHER: "bg-gray-500",
};

interface MistakeStats {
  type: string;
  count: number;
  percentage: number;
}

interface QualityDistribution {
  excellent: number; // 90-100
  good: number; // 70-89
  moderate: number; // 50-69
  needsWork: number; // <50
}

export default function MurojaahAnalyticsPage() {
  const { user } = useAuthStore();
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [dateRange, setDateRange] = useState<string>("30");

  const { data: classes } = useClasses({ unitId: user?.unitId });

  const dateFrom = useMemo(() => {
    return format(subDays(new Date(), parseInt(dateRange)), "yyyy-MM-dd");
  }, [dateRange]);

  const { data: recordsData, isLoading } = useMurojaahRecords({
    classId: selectedClass || undefined,
    unitId: getEffectiveRole(user) !== "SUPER_ADMIN" ? user?.unitId : undefined,
    dateFrom,
    limit: 1000, // Get more records for analytics
  });

  const records = recordsData?.data || [];

  // Calculate analytics from records
  const analytics = useMemo(() => {
    if (!records.length)
      return {
        totalRecords: 0,
        passedRecords: 0,
        pendingRecords: 0,
        averageGrade: 0,
        qualityDistribution: {
          excellent: 0,
          good: 0,
          moderate: 0,
          needsWork: 0,
        },
        mistakeStats: [],
        surahCoverage: [],
        dailyActivity: [],
      };

    const totalRecords = records.length;
    const passedRecords = records.filter(
      (r: MurojaahRecord) => r.status === "PASSED",
    ).length;
    const pendingRecords = records.filter(
      (r: MurojaahRecord) => r.status === "PENDING",
    ).length;

    // Average grade
    const gradesSum = records.reduce(
      (sum: number, r: MurojaahRecord) => sum + (r.grade || 0),
      0,
    );
    const averageGrade =
      totalRecords > 0 ? Math.round(gradesSum / totalRecords) : 0;

    // Quality distribution
    const qualityDistribution: QualityDistribution = {
      excellent: 0,
      good: 0,
      moderate: 0,
      needsWork: 0,
    };

    records.forEach((r: MurojaahRecord) => {
      const grade = r.grade || 0;
      if (grade >= 90) qualityDistribution.excellent++;
      else if (grade >= 70) qualityDistribution.good++;
      else if (grade >= 50) qualityDistribution.moderate++;
      else qualityDistribution.needsWork++;
    });

    // Mistake statistics
    const mistakeCounts: Record<string, number> = {};
    let totalMistakes = 0;

    records.forEach((r: MurojaahRecord) => {
      r.mistakes?.forEach((m) => {
        mistakeCounts[m.mistakeType] = (mistakeCounts[m.mistakeType] || 0) + 1;
        totalMistakes++;
      });
    });

    const mistakeStats: MistakeStats[] = Object.entries(mistakeCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage:
          totalMistakes > 0 ? Math.round((count / totalMistakes) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Surah coverage
    const surahCounts: Record<string, number> = {};
    records.forEach((r: MurojaahRecord) => {
      if (r.surahName) {
        surahCounts[r.surahName] = (surahCounts[r.surahName] || 0) + 1;
      }
    });

    const surahCoverage = Object.entries(surahCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRecords,
      passedRecords,
      pendingRecords,
      averageGrade,
      qualityDistribution,
      mistakeStats,
      surahCoverage,
    };
  }, [records]);

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN", "TEACHER"]}>
      <div className="space-y-6">
        <PageHeader
          title="Analitik Murojaah"
          description="Pantau kualitas dan pola kesalahan dalam murojaah santri"
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Semua Kelas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Kelas</SelectItem>
              {classes?.data?.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Periode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Hari Terakhir</SelectItem>
              <SelectItem value="30">30 Hari Terakhir</SelectItem>
              <SelectItem value="90">3 Bulan Terakhir</SelectItem>
              <SelectItem value="365">1 Tahun Terakhir</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Murojaah
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalRecords}</div>
              <p className="text-xs text-muted-foreground">sesi tercatat</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Rata-rata Nilai
              </CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.averageGrade}</div>
              <Progress value={analytics.averageGrade} className="mt-2" />
            </CardContent>
          </Card>

          <Card className="glass-card border-green-500/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-green-600">
                Lulus
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.passedRecords}
              </div>
              <p className="text-xs text-muted-foreground">
                {analytics.totalRecords > 0
                  ? `${Math.round((analytics.passedRecords / analytics.totalRecords) * 100)}%`
                  : "0%"}
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-yellow-500/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">
                Pending
              </CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.pendingRecords}
              </div>
              <p className="text-xs text-muted-foreground">menunggu review</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="quality" className="space-y-4">
          <TabsList>
            <TabsTrigger value="quality">Distribusi Kualitas</TabsTrigger>
            <TabsTrigger value="mistakes">Pola Kesalahan</TabsTrigger>
            <TabsTrigger value="surah">Cakupan Surah</TabsTrigger>
          </TabsList>

          <TabsContent value="quality" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Distribusi Nilai Murojaah</CardTitle>
                <CardDescription>
                  Pembagian kualitas murojaah berdasarkan rentang nilai
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="text-3xl font-bold text-green-600">
                      {analytics.qualityDistribution.excellent}
                    </div>
                    <p className="text-sm font-medium">Sangat Baik</p>
                    <p className="text-xs text-muted-foreground">90-100</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="text-3xl font-bold text-blue-600">
                      {analytics.qualityDistribution.good}
                    </div>
                    <p className="text-sm font-medium">Baik</p>
                    <p className="text-xs text-muted-foreground">70-89</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="text-3xl font-bold text-yellow-600">
                      {analytics.qualityDistribution.moderate}
                    </div>
                    <p className="text-sm font-medium">Cukup</p>
                    <p className="text-xs text-muted-foreground">50-69</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="text-3xl font-bold text-red-600">
                      {analytics.qualityDistribution.needsWork}
                    </div>
                    <p className="text-sm font-medium">Perlu Latihan</p>
                    <p className="text-xs text-muted-foreground">&lt;50</p>
                  </div>
                </div>

                {/* Visual bar */}
                <div className="space-y-2">
                  <div className="flex h-8 rounded-full overflow-hidden">
                    {analytics.totalRecords > 0 ? (
                      <>
                        <div
                          className="bg-green-500 flex items-center justify-center text-xs text-white"
                          style={{
                            width: `${
                              (analytics.qualityDistribution.excellent /
                                analytics.totalRecords) *
                              100
                            }%`,
                          }}
                        >
                          {analytics.qualityDistribution.excellent > 0 &&
                            analytics.qualityDistribution.excellent}
                        </div>
                        <div
                          className="bg-blue-500 flex items-center justify-center text-xs text-white"
                          style={{
                            width: `${
                              (analytics.qualityDistribution.good /
                                analytics.totalRecords) *
                              100
                            }%`,
                          }}
                        >
                          {analytics.qualityDistribution.good > 0 &&
                            analytics.qualityDistribution.good}
                        </div>
                        <div
                          className="bg-yellow-500 flex items-center justify-center text-xs"
                          style={{
                            width: `${
                              (analytics.qualityDistribution.moderate /
                                analytics.totalRecords) *
                              100
                            }%`,
                          }}
                        >
                          {analytics.qualityDistribution.moderate > 0 &&
                            analytics.qualityDistribution.moderate}
                        </div>
                        <div
                          className="bg-red-500 flex items-center justify-center text-xs text-white"
                          style={{
                            width: `${
                              (analytics.qualityDistribution.needsWork /
                                analytics.totalRecords) *
                              100
                            }%`,
                          }}
                        >
                          {analytics.qualityDistribution.needsWork > 0 &&
                            analytics.qualityDistribution.needsWork}
                        </div>
                      </>
                    ) : (
                      <div className="w-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        Belum ada data
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mistakes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Analisis Pola Kesalahan
                </CardTitle>
                <CardDescription>
                  Jenis kesalahan yang sering terjadi untuk fokus perbaikan
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.mistakeStats.length > 0 ? (
                  <div className="space-y-4">
                    {analytics.mistakeStats.map((stat) => (
                      <div key={stat.type} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "w-3 h-3 rounded-full",
                                MISTAKE_TYPE_COLORS[stat.type],
                              )}
                            />
                            <span className="font-medium">
                              {MISTAKE_TYPE_LABELS[stat.type] || stat.type}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {stat.count} ({stat.percentage}%)
                          </span>
                        </div>
                        <Progress value={stat.percentage} className="h-2" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="font-semibold">
                      Tidak Ada Kesalahan Tercatat
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Belum ada data kesalahan dalam periode ini
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="surah" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Surah yang Sering Dimurojaah</CardTitle>
                <CardDescription>
                  10 surah teratas dalam periode ini
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.surahCoverage.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.surahCoverage.map((surah, index) => (
                      <div
                        key={surah.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-muted-foreground w-6">
                            {index + 1}
                          </span>
                          <span className="font-medium">{surah.name}</span>
                        </div>
                        <Badge variant="secondary">{surah.count} sesi</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold">Belum Ada Data</h3>
                    <p className="text-sm text-muted-foreground">
                      Tidak ada data murojaah dalam periode ini
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
