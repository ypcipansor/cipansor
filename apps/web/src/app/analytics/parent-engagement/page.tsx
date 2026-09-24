"use client";

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
import { Users, Heart, Clock, CreditCard, AlertCircle } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useParentEngagement } from "@/hooks/use-analytics";

function lowEngagementReason(daysSinceLogin: number | null): string {
  if (daysSinceLogin === null) return "Tidak pernah login";
  return `Tidak login ${daysSinceLogin} hari`;
}

export default function ParentEngagementPage() {
  const { data, isLoading } = useParentEngagement();

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN"]}>
      <div className="space-y-6">
        <PageHeader
          title="Metrik Engagement Orang Tua"
          description="Analisis keterlibatan orang tua dalam sistem (aktivitas 30 hari terakhir)"
        />

        {isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/20 rounded-lg">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Orang Tua Aktif
                      </p>
                      <p className="text-2xl font-bold">
                        {data.summary.activeParents}/{data.summary.totalParents}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <Heart className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Engagement Rate
                      </p>
                      <p className="text-2xl font-bold">
                        {data.summary.engagementRate}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <Clock className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Rata-rata Respon Pesan
                      </p>
                      <p className="text-2xl font-bold">
                        {data.summary.avgResponseHours !== null
                          ? `${data.summary.avgResponseHours} jam`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-100 rounded-lg">
                      <CreditCard className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Tagihan 90 Hari (Lunas/Berjalan/Nunggak)
                      </p>
                      <p className="text-xl font-bold">
                        <span className="text-green-600">
                          {data.invoiceStatus.paid}
                        </span>
                        {" / "}
                        <span>{data.invoiceStatus.pending}</span>
                        {" / "}
                        <span className="text-red-600">
                          {data.invoiceStatus.overdue}
                        </span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Weekly Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Aktivitas 7 Hari Terakhir</CardTitle>
                  <CardDescription>
                    Pesan terkirim dan notifikasi dibaca oleh orang tua
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.weeklyActivity}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="messages" name="Pesan" fill="#6366f1" />
                        <Bar
                          dataKey="notificationsRead"
                          name="Notifikasi Dibaca"
                          fill="#22c55e"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Class Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Engagement per Kelas</CardTitle>
                  <CardDescription>
                    Persentase orang tua yang aktif login per kelas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.classBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada data kelas.
                    </p>
                  ) : (
                    data.classBreakdown.map((item) => (
                      <div key={item.classId} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {item.className}{" "}
                            <span className="text-muted-foreground">
                              ({item.activeParents}/{item.parents})
                            </span>
                          </span>
                          <span
                            className={cn(
                              "font-bold",
                              item.engagement >= 85
                                ? "text-green-600"
                                : item.engagement >= 75
                                  ? "text-amber-600"
                                  : "text-red-600",
                            )}
                          >
                            {item.engagement}%
                          </span>
                        </div>
                        <Progress value={item.engagement} className="h-2" />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Low Engagement Alert */}
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="h-5 w-5" />
                  Perlu Perhatian
                </CardTitle>
                <CardDescription>
                  Orang tua dengan engagement rendah perlu di-follow up
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.lowEngagement.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Semua orang tua aktif dalam 30 hari terakhir. 🎉
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.lowEngagement.map((parent) => (
                      <div
                        key={parent.parentId}
                        className="flex items-center justify-between p-3 bg-white rounded-lg border"
                      >
                        <div>
                          <p className="font-medium">{parent.parentName}</p>
                          <p className="text-sm text-muted-foreground">
                            Anak: {parent.childName}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-amber-700">
                          {lowEngagementReason(parent.daysSinceLogin)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
