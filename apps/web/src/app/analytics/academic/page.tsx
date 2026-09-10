"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Users,
  Search,
  ChevronRight,
  Loader2,
  GraduationCap,
  ShieldAlert,
  ArrowUpRight
} from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { useActiveAcademicYear } from "@/hooks/use-academic-years";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layout";

function AcademicInterventionDashboardContent() {
  const { user } = useAuth();
  const unitId = user?.unitId;
  const { data: activeYear } = useActiveAcademicYear();

  const { data: alertsResponse, isLoading } = useQuery({
    queryKey: ["integrated-risk-alerts", activeYear?.id, unitId],
    queryFn: async () => {
      const response = await api.get(
        `/assessment/analytics/integrated-alerts?academicYearId=${activeYear?.id}&unitId=${unitId}`,
      );
      return response.data.data;
    },
    enabled: !!activeYear?.id && !!unitId,
  });

  return (
    <div className="container mx-auto py-8 space-y-8">
      <PageHeader
        title="Pusat Intervensi Akademik & Karakter"
        description="Identifikasi santri yang memerlukan pendampingan khusus berbasis data holistik"
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-rose-50 border-rose-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-rose-800 text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Priority Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-rose-600">{alertsResponse?.length || 0}</div>
            <p className="text-[10px] text-rose-700 uppercase font-bold mt-1">Santri Berisiko Tinggi</p>
          </CardContent>
        </Card>

        {/* Helper Cards */}
        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
           <Card className="flex items-center p-4 gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <GraduationCap className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold">Kriteria Akademik</p>
                <p className="text-xs text-muted-foreground">Nilai rata-rata mapel di bawah 70% atau penurunan tren signifikan.</p>
              </div>
           </Card>
           <Card className="flex items-center p-4 gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold">Kriteria Kedisiplinan</p>
                <p className="text-xs text-muted-foreground">Akumulasi poin pelanggaran {'>'} 50 atau tingkat kehadiran {'<'} 85%.</p>
              </div>
           </Card>
        </div>
      </div>

      <Card className="shadow-md">
        <CardHeader className="border-b bg-slate-50/50">
          <CardTitle>Daftar Santri Prioritas Pendampingan</CardTitle>
          <CardDescription>Berdasarkan analisis lintas modul (Akademik, Tahfidz, dan Karakter)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Menjalankan mesin analitik holistik...</p>
            </div>
          ) : alertsResponse && alertsResponse.length > 0 ? (
            <div className="divide-y">
              {alertsResponse.map((student: any) => (
                <div key={student.studentId} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 flex items-center gap-2">
                        {student.name}
                        {student.priority === 'CRITICAL' && <Badge variant="destructive" className="text-[9px] h-4">CRITICAL</Badge>}
                      </h4>
                      <p className="text-xs text-muted-foreground">NISN: {student.nisn} • Holistic Score: <span className="font-bold text-slate-700">{student.score}</span></p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {student.alerts.map((alert: string) => (
                      <Badge key={alert} variant="outline" className="bg-white text-[10px] border-amber-200 text-amber-700">
                        {alert}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs" asChild>
                      <Link href={`/students/${student.studentId}/360`}>
                        Lihat Student 360 <ArrowUpRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                    <Button size="sm" className="text-xs">
                      Tindak Lanjut BK
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Tidak ada santri yang masuk dalam kategori prioritas intervensi saat ini.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-4">
         <div className="p-2 bg-blue-600 rounded-lg text-white">
           <GraduationCap className="h-5 w-5" />
         </div>
         <div>
           <h4 className="text-sm font-bold text-blue-900">Standard Operasional Prosedur (SOP) Intervensi</h4>
           <p className="text-xs text-blue-800 mt-1 leading-relaxed opacity-80">
             Sesuai dengan Best Practice Manajemen Boarding School, santri dengan status <b>CRITICAL</b> wajib mendapatkan sesi konseling psikologis
             dalam waktu maksimal 2x24 jam dan pemberitahuan formal kepada orang tua melalui Portal Wali Murid.
           </p>
         </div>
      </div>
    </div>
  );
}

export default function AcademicInterventionDashboard() {
  return (
    <MainLayout>
      <AcademicInterventionDashboardContent />
    </MainLayout>
  );
}
