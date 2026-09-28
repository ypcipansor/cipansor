"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Home,
  AlertCircle,
  HeartPulse,
  Users,
  Activity,
  ShieldCheck,
  Clock,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { MainLayout } from "@/components/layout";
import Link from "next/link";
import {
  usePermits,
  usePermitSummary,
  PERMIT_TYPE_LABELS,
  PERMIT_PHASES,
  permitPhase,
} from "@/hooks/use-permits";

function BoardingCommandCenterContent() {
  const { data: dormitoriesResponse, isLoading } = useQuery({
    queryKey: ["boarding-overview"],
    queryFn: async () => {
      const response = await api.get("/dormitories");
      return response.data.data;
    },
  });
  const dormitories = dormitoriesResponse;
  const { data: permitSummary } = usePermitSummary();
  const { data: outsidePermits, isLoading: outsideLoading } = usePermits({
    outside: "true",
    limit: 50,
  });

  return (
    <div className="container mx-auto py-8 space-y-8">
      <PageHeader
        title="Boarding Command Center"
        description="Monitoring integrasi asrama: Keamanan, Kesehatan, dan Kedisiplinan"
      />

      {/*
        NOTE: Several metrics on this dashboard (Social Harmony Score,
        capacity %, urgent alerts count, and the health condition summary)
        are still wired to placeholder values while the corresponding
        backend endpoints are being built. They are surfaced under the
        "Preview" label below so users do not mistake them for live data.
        The permit card and tab are live (GET /permits/summary, /permits).
      */}
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        <strong>Preview:</strong> beberapa metrik (Social Harmony Score,
        kapasitas, jumlah alert, ringkasan kesehatan) masih berupa data contoh.
        Daftar asrama dan perizinan ditarik langsung.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900 text-white border-none overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400 text-xs uppercase font-bold tracking-widest">
              System Status
            </CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
              All Zones Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[10px] font-bold"
                  >
                    M{i}
                  </div>
                ))}
              </div>
              <span className="text-xs text-slate-400">4 Musyrif on Duty</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-rose-500 uppercase">
              Alerts
            </CardDescription>
            <CardTitle className="text-2xl">3 Urgent Items</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            2 Sakit, 1 Pelanggaran Berat dalam 24 jam terakhir.
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-blue-500 uppercase">
              Perizinan
            </CardDescription>
            <CardTitle className="text-2xl">
              {permitSummary ? `${permitSummary.outside} di luar` : "…"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {permitSummary
              ? `${permitSummary.overdue} terlambat kembali, ${permitSummary.awaitingMe} menunggu keputusan Anda.`
              : "Memuat…"}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="harmony" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="harmony" className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Harmony
          </TabsTrigger>
          <TabsTrigger value="permits" className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Perizinan
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4" /> Kesehatan
          </TabsTrigger>
          <TabsTrigger value="violations" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Disiplin
          </TabsTrigger>
        </TabsList>

        <TabsContent value="harmony" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading
              ? [1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-48 rounded-xl bg-slate-100 animate-pulse"
                  />
                ))
              : dormitories?.map((dorm: any) => (
                  <Card
                    key={dorm.id}
                    className="hover:shadow-md transition-all cursor-pointer group"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <Badge variant="secondary" className="text-[10px]">
                          {dorm.code}
                        </Badge>
                        <div className="text-right">
                          <div className="text-lg font-bold text-slate-800">
                            {dorm.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {dorm.gender} Zone
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span>Social Harmony Score</span>
                          <span className="text-emerald-600 font-bold">
                            84%
                          </span>
                        </div>
                        <Progress value={84} className="h-1.5 bg-emerald-50" />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-slate-50 border border-slate-100 flex items-center gap-2">
                          <Users className="h-3 w-3 text-slate-400" />
                          <div className="text-[10px] font-bold text-slate-600">
                            {dorm._count.rooms} Rooms
                          </div>
                        </div>
                        <div className="p-2 rounded bg-slate-50 border border-slate-100 flex items-center gap-2">
                          <Home className="h-3 w-3 text-slate-400" />
                          <div className="text-[10px] font-bold text-slate-600">
                            82% Cap.
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-primary font-bold">
                          Open Analytics
                        </span>
                        <ExternalLink className="h-3 w-3 text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>
        </TabsContent>

        <TabsContent value="permits" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Log Perizinan Aktif</CardTitle>
              <CardDescription>
                Santri yang saat ini berada di luar asrama
              </CardDescription>
            </CardHeader>
            <CardContent>
              {outsideLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Memuat…
                </div>
              ) : !outsidePermits?.data.length ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Tidak ada yang sedang di luar.
                </div>
              ) : (
                <ul className="divide-y">
                  {outsidePermits.data.map((permit) => {
                    const phase = PERMIT_PHASES[permitPhase(permit)];
                    return (
                      <li key={permit.id}>
                        <Link
                          href={`/permits/${permit.id}`}
                          className="flex items-center justify-between gap-4 py-3 hover:bg-muted/50"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {permit.student.user.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {PERMIT_TYPE_LABELS[permit.type]} · kembali{" "}
                              {new Date(permit.endDate).toLocaleString(
                                "id-ID",
                                {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </p>
                          </div>
                          <Badge className={phase.className}>
                            {phase.label}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm">Kondisi Umum</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Sehat", count: 245, color: "bg-emerald-500" },
                  {
                    label: "Sakit (Istirahat)",
                    count: 4,
                    color: "bg-yellow-500",
                  },
                  { label: "Rujukan RS", count: 0, color: "bg-rose-500" },
                ].map((i) => (
                  <div
                    key={i.label}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${i.color}`} />
                      <span className="text-xs">{i.label}</span>
                    </div>
                    <span className="text-xs font-bold">{i.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle className="text-sm">Catatan Medis Terbaru</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center p-3 rounded-lg border bg-slate-50/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-white border flex items-center justify-center">
                          <HeartPulse className="h-4 w-4 text-rose-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold">Santri ID-00{i}</p>
                          <p className="text-[10px] text-muted-foreground tracking-tight">
                            Gejala: Demam & Pusing • 2 Jam yang lalu
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-white">
                        Monitoring
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BoardingCommandCenter() {
  return (
    <MainLayout>
      <BoardingCommandCenterContent />
    </MainLayout>
  );
}
