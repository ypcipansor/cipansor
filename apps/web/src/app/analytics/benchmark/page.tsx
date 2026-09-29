"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  ArrowLeft,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Medal,
  Target,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

interface UnitMetrics {
  unitId: string;
  unitName: string;
  unitType: string;
  studentCount: number;
  attendanceRate: number;
  paymentCollectionRate: number;
  tahfidzProgress: number;
  academicAverage: number;
}

interface RankingResult {
  unitId: string;
  unitName: string;
  metric: string;
  value: number;
  rank: number;
  trend: "up" | "down" | "stable";
}

interface BenchmarkSummary {
  topPerformers: Array<{ metric: string; unitName: string; value: number }>;
  overallAverages: {
    attendanceRate: number;
    paymentCollectionRate: number;
    tahfidzProgress: number;
    academicAverage: number;
  };
  unitCount: number;
}

const METRIC_LABELS: Record<string, string> = {
  attendance: "Kehadiran",
  payment: "Pembayaran",
  tahfidz: "Tahfidz",
  academic: "Akademik",
};

const METRIC_COLORS: Record<string, string> = {
  attendance: "#10b981",
  payment: "#3b82f6",
  tahfidz: "#8b5cf6",
  academic: "#f59e0b",
};

export default function BenchmarkPage() {
  const [selectedMetric, setSelectedMetric] = useState<string>("all");

  // Fetch benchmark summary
  const { data: summary, isLoading: loadingSummary } =
    useQuery<BenchmarkSummary>({
      queryKey: ["benchmark-summary"],
      queryFn: async () => {
        // The shared axios instance carries the HttpOnly session cookie
        // (`withCredentials`); there is no token in JavaScript to attach.
        const res = await api.get<{ data: BenchmarkSummary }>(
          "/analytics/benchmark",
        );
        return res.data.data;
      },
    });

  // Fetch comparison data
  const { data: comparison, isLoading: loadingComparison } = useQuery<{
    units: UnitMetrics[];
    averages: BenchmarkSummary["overallAverages"];
  }>({
    queryKey: ["benchmark-compare"],
    queryFn: async () => {
      const res = await api.get<{
        data: {
          units: UnitMetrics[];
          averages: BenchmarkSummary["overallAverages"];
        };
      }>("/analytics/benchmark/compare");
      return res.data.data;
    },
  });

  // Fetch rankings
  const { data: rankings, isLoading: loadingRankings } = useQuery<
    RankingResult[]
  >({
    queryKey: ["benchmark-rankings", selectedMetric],
    queryFn: async () => {
      const res = await api.get<{ data: RankingResult[] }>(
        "/analytics/benchmark/rankings",
        { params: { metric: selectedMetric } },
      );
      return res.data.data;
    },
  });

  const isLoading = loadingSummary || loadingComparison || loadingRankings;

  // Prepare chart data
  const barChartData =
    comparison?.units.map((unit) => ({
      name: unit.unitName,
      Kehadiran: unit.attendanceRate,
      Pembayaran: unit.paymentCollectionRate,
      Tahfidz: unit.tahfidzProgress,
      Akademik: unit.academicAverage,
    })) || [];

  const radarData =
    comparison?.units.map((unit) => ({
      subject: unit.unitName,
      attendance: unit.attendanceRate,
      payment: unit.paymentCollectionRate,
      tahfidz: unit.tahfidzProgress,
      academic: unit.academicAverage,
      fullMark: 100,
    })) || [];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-yellow-500">🥇 #1</Badge>;
    if (rank === 2) return <Badge className="bg-gray-400">🥈 #2</Badge>;
    if (rank === 3) return <Badge className="bg-orange-600">🥉 #3</Badge>;
    return <Badge variant="outline">#{rank}</Badge>;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/analytics">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <PageHeader
            title="Benchmark Analytics"
            description="Perbandingan performa antar unit pendidikan"
          />
        </div>

        {/* Top Performers Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          {loadingSummary
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="mt-2 h-4 w-20" />
                  </CardContent>
                </Card>
              ))
            : summary?.topPerformers.map((perf) => (
                <Card key={perf.metric}>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-yellow-500" />
                      {METRIC_LABELS[perf.metric]} Terbaik
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{perf.unitName}</p>
                    <p className="text-sm text-muted-foreground">
                      {perf.value.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Overall Averages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Rata-rata Keseluruhan ({summary?.unitCount || 0} unit)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {summary?.overallAverages.attendanceRate.toFixed(1) || 0}%
                </p>
                <p className="text-sm text-muted-foreground">Kehadiran</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">
                  {summary?.overallAverages.paymentCollectionRate.toFixed(1) ||
                    0}
                  %
                </p>
                <p className="text-sm text-muted-foreground">Pembayaran</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">
                  {summary?.overallAverages.tahfidzProgress.toFixed(1) || 0}
                </p>
                <p className="text-sm text-muted-foreground">Avg Ayah/Santri</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-600">
                  {summary?.overallAverages.academicAverage.toFixed(1) || 0}
                </p>
                <p className="text-sm text-muted-foreground">Nilai Akademik</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for different views */}
        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList>
            <TabsTrigger value="chart" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Grafik
            </TabsTrigger>
            <TabsTrigger value="radar" className="gap-2">
              <Target className="h-4 w-4" />
              Radar
            </TabsTrigger>
            <TabsTrigger value="rankings" className="gap-2">
              <Medal className="h-4 w-4" />
              Peringkat
            </TabsTrigger>
          </TabsList>

          {/* Bar Chart View */}
          <TabsContent value="chart">
            <Card>
              <CardHeader>
                <CardTitle>Perbandingan Performa Unit</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingComparison ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey="Kehadiran"
                        fill={METRIC_COLORS.attendance}
                      />
                      <Bar dataKey="Pembayaran" fill={METRIC_COLORS.payment} />
                      <Bar dataKey="Akademik" fill={METRIC_COLORS.academic} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Radar Chart View */}
          <TabsContent value="radar">
            <Card>
              <CardHeader>
                <CardTitle>Radar Performa Unit</CardTitle>
                <CardDescription>
                  Perbandingan multi-dimensi performa setiap unit
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingComparison ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <RadarChart data={radarData.slice(0, 5)}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} />
                      <Radar
                        name="Kehadiran"
                        dataKey="attendance"
                        stroke={METRIC_COLORS.attendance}
                        fill={METRIC_COLORS.attendance}
                        fillOpacity={0.3}
                      />
                      <Radar
                        name="Pembayaran"
                        dataKey="payment"
                        stroke={METRIC_COLORS.payment}
                        fill={METRIC_COLORS.payment}
                        fillOpacity={0.3}
                      />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rankings Table View */}
          <TabsContent value="rankings">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>Peringkat Unit</CardTitle>
                  <Select
                    value={selectedMetric}
                    onValueChange={setSelectedMetric}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter metrik" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      <SelectItem value="attendance">Kehadiran</SelectItem>
                      <SelectItem value="payment">Pembayaran</SelectItem>
                      <SelectItem value="tahfidz">Tahfidz</SelectItem>
                      <SelectItem value="academic">Akademik</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loadingRankings ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Peringkat</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Metrik</TableHead>
                        <TableHead className="text-right">Nilai</TableHead>
                        <TableHead>Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankings?.map((item, idx) => (
                        <TableRow key={`${item.unitId}-${item.metric}-${idx}`}>
                          <TableCell>{getRankBadge(item.rank)}</TableCell>
                          <TableCell className="font-medium">
                            {item.unitName}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              style={{
                                borderColor: METRIC_COLORS[item.metric],
                              }}
                            >
                              {METRIC_LABELS[item.metric]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.value.toFixed(1)}
                          </TableCell>
                          <TableCell>{getTrendIcon(item.trend)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
