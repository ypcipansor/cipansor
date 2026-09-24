"use client";
import { MainLayout } from "@/components/layout";

import { useGRCStats, useRiskMatrix } from "@/hooks/use-analytics";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ShieldAlert,
  TrendingUp,
  CheckCircle2,
  ClipboardCheck,
  Scale,
  Activity,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function GrcDashboardPageContent() {
  const { data: grcResponse, isLoading, error } = useGRCStats();
  const { data: riskMatrix } = useRiskMatrix();
  const grc = grcResponse?.data;

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !grc) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader
          title="Executive GRC Dashboard"
          description="Pusat Kendali Governance, Risk, and Compliance"
        />
        <Card className="mt-8 border-destructive">
          <CardContent className="pt-6">
            <p className="text-center text-destructive">
              Gagal memuat data GRC. Silakan coba lagi nanti.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const riskMatrixData = [
    {
      level: "Extreme",
      count: grc.risks.byLevel.EXTREME || 0,
      color: "bg-red-600",
    },
    {
      level: "High",
      count: grc.risks.byLevel.HIGH || 0,
      color: "bg-orange-500",
    },
    {
      level: "Medium",
      count: grc.risks.byLevel.MEDIUM || 0,
      color: "bg-yellow-400",
    },
    { level: "Low", count: grc.risks.byLevel.LOW || 0, color: "bg-green-500" },
  ];

  const summaryData = [
    {
      name: "Average Progress",
      expected: 100,
      actual: grc.plans.averageProgress,
    },
    {
      name: "Audit Resolution",
      expected: 100,
      actual: grc.audits.resolutionRate,
    },
    {
      name: "Sharia Compliance",
      expected: 100,
      actual: grc.sharia.complianceRate,
    },
  ];

  return (
    <div className="container mx-auto py-8 space-y-8">
      <PageHeader
        title="Executive GRC Dashboard"
        description="Pusat Kendali Governance, Risk, and Compliance SIM Cipansor"
      />

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium flex items-center justify-between">
              Strategic Plans <TrendingUp className="h-4 w-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl pt-2">
              {grc.plans.activeCount} Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground mt-1">
              Average Progress: {grc.plans.averageProgress}%
            </div>
            <Progress
              value={grc.plans.averageProgress}
              className="h-1 mt-2 bg-blue-100"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium flex items-center justify-between">
              Critical Risks <ShieldAlert className="h-4 w-4 text-rose-600" />
            </CardDescription>
            <CardTitle className="text-2xl pt-2">
              {grc.risks.criticalCount} Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground mt-1">
              <span className="text-rose-600 font-bold">
                {grc.risks.byLevel.EXTREME || 0} Extreme
              </span>
              , {grc.risks.byLevel.HIGH || 0} High
            </div>
            <Progress
              value={(grc.risks.criticalCount / (grc.risks.total || 1)) * 100}
              className="h-1 mt-2 bg-rose-100"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium flex items-center justify-between">
              Audit Findings{" "}
              <ClipboardCheck className="h-4 w-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl pt-2">
              {grc.audits.totalFindings} Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground mt-1">
              <span className="text-amber-600 font-bold">
                {grc.audits.unresolvedCount} Unresolved
              </span>
              , {grc.audits.resolvedCount} Resolved
            </div>
            <Progress
              value={grc.audits.resolutionRate}
              className="h-1 mt-2 bg-amber-100"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium flex items-center justify-between">
              Sharia Compliance <Scale className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl pt-2">
              {grc.sharia.complianceRate}% Compliant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Based on latest audits
            </div>
            <Progress
              value={grc.sharia.complianceRate}
              className="h-1 mt-2 bg-emerald-100"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Comparison Chart */}
        <Card className="shadow-md border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-slate-700" />
              GRC Performance Overview
            </CardTitle>
            <CardDescription>Key metrics visualization</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={summaryData}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E2E8F0"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  cursor={{ fill: "#f1f5f9" }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                />
                <Bar
                  dataKey="expected"
                  name="Target (%)"
                  fill="#94a3b8"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
                <Bar
                  dataKey="actual"
                  name="Actual (%)"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Profile */}
        <Card className="shadow-md border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-slate-700" />
              Risk Profile Distribution
            </CardTitle>
            <CardDescription>
              Breakdown of active risks by severity level
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col gap-6">
            <div className="space-y-4">
              {riskMatrixData.map((tier) => (
                <div key={tier.level} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${tier.color}`} />
                      <span className="font-medium text-slate-600">
                        {tier.level}
                      </span>
                    </div>
                    <Badge variant="outline" className="font-bold">
                      {tier.count}
                    </Badge>
                  </div>
                  <Progress
                    value={(tier.count / (grc.risks.total || 1)) * 100}
                    className="h-2"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Total Risks Tracked
                </span>
                <span className="text-xl font-bold text-slate-900">
                  {grc.risks.total}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GRC Recommendations & Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sharia Compliance Breakdown */}
        <Card className="shadow-md border-slate-200 lg:col-span-2">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-slate-700" />
              Sharia Compliance Detailed Breakdown
            </CardTitle>
            <CardDescription>Performance score by category</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Object.entries(grc.sharia.statusDistribution).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      className="p-3 rounded-xl border border-slate-100 bg-white shadow-sm flex flex-col items-center"
                    >
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        {status.replace(/_/g, " ")}
                      </span>
                      <span className="text-xl font-bold text-slate-900">
                        {count as number}
                      </span>
                    </div>
                  ),
                )}
              </div>

              {grc.sharia.summary?.byCategory && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {Object.entries(grc.sharia.summary.byCategory)
                    .filter(([, stats]: [string, any]) => stats.total > 0)
                    .map(([category, stats]: [string, any]) => (
                      <div
                        key={category}
                        className="p-4 rounded-lg border bg-slate-50/50 space-y-2"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-slate-700">
                            {category}
                          </span>
                          <Badge variant="outline" className="bg-white">
                            {stats.total} Items
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              Compliance Score
                            </span>
                            <span className="font-medium">
                              {stats.averageScore.toFixed(1)}%
                            </span>
                          </div>
                          <Progress
                            value={stats.averageScore}
                            className={`h-1.5 ${stats.averageScore >= 80 ? "bg-emerald-100" : stats.averageScore >= 50 ? "bg-yellow-100" : "bg-rose-100"}`}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Audit Suggestions Engine */}
        <Card className="shadow-md border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
              <ClipboardCheck className="h-5 w-5" />
              AI Audit Advisor
            </CardTitle>
            <CardDescription>
              Smart suggestions based on Risk module
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {grc.auditSuggestions && grc.auditSuggestions.length > 0 ? (
              <div className="space-y-4">
                {grc.auditSuggestions.map((sug: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 border rounded-lg bg-amber-50/30 border-amber-100 space-y-1"
                  >
                    <div className="flex justify-between items-start">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold text-amber-700 border-amber-200"
                      >
                        {sug.priority}
                      </Badge>
                      <span className="text-[10px] font-mono text-slate-500">
                        {sug.riskCode}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-800">
                      {sug.suggestedTitle}
                    </p>
                    <p className="text-[10px] text-slate-600 line-clamp-2">
                      {sug.suggestedDescription}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2 opacity-50" />
                <p className="text-sm text-slate-500">
                  No high-priority audits suggested.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5x5 Risk Heatmap: inherent vs residual. The Array.isArray guard
          keeps the page alive if the endpoint ever returns an unexpected
          shape (e.g. intercepted/mocked responses in e2e runs). */}
      {Array.isArray(riskMatrix?.inherent) &&
        Array.isArray(riskMatrix?.residual) && (
          <div className="grid gap-6 lg:grid-cols-2 mt-6">
            <RiskHeatmap
              title="Peta Risiko Inheren (5×5)"
              description="Sebelum mitigasi — jumlah risiko per sel likelihood × dampak"
              matrix={riskMatrix.inherent}
            />
            <RiskHeatmap
              title="Peta Risiko Residual (5×5)"
              description="Setelah mitigasi — hanya risiko yang sudah dinilai ulang"
              matrix={riskMatrix.residual}
            />
          </div>
        )}
    </div>
  );
}

const LIKELIHOOD_SHORT = [
  "Jarang",
  "Kecil",
  "Mungkin",
  "Besar",
  "Hampir Pasti",
];
const IMPACT_SHORT = ["Minimal", "Minor", "Moderat", "Mayor", "Katastrofik"];

function heatCellClass(likelihoodIndex: number, impactIndex: number): string {
  const score = (likelihoodIndex + 1) * (impactIndex + 1);
  if (score >= 15) return "bg-red-500/80 text-white";
  if (score >= 8) return "bg-orange-400/80 text-white";
  if (score >= 4) return "bg-yellow-300/80 text-slate-800";
  return "bg-emerald-300/70 text-slate-800";
}

function RiskHeatmap({
  title,
  description,
  matrix,
}: {
  title: string;
  description: string;
  matrix: number[][];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs">
            <tbody>
              {/* Rows: likelihood from highest to lowest for conventional layout */}
              {[4, 3, 2, 1, 0].map((li) => (
                <tr key={li}>
                  <td className="pr-2 text-right text-[10px] text-muted-foreground whitespace-nowrap">
                    {LIKELIHOOD_SHORT[li]}
                  </td>
                  {matrix[li]?.map((count, im) => (
                    <td key={im} className="p-1">
                      <div
                        className={`h-10 rounded flex items-center justify-center font-bold ${heatCellClass(li, im)} ${count === 0 ? "opacity-30" : ""}`}
                      >
                        {count > 0 ? count : ""}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td />
                {IMPACT_SHORT.map((label) => (
                  <td
                    key={label}
                    className="pt-1 text-[10px] text-muted-foreground"
                  >
                    {label}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GrcDashboardPageWithShell() {
  return (
    <MainLayout>
      <GrcDashboardPageContent />
    </MainLayout>
  );
}
