"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldAlert,
  ClipboardCheck,
  Award,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Pie,
  PieChart,
} from "recharts";
import { MainLayout } from "@/components/layout";

function GRCDashboardPageContent() {
  // In a real application, these would be separate API calls or a combined analytics endpoint
  const { data: risks, isLoading: loadingRisks } = useQuery({
    queryKey: ["risks"],
    queryFn: async () => {
      const res = await api.get("/api/risks");
      return res.data.data || [];
    },
  });

  const { data: audits, isLoading: loadingAudits } = useQuery({
    queryKey: ["internal-audits"],
    queryFn: async () => {
      const res = await api.get("/api/internal-audits");
      return res.data.data || [];
    },
  });

  const { data: quality, isLoading: loadingQuality } = useQuery({
    queryKey: ["quality-audits"],
    queryFn: async () => {
      const res = await api.get("/api/quality/audits");
      return res.data.data || [];
    },
  });

  const isLoading = loadingRisks || loadingAudits || loadingQuality;

  // Process Risk Data
  const riskLevels = [
    {
      name: "Extreme",
      count: risks?.filter((r: any) => r.riskLevel === "EXTREME").length || 0,
      color: "#e11d48",
    },
    {
      name: "High",
      count: risks?.filter((r: any) => r.riskLevel === "HIGH").length || 0,
      color: "#f59e0b",
    },
    {
      name: "Medium",
      count: risks?.filter((r: any) => r.riskLevel === "MEDIUM").length || 0,
      color: "#3b82f6",
    },
    {
      name: "Low",
      count: risks?.filter((r: any) => r.riskLevel === "LOW").length || 0,
      color: "#10b981",
    },
  ];

  // Process Audit Data
  const auditStatus = [
    {
      name: "Completed",
      value: audits?.filter((a: any) => a.status === "COMPLETED").length || 0,
      color: "#10b981",
    },
    {
      name: "Ongoing",
      value: audits?.filter((a: any) => a.status === "IN_PROGRESS").length || 0,
      color: "#3b82f6",
    },
    {
      name: "Planned",
      value: audits?.filter((a: any) => a.status === "PLANNED").length || 0,
      color: "#94a3b8",
    },
  ];

  const totalAudits = audits?.length || 0;
  const totalRisks = risks?.length || 0;
  const criticalRisks =
    risks?.filter(
      (r: any) => r.riskLevel === "EXTREME" || r.riskLevel === "HIGH",
    ).length || 0;

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="GRC Dashboard"
        description="Governance, Risk, and Compliance - Pemantauan risiko dan kepatuhan unit."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <ShieldAlert className="w-4 h-4" /> Total Identifikasi Risiko
            </CardDescription>
            <CardTitle className="text-3xl">{totalRisks}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              <span className="text-rose-600 font-bold">{criticalRisks}</span>{" "}
              risiko level tinggi/ekstrim
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <ClipboardCheck className="w-4 h-4" /> Audit Internal (SPI)
            </CardDescription>
            <CardTitle className="text-3xl">{totalAudits}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {audits?.filter((a: any) => a.status === "COMPLETED").length || 0}{" "}
              dari {totalAudits} selesai
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Award className="w-4 h-4" /> Penjaminan Mutu (SPMI)
            </CardDescription>
            <CardTitle className="text-3xl">{quality?.length || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Monitoring 8 Standar Nasional Pendidikan
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Distribusi
              Level Risiko
            </CardTitle>
            <CardDescription>
              Visualisasi tingkat keparahan risiko yang teridentifikasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskLevels}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {riskLevels.map((level, index) => (
                    <Cell key={`cell-${index}`} fill={level.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" /> Status
              Pelaksanaan Audit
            </CardTitle>
            <CardDescription>
              Progres penyelesaian jadwal audit internal unit.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={auditStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {auditStatus.map((status, index) => (
                    <Cell key={`cell-${index}`} fill={status.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 ml-4">
              {auditStatus.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>
                    {s.name}: {s.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Temuan Audit & Tindak Lanjut
          </CardTitle>
          <CardDescription>
            Ringkasan temuan yang memerlukan perhatian manajemen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {audits?.slice(0, 3).map((audit: any) => (
              <div
                key={audit.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm">{audit.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Tipe: {audit.auditType} • Tanggal:{" "}
                    {new Date(audit.plannedDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Temuan</p>
                    <p className="text-sm font-bold">
                      {audit.findings?.length || 0}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm font-medium">{audit.status}</p>
                  </div>
                </div>
              </div>
            ))}
            {(!audits || audits.length === 0) && (
              <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
                <Info className="w-8 h-8 opacity-20" />
                <p>Tidak ada data audit yang tersedia.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GRCDashboardPage() {
  return (
    <MainLayout>
      <GRCDashboardPageContent />
    </MainLayout>
  );
}
