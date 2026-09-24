"use client";

import { useMarketingROI } from "@/hooks/use-analytics";
import { usePriorityLeads } from "@/hooks/use-admissions";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MainLayout } from "@/components/layout";
import {
  TrendingUp,
  Users,
  Target,
  Loader2,
  PieChart as PieIcon,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function AdmissionsAnalyticsPageContent() {
  const { data: roiResponse, isLoading: loadingROI } = useMarketingROI();
  const { data: priorityResponse, isLoading: loadingPriority } =
    usePriorityLeads();

  const roiData = roiResponse?.data || [];
  const priorityLeads = priorityResponse?.data || [];

  return (
    <div className="container mx-auto py-8 space-y-8">
      <PageHeader
        title="Admission & Marketing Analytics"
        description="Analisis konversi pendaftaran dan efektivitas kampanye pemasaran"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">
                Campaign Performance (ROI)
              </CardTitle>
              <CardDescription>
                Pendapatan vs Biaya per Kampanye
              </CardDescription>
            </div>
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent className="h-[350px]">
            {loadingROI ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roiData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      `Rp ${Number(value).toLocaleString()}`,
                      name,
                    ]}
                  />
                  <Legend />
                  <Bar
                    dataKey="metrics.revenue"
                    name="Revenue"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="metrics.cost"
                    name="Cost"
                    fill="#94a3b8"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lead Scoring Filter</CardTitle>
            <CardDescription>
              Pendaftar paling potensial (High-Quality Leads)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPriority ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            ) : (
              <div className="space-y-4">
                {priorityLeads.slice(0, 5).map((lead: any) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between p-2 rounded border bg-slate-50/50"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <div className="text-xs">
                        <p className="font-bold">{lead.fullName}</p>
                        <p className="text-muted-foreground">
                          {lead.registrationNo}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-black"
                    >
                      {lead.leadScore}
                    </Badge>
                  </div>
                ))}
                <div className="pt-4 mt-4 border-t text-[10px] text-muted-foreground italic">
                  *Score dihitung berdasarkan kelengkapan berkas, riwayat
                  kunjungan, dan kemampuan Al-Quran.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Funnel Konversi</CardTitle>
            <CardDescription>
              Dari Pendaftar hingga Menjadi Siswa
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loadingROI ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={roiData.map((r: any) => ({
                      name: r.name,
                      value: r.metrics.convertedStudents,
                    }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${((percent || 0) * 100).toFixed(0)}%`
                    }
                  >
                    {roiData.map((_: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Efektivitas Biaya</CardTitle>
            <CardDescription>
              Cost Per Acquisition (CPA) per Kampanye
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {roiData.map((item: any, idx: number) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="font-bold">
                      Rp {item.metrics.costPerAcquisition.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, (item.metrics.revenue / (item.metrics.cost || 1)) * 10)}\%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdmissionsAnalyticsPage() {
  return (
    <MainLayout>
      <AdmissionsAnalyticsPageContent />
    </MainLayout>
  );
}
