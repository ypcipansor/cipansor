"use client";

import { MainLayout } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TrendingUp, Target, Award } from "lucide-react";
import { useUnits } from "@/hooks/use-units";
import { useActiveAcademicYear } from "@/hooks/use-academic-years";
import { useUnitEducationAnalytics } from "@/hooks/use-assessment";
import {
  useBenchmarkComparison,
  useStudentStatistics,
} from "@/hooks/use-analytics";
import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function EducationAnalyticsPage() {
  const { data: units } = useUnits();
  const { data: activeYear } = useActiveAcademicYear();
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  const unitList = Array.isArray(units) ? units : ((units as any)?.data ?? []);

  const { data: unitAnalytics } = useUnitEducationAnalytics(
    selectedUnitId || (unitList[0]?.id ?? ""),
    activeYear?.id ?? "",
  );

  // Derive subject performance from API data when available
  const subjectPerformance = useMemo(() => {
    if (unitAnalytics?.subjectAverages?.length > 0) {
      return unitAnalytics.subjectAverages.map((s: any) => ({
        subject: s.subjectId,
        score: s.averagePercentage,
      }));
    }
    return [];
  }, [unitAnalytics]);

  const hasSubjectData = subjectPerformance.length > 0;

  // Cross-unit performance (real: /analytics/benchmark/compare).
  const { data: benchmark } = useBenchmarkComparison();
  // Enrollment trend + per-unit counts (real: /analytics/students).
  const { data: studentStats } = useStudentStatistics();

  const unitKpiData = useMemo(
    () =>
      (benchmark?.units ?? []).map((u) => ({
        name: u.unitName,
        avgScore: u.academicAverage,
        tahfidzTarget: u.tahfidzProgress,
        attendance: u.attendanceRate,
      })),
    [benchmark],
  );
  const hasUnitKpi = unitKpiData.length > 0;

  const enrollmentTrend = useMemo(
    () =>
      (studentStats?.data?.trend ?? []).map((t) => ({
        month: t.month,
        students: t.count,
      })),
    [studentStats],
  );
  const hasEnrollmentTrend = enrollmentTrend.length > 0;

  const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  // Distribution by education level, aggregated from per-unit student counts.
  const gradeDistributionData = useMemo(() => {
    const byType = new Map<string, number>();
    for (const u of benchmark?.units ?? []) {
      byType.set(u.unitType, (byType.get(u.unitType) ?? 0) + u.studentCount);
    }
    return Array.from(byType.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }, [benchmark]);
  const hasGradeData = gradeDistributionData.length > 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Analitik Pendidikan Terpadu
            </h1>
            <p className="text-muted-foreground">
              Monitoring KPI akademik dan perkembangan santri antar unit
              pendidikan.
            </p>
          </div>
          <div className="w-full md:w-64">
            <Select
              value={selectedUnitId || (unitList[0]?.id ?? "")}
              onValueChange={setSelectedUnitId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih Unit" />
              </SelectTrigger>
              <SelectContent>
                {unitList.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-indigo-600 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-80">
                Rata-rata Skor Unit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {unitAnalytics?.subjectAverages?.length > 0
                  ? (
                      unitAnalytics.subjectAverages.reduce(
                        (sum: number, s: any) => sum + s.averagePercentage,
                        0,
                      ) / unitAnalytics.subjectAverages.length
                    ).toFixed(1)
                  : "—"}
              </div>
              <p className="text-xs mt-1 opacity-70 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Unit terpilih
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 text-muted-foreground">
              <CardTitle className="text-sm font-medium">
                Rata-rata Tahfidz (Juz)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {unitAnalytics?.averageJuz ?? "—"}
              </div>
              <p className="text-xs mt-1 text-emerald-600 font-bold uppercase">
                Rata-rata unit
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 text-muted-foreground">
              <CardTitle className="text-sm font-medium">
                Jumlah Santri Aktif
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {unitAnalytics?.studentCount ?? "—"}
              </div>
              <p className="text-xs mt-1 text-slate-500">Unit terpilih</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 text-muted-foreground">
              <CardTitle className="text-sm font-medium">
                Jumlah Mata Pelajaran
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {unitAnalytics?.subjectAverages?.length ?? "—"}
              </div>
              <p className="text-xs mt-1 text-indigo-600 font-bold">
                Dengan data nilai
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" /> Performa Unit
                Pendidikan
              </CardTitle>
              <CardDescription>
                Perbandingan Skor Akademik vs Capaian Tahfidz (rata-rata
                ayat/santri) antar unit
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {hasUnitKpi ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unitKpiData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="avgScore"
                      name="Skor Akademik"
                      fill="#4f46e5"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="tahfidzTarget"
                      name="Capaian Tahfidz"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Belum ada data perbandingan unit.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600" /> Penguasaan Materi
                (Global)
              </CardTitle>
              <CardDescription>
                Rata-rata nilai per kategori mata pelajaran
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {hasSubjectData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectPerformance} layout="vertical">
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={true}
                      vertical={false}
                    />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis dataKey="subject" type="category" />
                    <Tooltip />
                    <Bar
                      dataKey="score"
                      fill="#8b5cf6"
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Pilih unit dengan data nilai untuk melihat grafik.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                Tren Penerimaan Santri (per bulan)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              {hasEnrollmentTrend ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={enrollmentTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="students"
                      name="Santri baru"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Belum ada data penerimaan.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sebaran Jenjang Pendidikan
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              {hasGradeData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gradeDistributionData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {gradeDistributionData.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Belum ada data sebaran.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
