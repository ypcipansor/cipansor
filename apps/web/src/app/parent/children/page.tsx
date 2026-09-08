"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
// Shared shape — see use-parent-portal.ts. This page previously declared
// its own `Child` with a nested `student` the API never returned.
import type { ParentChild } from "@/hooks/use-parent-portal";
import {
  Users,
  GraduationCap,
  Calendar,
  BookOpen,
  ClipboardCheck,
  AlertTriangle,
  Award,
  Heart,
  FileText,
  Receipt,
  ChevronRight,
} from "lucide-react";


interface AttendanceSummary {
  period: string;
  summary: {
    PRESENT: number;
    ABSENT: number;
    SICK: number;
    EXCUSED: number;
    LATE: number;
  };
  percentage: number;
}

interface TahfidzProgress {
  summary: {
    totalJuz: number;
    totalSurah: number;
    totalAyah: number;
    lastMemoization?: {
      surahName: string;
      ayahStart: number;
      ayahEnd: number;
      recordedAt: string;
    };
  };
  recentRecords: Array<{
    id: string;
    surahName: string;
    ayahStart: number;
    ayahEnd: number;
    grade: string;
    recordedAt: string;
  }>;
}

interface GradeData {
  grades: Array<{
    id: string;
    subject: {
      id: string;
      name: string;
      code: string;
    };
    score: number;
    maxScore: number;
    percentage: number;
    grade: string;
    gradedAt: string;
  }>;
  bySubject: Array<{
    subject: {
      id: string;
      name: string;
    };
    averageScore: number;
    grades: Array<any>;
  }>;
}

export default function ChildrenPage() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<ParentChild | null>(null);
  const [activeTab, setActiveTab] = useState("profile");

  // Detail data
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [tahfidz, setTahfidz] = useState<TahfidzProgress | null>(null);
  const [grades, setGrades] = useState<GradeData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        setLoading(true);
        const res = await api.get("/parent/children");
        const childrenData = res.data.data || [];
        setChildren(childrenData);

        // Auto-select child if ID is provided or select first child
        if (childrenData.length > 0) {
          const childToSelect = selectedId
            ? childrenData.find((c: ParentChild) => c.id === selectedId)
            : childrenData[0];
          if (childToSelect) {
            setSelectedChild(childToSelect);
          }
        }
      } catch (err) {
        console.error("Failed to fetch children:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChildren();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedChild) return;

    const fetchDetails = async () => {
      setDetailLoading(true);
      try {
        const studentId = selectedChild.id;

        // Fetch based on active tab
        if (activeTab === "attendance") {
          const res = await api.get(`/parent/children/${studentId}/attendance`);
          setAttendance(res.data.data);
        } else if (activeTab === "tahfidz") {
          const res = await api.get(`/parent/children/${studentId}/tahfidz`);
          setTahfidz(res.data.data);
        } else if (activeTab === "grades") {
          const res = await api.get(`/parent/children/${studentId}/grades`);
          setGrades(res.data.data);
        }
      } catch (err) {
        console.error("Failed to fetch details:", err);
      } finally {
        setDetailLoading(false);
      }
    };

    fetchDetails();
  }, [selectedChild, activeTab]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Belum ada data anak</h3>
          <p className="text-muted-foreground mt-2">
            Silakan hubungi admin sekolah untuk menghubungkan akun Anda dengan
            data anak.
          </p>
        </CardContent>
      </Card>
    );
  }

  const relationLabels: Record<string, string> = {
    father: "Ayah",
    mother: "Ibu",
    guardian: "Wali",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Anak</h1>
        <p className="text-muted-foreground">
          Lihat informasi dan perkembangan anak Anda
        </p>
      </div>

      {/* Children List */}
      <div className="grid gap-4 md:grid-cols-3">
        {children.map((child) => (
          <Card
            key={child.id}
            className={`cursor-pointer transition-colors hover:border-primary ${
              selectedChild?.id === child.id
                ? "border-primary bg-primary/5"
                : ""
            }`}
            onClick={() => setSelectedChild(child)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                  {child.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{child.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {child.nisn} •{" "}
                    {relationLabels[child.relation] || child.relation}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selected ParentChild Details */}
      {selectedChild && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-2xl">
                {selectedChild.name.charAt(0)}
              </div>
              <div>
                <CardTitle>{selectedChild.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{selectedChild.nisn}</Badge>
                  {selectedChild.currentClass && (
                    <Badge variant="outline">
                      {selectedChild.currentClass.name}
                    </Badge>
                  )}
                  {selectedChild.unit && (
                    <Badge variant="outline">
                      {selectedChild.unit.name}
                    </Badge>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="profile" className="gap-2">
                  <Users className="h-4 w-4 hidden sm:block" />
                  Profil
                </TabsTrigger>
                <TabsTrigger value="attendance" className="gap-2">
                  <Calendar className="h-4 w-4 hidden sm:block" />
                  Kehadiran
                </TabsTrigger>
                <TabsTrigger value="tahfidz" className="gap-2">
                  <BookOpen className="h-4 w-4 hidden sm:block" />
                  Tahfidz
                </TabsTrigger>
                <TabsTrigger value="grades" className="gap-2">
                  <ClipboardCheck className="h-4 w-4 hidden sm:block" />
                  Nilai
                </TabsTrigger>
                <TabsTrigger value="more" className="gap-2">
                  <FileText className="h-4 w-4 hidden sm:block" />
                  Lainnya
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="mt-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        NISN
                      </label>
                      <p className="mt-1">{selectedChild.nisn}</p>
                    </div>
                    {selectedChild.nisn && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          NISN
                        </label>
                        <p className="mt-1">{selectedChild.nisn}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Nama Lengkap
                      </label>
                      <p className="mt-1">{selectedChild.name}</p>
                    </div>
                    {selectedChild.birthPlace &&
                      selectedChild.birthDate && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">
                            Tempat, Tanggal Lahir
                          </label>
                          <p className="mt-1">
                            {selectedChild.birthPlace},{" "}
                            {new Date(
                              selectedChild.birthDate,
                            ).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      )}
                    {selectedChild.gender && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Jenis Kelamin
                        </label>
                        <p className="mt-1">
                          {selectedChild.gender === "MALE"
                            ? "Laki-laki"
                            : "Perempuan"}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {selectedChild.currentClass && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Kelas
                        </label>
                        <p className="mt-1">
                          {selectedChild.currentClass.name}
                        </p>
                      </div>
                    )}
                    {selectedChild.unit && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Unit
                        </label>
                        <p className="mt-1">
                          {selectedChild.unit.name}
                        </p>
                      </div>
                    )}
                    {selectedChild.address && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Alamat
                        </label>
                        <p className="mt-1">{selectedChild.address}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Hubungan dengan Siswa
                      </label>
                      <p className="mt-1">
                        {relationLabels[selectedChild.relation] ||
                          selectedChild.relation}
                        {selectedChild.isPrimary && (
                          <Badge variant="secondary" className="ml-2">
                            Kontak Utama
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Attendance Tab */}
              <TabsContent value="attendance" className="mt-6">
                {detailLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : attendance ? (
                  <div className="space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {attendance.summary.PRESENT}
                          </div>
                          <p className="text-sm text-muted-foreground">Hadir</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-yellow-600">
                            {attendance.summary.LATE}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Terlambat
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {attendance.summary.EXCUSED}
                          </div>
                          <p className="text-sm text-muted-foreground">Izin</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {attendance.summary.SICK}
                          </div>
                          <p className="text-sm text-muted-foreground">Sakit</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-red-600">
                            {attendance.summary.ABSENT}
                          </div>
                          <p className="text-sm text-muted-foreground">Alpha</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Percentage */}
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Persentase Kehadiran
                          </span>
                          <span
                            className={`text-2xl font-bold ${
                              attendance.percentage >= 80
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {attendance.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-2 h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              attendance.percentage >= 80
                                ? "bg-green-600"
                                : "bg-red-600"
                            }`}
                            style={{ width: `${attendance.percentage}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Periode: {attendance.period}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Belum ada data kehadiran
                  </p>
                )}
              </TabsContent>

              {/* Tahfidz Tab */}
              <TabsContent value="tahfidz" className="mt-6">
                {detailLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : tahfidz ? (
                  <div className="space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-3xl font-bold text-primary">
                            {tahfidz.summary.totalJuz}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Total Juz
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-3xl font-bold text-primary">
                            {tahfidz.summary.totalSurah}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Total Surah
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-3xl font-bold text-primary">
                            {tahfidz.summary.totalAyah}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Total Ayat
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Last Memorization */}
                    {tahfidz.summary.lastMemoization && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">
                            Hafalan Terakhir
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-lg font-medium">
                            {tahfidz.summary.lastMemoization.surahName}
                          </p>
                          <p className="text-muted-foreground">
                            Ayat {tahfidz.summary.lastMemoization.ayahStart} -{" "}
                            {tahfidz.summary.lastMemoization.ayahEnd}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            {new Date(
                              tahfidz.summary.lastMemoization.recordedAt,
                            ).toLocaleDateString("id-ID")}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Recent Records */}
                    {tahfidz.recentRecords.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">
                            Riwayat Hafalan
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {tahfidz.recentRecords.map((record) => (
                              <div
                                key={record.id}
                                className="flex items-center justify-between p-3 border rounded-lg"
                              >
                                <div>
                                  <p className="font-medium">
                                    {record.surahName}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Ayat {record.ayahStart} - {record.ayahEnd}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <Badge
                                    variant={
                                      record.grade === "A"
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {record.grade}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {new Date(
                                      record.recordedAt,
                                    ).toLocaleDateString("id-ID")}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Belum ada data tahfidz
                  </p>
                )}
              </TabsContent>

              {/* Grades Tab */}
              <TabsContent value="grades" className="mt-6">
                {detailLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : grades && grades.bySubject.length > 0 ? (
                  <div className="space-y-4">
                    {grades.bySubject.map((subjectData) => (
                      <Card key={subjectData.subject.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {subjectData.subject.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {subjectData.grades.length} nilai tercatat
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-2xl font-bold ${
                                  subjectData.averageScore >= 75
                                    ? "text-green-600"
                                    : subjectData.averageScore >= 60
                                      ? "text-yellow-600"
                                      : "text-red-600"
                                }`}
                              >
                                {subjectData.averageScore.toFixed(1)}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Rata-rata
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Belum ada data nilai
                  </p>
                )}
              </TabsContent>

              {/* More Tab */}
              <TabsContent value="more" className="mt-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <a
                    href={`/parent/violations?studentId=${selectedChild.id}`}
                  >
                    <Card className="cursor-pointer hover:border-primary transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                        <div>
                          <p className="font-medium">Pelanggaran</p>
                          <p className="text-sm text-muted-foreground">
                            Lihat riwayat pelanggaran
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                  <a
                    href={`/parent/rewards?studentId=${selectedChild.id}`}
                  >
                    <Card className="cursor-pointer hover:border-primary transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <Award className="h-8 w-8 text-yellow-500" />
                        <div>
                          <p className="font-medium">Penghargaan</p>
                          <p className="text-sm text-muted-foreground">
                            Lihat penghargaan yang didapat
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                  <a
                    href={`/parent/health?studentId=${selectedChild.id}`}
                  >
                    <Card className="cursor-pointer hover:border-primary transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <Heart className="h-8 w-8 text-pink-500" />
                        <div>
                          <p className="font-medium">Kesehatan</p>
                          <p className="text-sm text-muted-foreground">
                            Lihat riwayat kesehatan
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                  <a
                    href={`/parent/finance?studentId=${selectedChild.id}`}
                  >
                    <Card className="cursor-pointer hover:border-primary transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <Receipt className="h-8 w-8 text-green-500" />
                        <div>
                          <p className="font-medium">Keuangan</p>
                          <p className="text-sm text-muted-foreground">
                            Lihat tagihan dan pembayaran
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
