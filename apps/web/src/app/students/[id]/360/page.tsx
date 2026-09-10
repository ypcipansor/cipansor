"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  User,
  GraduationCap,
  HeartPulse,
  ShieldAlert,
  Wallet,
  LineChart,
  AlertTriangle,
  CheckCircle2,
  FileText
} from "lucide-react";
import { useStudent } from "@/hooks/use-students";
import { useStudentGrades, useStudentHolisticAnalytics } from "@/hooks/use-assessment";
import { useActiveAcademicYear } from "@/hooks/use-academic-years";
import { useStudentHealthRecords } from "@/hooks/use-health";
import { useStudentViolationSummary } from "@/hooks/use-violations";
import { useStudentFinancialSummary } from "@/hooks/use-finance";
import { useStudentTahfidzProgress } from "@/hooks/use-tahfidz";
import { useStudentIbadahStats } from "@/hooks/use-ibadah";
import { useStudentRoomAssignment, useRoomSocialAnalytics } from "@/hooks/use-dormitory";
import { MainLayout } from "@/components/layout";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

function Student360PageContent() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;

  const { data: student, isLoading: loadingStudent } = useStudent(studentId);
  const { data: grades, isLoading: loadingGrades } = useStudentGrades(studentId);
  const { data: health, isLoading: loadingHealth } = useStudentHealthRecords(studentId);
  const { data: violations, isLoading: loadingViolations } = useStudentViolationSummary(studentId);
  const { data: finance, isLoading: loadingFinance } = useStudentFinancialSummary(studentId);
  const { data: tahfidz, isLoading: loadingTahfidz } = useStudentTahfidzProgress(studentId);
  const { data: roomAssignment, isLoading: loadingRoom } = useStudentRoomAssignment(studentId);
  const { data: socialAnalytics, isLoading: loadingSocial } = useRoomSocialAnalytics(roomAssignment?.roomId || "");

  // Fallback to active academic year when student.currentClass.academicYear is not populated
  const { data: activeYear } = useActiveAcademicYear();
  const academicYearId = student?.currentClass?.academicYear?.id || activeYear?.id || "";

  // New Education Enhancement Hooks
  const { data: holistic, isLoading: loadingHolistic } = useStudentHolisticAnalytics(studentId, academicYearId);
  const { data: ibadah, isLoading: loadingIbadah } = useStudentIbadahStats({ studentId });

  // Only gate on primary data — holistic and ibadah are supplementary and
  // should not block the entire page from rendering.
  const isLoading = loadingStudent || loadingGrades || loadingHealth || loadingViolations || loadingFinance || loadingTahfidz;

  const academicData = useMemo(() => {
    if (!Array.isArray(grades) || grades.length === 0) return [];
    return grades.slice(0, 5).map((g: any) => ({
      name: g.subject?.name || "Unknown",
      score: Number(g.score)
    }));
  }, [grades]);

  // useStudentViolationSummary returns the summary object with totalPoints and recentViolations
  const violationTotalPoints = violations?.totalPoints ?? 0;
  const recentViolations = violations?.recentViolations ?? [];

  const holisticRadarData = useMemo(() => {
    if (!holistic?.breakdown) return [];
    // Only include dimensions that have actual data (non-null).
    // This prevents the radar chart from showing misleading 0 for dimensions
    // where no records exist yet (e.g., a new student).
    return [
      { subject: 'Akademik', A: holistic.breakdown.academic, fullMark: 100 },
      { subject: 'Tahfidz', A: holistic.breakdown.tahfidz, fullMark: 100 },
      { subject: 'Karakter', A: holistic.breakdown.behavior, fullMark: 100 },
      { subject: 'Kehadiran', A: holistic.breakdown.attendance, fullMark: 100 },
      { subject: 'Ibadah', A: holistic.breakdown.ibadah, fullMark: 100 },
    ].filter(d => d.A !== null && d.A !== undefined);
  }, [holistic]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="container mx-auto py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Santri Tidak Ditemukan</h2>
        <Button onClick={() => router.back()}>Kembali</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Button variant="ghost" className="mb-2 -ml-4" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Kembali ke Profil
      </Button>

      <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 rounded-full bg-slate-200 flex items-center justify-center border-4 border-white shadow-sm overflow-hidden">
             {student.photoUrl ? (
               <Image
                 src={student.photoUrl}
                 alt={student.name || "Student Photo"}
                 fill
                 className="object-cover"
               />
             ) : (
               <User className="h-10 w-10 text-slate-400" />
             )}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{student.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{student.nisn}</Badge>
              <Badge variant="secondary">{student.unit?.name}</Badge>
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">AKTIF</Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:flex gap-3 w-full md:w-auto">
          <Card className="flex-1 md:w-32 bg-slate-50 border-none shadow-none">
            <CardContent className="p-3 text-center">
               <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Poin Pelanggaran</p>
               <p className={`text-xl font-bold mt-1 ${violationTotalPoints > 50 ? 'text-rose-600' : 'text-slate-900'}`}>
                 {violationTotalPoints}
               </p>
            </CardContent>
          </Card>
          <Card className="flex-1 md:w-32 bg-slate-50 border-none shadow-none">
            <CardContent className="p-3 text-center">
               <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Hafalan (Juz)</p>
               <p className="text-xl font-bold mt-1 text-indigo-600">{tahfidz?.summary?.juzCoveredCount || 0}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Column - Quick Stats & Info */}
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <FileText className="w-4 h-4" /> Informasi Dasar
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs font-medium">Tempat, Tgl Lahir</span>
                <span>{student.birthPlace}, {new Date(student.birthDate).toLocaleDateString('id-ID')}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs font-medium">Wali Santri</span>
                <span>{student.parentName}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs font-medium">Telepon Wali</span>
                <span className="font-mono">{student.parentPhone}</span>
              </div>
              <div className="pt-3 border-t">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium">Kesehatan (Status)</span>
                  <Badge className="bg-emerald-50 text-emerald-700 text-[10px] h-5">SEHAT</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium">Keuangan (Saldo)</span>
                  <span className="text-xs font-bold">Rp {Number(finance?.totalOutstanding || 0).toLocaleString('id-ID')}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-600 text-white overflow-hidden relative">
            <CardContent className="p-4 relative z-10">
              <div className="flex items-center gap-2 mb-4 opacity-80 text-xs font-bold uppercase tracking-wider">
                <GraduationCap className="w-4 h-4" /> Academic Snapshot
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Average Score</span>
                    <span className="font-bold">{holistic?.breakdown?.academic ?? '—'}</span>
                  </div>
                  <Progress value={holistic?.breakdown?.academic ?? 0} className="h-1.5 bg-blue-400" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center pt-2">
                  <div className="bg-blue-500/50 rounded-lg p-2">
                    <p className="text-[10px] opacity-70">Att. Rate</p>
                    <p className="text-lg font-bold">{holistic?.breakdown?.attendance != null ? `${Math.round(holistic.breakdown.attendance)}%` : '—'}</p>
                  </div>
                  <div className="bg-blue-500/50 rounded-lg p-2">
                    <p className="text-[10px] opacity-70">Holistic</p>
                    <p className="text-lg font-bold">{holistic?.holisticScore ?? '—'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
            <div className="absolute -bottom-4 -right-4 opacity-20">
              <LineChart className="w-24 h-24" />
            </div>
          </Card>
        </div>

        {/* Right Column - Main Dashboard */}
        <div className="md:col-span-3">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-8 bg-slate-100/50 mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="academic">Akademik</TabsTrigger>
              <TabsTrigger value="tahfidz">Tahfidz</TabsTrigger>
              <TabsTrigger value="behavior">Karakter</TabsTrigger>
              <TabsTrigger value="counseling">Konseling</TabsTrigger>
              <TabsTrigger value="health">Kesehatan</TabsTrigger>
              <TabsTrigger value="ibadah">Ibadah</TabsTrigger>
              <TabsTrigger value="boarding">Asrama</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Holistic Recommendation Card */}
              {loadingHolistic && (
                <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-100">
                  <CardContent className="flex justify-center py-12">
                    <Skeleton className="h-[200px] w-full" />
                  </CardContent>
                </Card>
              )}
              {!loadingHolistic && holistic && (
                <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-indigo-900 flex items-center gap-2">
                      <LineChart className="w-5 h-5" />
                      Analisis Perkembangan Holistik
                    </CardTitle>
                    <CardDescription className="text-indigo-700 font-medium flex items-center gap-2">
                      Status: {holistic.interpretation}
                      {holistic.dataCompleteness === 'PARTIAL' && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">Data Sebagian</Badge>
                      )}
                      {holistic.dataCompleteness === 'INSUFFICIENT' && (
                        <Badge variant="outline" className="text-rose-600 border-rose-300 text-[10px]">Data Tidak Cukup</Badge>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                      <div className="h-[200px] w-full md:w-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={holisticRadarData}>
                            <PolarGrid stroke="#94a3b8" />
                            <PolarAngleAxis dataKey="subject" tick={{fontSize: 10, fill: '#475569'}} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} hide />
                            <Radar
                              name="Santri"
                              dataKey="A"
                              stroke="#4f46e5"
                              fill="#6366f1"
                              fillOpacity={0.6}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-3">
                         <div className="p-4 bg-white rounded-xl border border-indigo-100 shadow-sm">
                            <h4 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Rekomendasi Pengembangan
                            </h4>
                            <p className="text-sm text-slate-600 italic leading-relaxed">
                              "{holistic.recommendation || 'Pertahankan prestasi dan terus kembangkan potensi diri di segala aspek.'}"
                            </p>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                            <div className="text-center p-2 rounded-lg bg-indigo-100/50">
                               <p className="text-[10px] text-indigo-700 font-bold uppercase">Skor Global</p>
                               <p className="text-xl font-black text-indigo-900">{holistic.holisticScore}</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-emerald-100/50">
                               <p className="text-[10px] text-emerald-700 font-bold uppercase">Potensi</p>
                               <p className="text-xl font-black text-emerald-900">
                               {holistic.dataCompleteness === 'INSUFFICIENT' ? '—' : holistic.holisticScore >= 80 ? 'Tinggi' : holistic.holisticScore >= 60 ? 'Sedang' : 'Perlu Perhatian'}
                             </p>
                            </div>
                         </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Academic Performance Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top 5 Performa Mapel</CardTitle>
                    <CardDescription>Skor penilaian terbaru</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[250px] pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={academicData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Health & Growth Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Status Kesehatan & Nutrisi</CardTitle>
                    <CardDescription>Pemeriksaan rutin terakhir</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-emerald-600 shadow-sm font-bold">
                          {student.bloodType || '—'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-800">GOLONGAN DARAH</p>
                          <p className="text-xs text-emerald-600">{student.bloodType ? 'Tercatat' : 'Belum tercatat'}</p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-600">{Array.isArray(health) && health.length > 0 ? 'TERCATAT' : 'SEHAT'}</Badge>
                    </div>

                    <div className="text-center p-4 border rounded-lg bg-slate-50">
                      <p className="text-xs text-muted-foreground">
                        {Array.isArray(health) && health.length > 0
                          ? `${health.length} kunjungan medis tercatat`
                          : 'Belum ada data pemeriksaan rutin'}
                      </p>
                    </div>

                    <div className="p-3 border rounded-lg bg-slate-50">
                       <p className="text-xs font-bold flex items-center gap-2 mb-1">
                         <ShieldAlert className="w-3 h-3 text-rose-500" /> Riwayat Alergi
                       </p>
                       <p className="text-xs text-muted-foreground">{student.specialNeeds || 'Tidak ada data alergi tercatat'}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Financial & Compliance Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card className="border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                       <CardTitle className="text-base flex items-center gap-2">
                         <AlertTriangle className="w-4 h-4 text-amber-500" /> Pelanggaran Terkini
                       </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                       {recentViolations.length > 0 ? (
                         <div className="divide-y">
                           {recentViolations.slice(0, 3).map((v: any) => (
                             <div key={v.id} className="p-3 px-6 flex justify-between items-center text-sm">
                                <div>
                                  <p className="font-semibold">{v.category}</p>
                                  <p className="text-xs text-muted-foreground line-clamp-1">{v.description}</p>
                                </div>
                                <Badge variant="outline" className="text-rose-600 border-rose-200">-{v.points}</Badge>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <div className="p-8 text-center text-muted-foreground text-xs">
                           <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
                           Belum ada rekaman pelanggaran.
                         </div>
                       )}
                    </CardContent>
                 </Card>

                 <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                       <CardTitle className="text-base flex items-center gap-2">
                         <Wallet className="w-4 h-4 text-blue-500" /> Status Keuangan
                       </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                       <div className="flex justify-between items-center mb-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Tunggakan Aktif</p>
                            <p className="text-2xl font-bold text-rose-600">Rp {Number(finance?.totalOutstanding || 0).toLocaleString('id-ID')}</p>
                          </div>
                          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                       </div>
                       <Button size="sm" variant="outline" className="w-full text-xs" asChild>
                         <a href={`/finance/invoices?studentId=${studentId}`}>Lihat Semua Tagihan</a>
                       </Button>
                    </CardContent>
                 </Card>
              </div>
            </TabsContent>

            <TabsContent value="academic">
               <Card>
                 <CardHeader>
                   <CardTitle>Buku Raport & Penilaian</CardTitle>
                   <CardDescription>Histori nilai per semester</CardDescription>
                 </CardHeader>
                 <CardContent>
                   <p className="text-sm text-muted-foreground py-10 text-center">Modul Akademik Lengkap dalam Pengembangan.</p>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="tahfidz">
               <Card>
                 <CardHeader>
                   <CardTitle>Progres Hafalan Al-Qur'an</CardTitle>
                   <CardDescription>Monitoring Ziyadah & Murojaah</CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-6">
                   <div className="flex justify-between items-end">
                      <div>
                        <p className="text-3xl font-bold text-indigo-700">{tahfidz?.summary?.juzCoveredCount || 0} <span className="text-sm font-normal text-slate-500">Juz</span></p>
                        <p className="text-xs text-muted-foreground">Total Hafalan Saat Ini</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">Target: 30 Juz</p>
                        <Progress value={((tahfidz?.summary?.juzCoveredCount || 0) / 30) * 100} className="h-2 w-32 mt-1" />
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(["ZIYADAH", "MUROJAAH"] as const).map((type) => {
                        const latest = tahfidz?.recentRecords?.find(
                          (r: any) => r.activityType === type,
                        );
                        return (
                          <div key={type} className="p-4 border rounded-xl bg-slate-50">
                            <h5 className="text-xs font-bold uppercase mb-3 text-slate-500">
                              {type === "ZIYADAH" ? "Ziyadah Terakhir" : "Murojaah Terakhir"}
                            </h5>
                            {latest ? (
                              <>
                                <p className="text-sm font-bold">
                                  {latest.surahName}: {latest.ayahStart}-{latest.ayahEnd} (Juz {latest.juz})
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {new Date(latest.recordedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                  {latest.recordedBy?.name ? ` • Oleh: ${latest.recordedBy.name}` : ""}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs italic text-muted-foreground">Belum ada catatan.</p>
                            )}
                          </div>
                        );
                      })}
                   </div>

                   {tahfidz?.estimation && (
                     <div className="p-4 border rounded-xl bg-indigo-50/50 border-indigo-100">
                       <h5 className="text-xs font-bold uppercase mb-2 text-indigo-600">Estimasi Khatam 30 Juz</h5>
                       {tahfidz.estimation.status === "COMPLETED" ? (
                         <p className="text-sm font-bold text-emerald-700">Alhamdulillah, hafalan 30 juz telah selesai.</p>
                       ) : tahfidz.estimation.status === "PROJECTED" ? (
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                           <div>
                             <p className="font-bold text-indigo-800">
                               {tahfidz.estimation.estimatedDate
                                 ? new Date(tahfidz.estimation.estimatedDate).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
                                 : "-"}
                             </p>
                             <p className="text-[10px] text-muted-foreground">Perkiraan selesai (± {tahfidz.estimation.estimatedDays} hari)</p>
                           </div>
                           <div>
                             <p className="font-bold">{tahfidz.estimation.ayahPerDay} ayat/hari</p>
                             <p className="text-[10px] text-muted-foreground">Kecepatan 90 hari terakhir</p>
                           </div>
                           <div>
                             <p className="font-bold">{tahfidz.estimation.remainingAyah} ayat</p>
                             <p className="text-[10px] text-muted-foreground">Sisa menuju 6.236 ayat</p>
                           </div>
                         </div>
                       ) : (
                         <p className="text-xs italic text-muted-foreground">
                           Belum cukup data setoran (minimal 3 catatan ziyadah dalam 90 hari terakhir) untuk membuat proyeksi.
                         </p>
                       )}
                     </div>
                   )}
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="behavior">
               <Card>
                 <CardHeader>
                   <CardTitle>Kedisiplinan & Karakter</CardTitle>
                   <CardDescription>Monitoring point dan catatan wali kelas</CardDescription>
                 </CardHeader>
                 <CardContent>
                   <p className="text-sm text-muted-foreground py-10 text-center">Data histori kedisiplinan lengkap dapat dilihat di tab Overview atau menu Pelanggaran.</p>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="ibadah">
               {loadingIbadah ? (
                 <Card>
                   <CardContent className="flex justify-center py-12">
                     <Skeleton className="h-[250px] w-full" />
                   </CardContent>
                 </Card>
               ) : (
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <Card className="md:col-span-1">
                   <CardHeader>
                      <CardTitle className="text-sm">Summary Ibadah</CardTitle>
                   </CardHeader>
                   <CardContent className="space-y-4">
                      <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                         <p className="text-xs text-emerald-700 font-bold uppercase">Completion Rate</p>
                         <p className="text-4xl font-black text-emerald-800">{ibadah?.completionRate || 0}%</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                         <div className="p-3 border rounded-lg text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Streak</p>
                            <p className="text-lg font-bold text-orange-600">{ibadah?.currentStreak || 0} Hari</p>
                         </div>
                         <div className="p-3 border rounded-lg text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Points</p>
                            <p className="text-lg font-bold text-indigo-600">{ibadah?.totalPoints || 0}</p>
                         </div>
                      </div>
                   </CardContent>
                 </Card>

                 <Card className="md:col-span-2">
                   <CardHeader>
                      <CardTitle className="text-sm">Pencapaian per Kategori</CardTitle>
                   </CardHeader>
                   <CardContent className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={ibadah?.categoryBreakdown || []}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="category" tick={{fontSize: 10}} />
                            <YAxis hide domain={[0, 100]} />
                            <Tooltip />
                            <Bar dataKey="completionRate" fill="#10b981" radius={[4, 4, 0, 0]} />
                         </BarChart>
                      </ResponsiveContainer>
                   </CardContent>
                 </Card>
               </div>
               )}
            </TabsContent>

            <TabsContent value="counseling">
               <Card>
                 <CardHeader>
                   <CardTitle>Riwayat Bimbingan & Konseling</CardTitle>
                   <CardDescription>Catatan perkembangan psikologis dan pembinaan</CardDescription>
                 </CardHeader>
                 <CardContent>
                    <p className="text-sm text-muted-foreground py-10 text-center">Modul Bimbingan & Konseling dalam Pengembangan.</p>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="boarding">
               {loadingRoom || (roomAssignment?.roomId && loadingSocial) ? (
                 <Card>
                   <CardContent className="flex justify-center py-12">
                     <Skeleton className="h-[300px] w-full" />
                   </CardContent>
                 </Card>
               ) : !roomAssignment ? (
                 <Card>
                    <CardHeader>
                      <CardTitle>Kehidupan Berasrama</CardTitle>
                      <CardDescription>Informasi kamar dan dinamika sosial</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <p className="text-sm text-muted-foreground py-10 text-center">Santri belum memiliki penempatan kamar.</p>
                    </CardContent>
                 </Card>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <Card className="md:col-span-1">
                      <CardHeader>
                        <CardTitle className="text-sm">Informasi Kamar</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-xl border">
                           <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Nama Kamar</p>
                           <p className="text-lg font-bold">{roomAssignment.room?.name}</p>
                           <p className="text-xs text-slate-500">{roomAssignment.room?.dormitory?.name} • Lt. {roomAssignment.room?.floor}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                           <div className="p-3 border rounded-lg text-center">
                              <p className="text-[10px] text-muted-foreground uppercase">Kapasitas</p>
                              <p className="text-lg font-bold">{roomAssignment.room?.capacity} Bed</p>
                           </div>
                           <div className="p-3 border rounded-lg text-center">
                              <p className="text-[10px] text-muted-foreground uppercase">Terisi</p>
                              <p className="text-lg font-bold">{roomAssignment.room?.currentOccupancy} Santri</p>
                           </div>
                        </div>
                      </CardContent>
                   </Card>

                   <Card className="md:col-span-2 border-indigo-100 bg-indigo-50/30">
                      <CardHeader className="pb-2">
                         <CardTitle className="text-indigo-900 flex items-center gap-2">
                           <HeartPulse className="w-5 h-5 text-indigo-600" />
                           Dinamika Sosial Kamar
                         </CardTitle>
                         <CardDescription className="text-indigo-700">Status: {socialAnalytics?.status || 'NORMAL'}</CardDescription>
                      </CardHeader>
                      <CardContent>
                         <div className="flex flex-col md:flex-row gap-6 items-center">
                            <div className="relative h-32 w-32 flex items-center justify-center">
                               <svg className="w-full h-full transform -rotate-90">
                                  <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-200" />
                                  <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * (socialAnalytics?.harmonyScore || 0)) / 100} className="text-indigo-600" />
                               </svg>
                               <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span className="text-2xl font-black text-indigo-900">{socialAnalytics?.harmonyScore || 0}%</span>
                                  <span className="text-[10px] font-bold text-indigo-700 uppercase">Harmony</span>
                               </div>
                            </div>
                            <div className="flex-1 space-y-3">
                               <div className="grid grid-cols-2 gap-4">
                                  <div>
                                     <p className="text-xs font-bold text-slate-500 uppercase">Total Anggota Kamar</p>
                                     <p className="text-lg font-bold text-slate-700 mt-1">{socialAnalytics?.members?.length || 0} Santri</p>
                                  </div>
                                  <div>
                                     <p className="text-xs font-bold text-slate-500 uppercase">Status Kamar</p>
                                     <p className="text-sm font-semibold mt-1 text-slate-600">{socialAnalytics?.status || 'NORMAL'}</p>
                                  </div>
                               </div>
                               <div className="p-3 bg-white rounded-lg border border-indigo-100 text-xs">
                                  <p className="font-bold text-indigo-900 mb-1">Teman Sekamar ({socialAnalytics?.members?.length || 0}):</p>
                                  <div className="flex flex-wrap gap-1">
                                     {socialAnalytics?.members?.map((r: any) => (
                                        <Badge key={r.studentId} variant="outline" className="text-[10px]">{r.name}</Badge>
                                     ))}
                                  </div>
                               </div>
                            </div>
                         </div>
                      </CardContent>
                   </Card>
                 </div>
               )}
            </TabsContent>

            <TabsContent value="health">
               <Card>
                 <CardHeader>
                   <CardTitle>Log Kesehatan UKS</CardTitle>
                   <CardDescription>Histori kunjungan ke unit kesehatan</CardDescription>
                 </CardHeader>
                 <CardContent>
                    <div className="space-y-4">
                      {Array.isArray(health) && health.length > 0 ? (
                        health.map((h: any) => (
                          <div key={h.id} className="p-4 border rounded-lg flex gap-4">
                            <div className="h-10 w-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                              <HeartPulse className="w-5 h-5 text-rose-500" />
                            </div>
                            <div>
                               <p className="text-sm font-bold">{h.complaint}</p>
                               <p className="text-xs text-muted-foreground mt-1">Diagnosis: {h.diagnosis || 'Dalam Observasi'}</p>
                               <p className="text-[10px] text-slate-400 mt-1 uppercase">{new Date(h.visitDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-10 text-center">Tidak ada riwayat kunjungan medis.</p>
                      )}
                    </div>
                 </CardContent>
               </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function Student360Page() {
  return (
    <MainLayout>
      <Student360PageContent />
    </MainLayout>
  );
}
