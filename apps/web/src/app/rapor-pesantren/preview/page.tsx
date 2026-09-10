"use client";

import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Loader2,
  Check,
  X,
  Users,
  CalendarDays,
  MessageSquare,
  Star,
  Award,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useClasses } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import { useAuthStore } from "@/stores/auth";
import {
  useRaporList,
  useRaporDetail,
  RaporPesantren,
} from "@/hooks/use-rapor-pesantren";
import { useAcademicYears } from "@/hooks/use-academic-years";

// Grade mapping
const GRADE_LABELS: Record<string, { label: string; color: string }> = {
  mumtaz: { label: "Mumtaz (A)", color: "bg-green-500" },
  jayyidJiddan: { label: "Jayyid Jiddan (B)", color: "bg-blue-500" },
  jayyid: { label: "Jayyid (C)", color: "bg-yellow-500" },
  maqbul: { label: "Maqbul (D)", color: "bg-orange-500" },
  rasib: { label: "Rasib (E)", color: "bg-red-500" },
  MUMTAZ: { label: "Mumtaz (A)", color: "bg-green-500" },
  JAYYID_JIDDAN: { label: "Jayyid Jiddan (B)", color: "bg-blue-500" },
  JAYYID: { label: "Jayyid (C)", color: "bg-yellow-500" },
  MAQBUL: { label: "Maqbul (D)", color: "bg-orange-500" },
  RASIB: { label: "Rasib (E)", color: "bg-red-500" },
};

export default function RaporPesantrenPreviewPage() {
  const { user } = useAuthStore();
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [selectedRaporId, setSelectedRaporId] = useState<string>("");

  const { data: classes } = useClasses({ unitId: user?.unitId });
  const { data: studentsData } = useStudents({
    classId: selectedClass || undefined,
    limit: 100,
  });
  const { data: academicYears } = useAcademicYears();

  // Get current academic year
  const activeAcademicYear = useMemo(() => {
    return academicYears?.data?.find((ay) => ay.isActive);
  }, [academicYears]);

  // Fetch rapor list for selected student
  const { data: raporListData, isLoading: isLoadingList } = useRaporList({
    classId: selectedClass || undefined,
    academicYearId: activeAcademicYear?.id,
  });

  // Find rapor for selected student from list
  const studentRapor = useMemo(() => {
    if (!raporListData?.data || !selectedStudent) return null;
    return raporListData.data.find(
      (r: RaporPesantren) => r.student?.id === selectedStudent,
    );
  }, [raporListData, selectedStudent]);

  // Fetch detailed rapor if available
  const { data: raporDetail, isLoading: isLoadingDetail } = useRaporDetail(
    studentRapor?.id || selectedRaporId || "",
  );

  const students = studentsData?.data || [];

  // Use real data from API or placeholder
  const rapor = useMemo(() => {
    if (!raporDetail) return null;

    // Map API response to display format
    return {
      id: raporDetail.id,
      student: {
        name: raporDetail.student?.name || "-",
        nisn: raporDetail.student?.nisn || "-",
        class: raporDetail.student?.class?.name || "-",
      },
      period: {
        semester: raporDetail.semester || 1,
        academicYear: raporDetail.academicYear?.name || "-",
      },
      tahfidz: {
        ...raporDetail.tahfidz,
        surahCount: raporDetail.tahfidz.totalSurah,
        averageScore: raporDetail.tahfidz.score,
      },
      ibadah: {
        ...raporDetail.ibadah,
        averageScore: raporDetail.ibadah.score,
        sholatWajib:
          raporDetail.ibadah.categoryBreakdown.find((c) =>
            c.category.includes("SHOLAT"),
          )?.completionRate || 0,
        sholatSunnah:
          raporDetail.ibadah.categoryBreakdown.find((c) =>
            c.category.includes("SUNNAH"),
          )?.completionRate || 0,
      },
      muhadhoroh: {
        ...raporDetail.muhadhoroh,
        averageScore: raporDetail.muhadhoroh.score,
        bestPerformance: raporDetail.muhadhoroh.performances[0]?.theme || "-",
      },
      muhadatsah: {
        ...raporDetail.muhadatsah,
        averageScore: raporDetail.muhadatsah.score,
      },
      kitabProgress: {
        ...raporDetail.kitabProgress,
        averageScore: raporDetail.kitabProgress.score,
      },
      akhlak: {
        ...raporDetail.akhlak,
        averageScore: raporDetail.akhlak.score,
      },
      finalScore: raporDetail.overallScore || 0,
      finalGrade: raporDetail.overallGrade || "maqbul",
      recommendation:
        raporDetail.notes || raporDetail.musyrifNotes || "Tidak ada catatan",
    };
  }, [raporDetail]);

  const renderScoreBar = (score: number, maxScore: number = 100) => {
    const percentage = (score / maxScore) * 100;
    let color = "bg-green-500";
    if (percentage < 60) color = "bg-red-500";
    else if (percentage < 70) color = "bg-orange-500";
    else if (percentage < 80) color = "bg-yellow-500";
    else if (percentage < 90) color = "bg-blue-500";

    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${color}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-sm font-medium w-12 text-right">{score}</span>
      </div>
    );
  };

  return (
    <MainLayout
      allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN", "TEACHER", "PARENT"]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Preview Rapor Pesantren"
          description="Lihat detail rapor pesantren santri"
          actions={
            <Button asChild disabled={!rapor}>
              <Link
                href={rapor ? `/rapor-pesantren/print/${rapor.id}` : "#"}
                target="_blank"
              >
                Cetak / Download PDF
              </Link>
            </Button>
          }
        />

        {/* Student Selector */}
        <div className="flex flex-wrap gap-4">
          <Select
            value={selectedClass}
            onValueChange={(v) => {
              setSelectedClass(v);
              setSelectedStudent("");
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Pilih Kelas" />
            </SelectTrigger>
            <SelectContent>
              {classes?.data?.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedStudent}
            onValueChange={setSelectedStudent}
            disabled={!selectedClass}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Pilih Santri" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.nisn})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rapor Preview */}
        {isLoadingDetail ? (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <div className="grid gap-6 lg:grid-cols-3">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          </div>
        ) : !rapor ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium">Tidak Ada Data Rapor</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {selectedStudent
                  ? "Rapor pesantren belum tersedia untuk santri ini. Silahkan generate terlebih dahulu."
                  : "Silahkan pilih kelas dan santri untuk melihat rapor."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Student Info */}
            <Card className="lg:col-span-3">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">
                        {rapor.student.name}
                      </h2>
                      <p className="text-muted-foreground">
                        NISN: {rapor.student.nisn} | Kelas: {rapor.student.class}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">
                        {rapor.finalScore}
                      </p>
                      <Badge className={GRADE_LABELS[rapor.finalGrade].color}>
                        {GRADE_LABELS[rapor.finalGrade].label}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tahfidz */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-green-600" />
                  Tahfidz
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {renderScoreBar(rapor.tahfidz.averageScore)}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    Total Ayat:{" "}
                    <span className="font-medium">
                      {rapor.tahfidz.totalAyah}
                    </span>
                  </div>
                  <div>
                    Surah:{" "}
                    <span className="font-medium">
                      {rapor.tahfidz.surahCount}
                    </span>
                  </div>
                </div>
                <Badge className={GRADE_LABELS[rapor.tahfidz.grade].color}>
                  {GRADE_LABELS[rapor.tahfidz.grade].label}
                </Badge>
              </CardContent>
            </Card>

            {/* Ibadah */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Star className="h-5 w-5 text-yellow-600" />
                  Ibadah
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {renderScoreBar(rapor.ibadah.averageScore)}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Sholat Wajib</span>
                    <span className="font-medium">
                      {rapor.ibadah.sholatWajib}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sholat Sunnah</span>
                    <span className="font-medium">
                      {rapor.ibadah.sholatSunnah}%
                    </span>
                  </div>
                </div>
                <Badge className={GRADE_LABELS[rapor.ibadah.grade].color}>
                  {GRADE_LABELS[rapor.ibadah.grade].label}
                </Badge>
              </CardContent>
            </Card>

            {/* Muhadhoroh */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  Muhadhoroh
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {renderScoreBar(rapor.muhadhoroh.averageScore)}
                <div className="text-sm">
                  <p>
                    Sesi:{" "}
                    <span className="font-medium">
                      {rapor.muhadhoroh.totalSessions}
                    </span>
                  </p>
                  <p>
                    Terbaik:{" "}
                    <span className="font-medium">
                      {rapor.muhadhoroh.bestPerformance}
                    </span>
                  </p>
                </div>
                <Badge className={GRADE_LABELS[rapor.muhadhoroh.grade].color}>
                  {GRADE_LABELS[rapor.muhadhoroh.grade].label}
                </Badge>
              </CardContent>
            </Card>

            {/* Recommendation */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Catatan & Rekomendasi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{rapor.recommendation}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
