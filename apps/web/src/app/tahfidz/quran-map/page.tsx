"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  User,
  CheckCircle2,
  Clock,
  Target,
  ChevronRight,
  Star,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useStudents } from "@/hooks/use-students";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuranMap } from "@/hooks/use-quran-map";
import { QuranSurahStatus, QuranSurahProgress } from "@cipansor/shared";
import { getJuzForSurah, QURAN_SURAH_JUZ_MAPPING } from "@/lib/quran-data";

export default function QuranMapPage() {
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );
  const [selectedJuz, setSelectedJuz] = useState<number | "all">("all");
  const [selectedSurah, setSelectedSurah] = useState<QuranSurahProgress | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<"surah" | "juz">("surah");

  const debouncedStudentSearch = useDebounce(studentSearch, 300);

  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    search: debouncedStudentSearch || undefined,
    limit: 10,
  });

  const students = studentsData?.data || [];

  const { data: quranMapData, isLoading: mapLoading } =
    useQuranMap(selectedStudentId);

  const getStatusColor = (status: QuranSurahStatus) => {
    switch (status) {
      case "MEMORIZED":
        return "bg-emerald-500 text-white";
      case "IN_PROGRESS":
        return "bg-amber-500 text-white";
      default:
        return "bg-gray-100 text-gray-600 hover:bg-gray-200";
    }
  };

  // Prepare stats per juz
  const juzStats = useMemo(() => {
    if (!quranMapData) return {};

    const stats: Record<
      number,
      {
        totalMemorized: number;
        totalInProgress: number;
        totalNotStarted: number;
        totalSurahs: number;
      }
    > = {};

    // Initialize stats for 30 juz
    for (let i = 1; i <= 30; i++) {
      stats[i] = {
        totalMemorized: 0,
        totalInProgress: 0,
        totalNotStarted: 0,
        totalSurahs: 0,
      };
    }

    quranMapData.surahs.forEach((surah) => {
      const juzList = getJuzForSurah(surah.surahNumber);
      juzList.forEach((juz) => {
        if (stats[juz]) {
          stats[juz].totalSurahs++;
          if (surah.status === "MEMORIZED") stats[juz].totalMemorized++;
          else if (surah.status === "IN_PROGRESS") stats[juz].totalInProgress++;
          else stats[juz].totalNotStarted++;
        }
      });
    });

    return stats;
  }, [quranMapData]);

  const filteredSurahs = useMemo(() => {
    if (!quranMapData) return [];

    if (selectedJuz === "all") {
      return quranMapData.surahs;
    }

    // If selectedJuz is active, filter using mapping
    return quranMapData.surahs.filter((surah) => {
      const juzList = getJuzForSurah(surah.surahNumber);
      return juzList.includes(selectedJuz);
    });
  }, [quranMapData, selectedJuz]);

  return (
    <MainLayout>
      <PageHeader
        title="Peta Hafalan Al-Qur'an"
        description="Visualisasi progress hafalan 30 juz Al-Qur'an"
        backHref="/tahfidz"
      />

      {/* Student Selection */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau NISN siswa..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              {studentSearch && (
                <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto bg-white absolute z-10 w-full shadow-md">
                  {studentsLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      Mencari...
                    </p>
                  ) : students.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      Tidak ditemukan
                    </p>
                  ) : (
                    students.map((student) => (
                      <button
                        key={student.id}
                        className="w-full p-3 text-left hover:bg-muted/50 border-b last:border-0 flex items-center gap-2"
                        onClick={() => {
                          setSelectedStudentId(student.id);
                          setStudentSearch("");
                        }}
                      >
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{student.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {student.nisn} • {student.currentClass?.name || "-"}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {selectedStudentId && (
              <div className="flex items-center">
                <span className="font-semibold mr-2">Siswa:</span>
                <Badge variant="outline" className="text-base py-1">
                  {students.find((s) => s.id === selectedStudentId)?.name ||
                    "Terpilih"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStudentId(null)}
                  className="ml-2"
                >
                  Ganti
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedStudentId ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Pilih Siswa</h3>
            <p className="text-muted-foreground">
              Cari dan pilih siswa untuk melihat peta progress hafalan
              Al-Qur&apos;an
            </p>
          </CardContent>
        </Card>
      ) : mapLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : !quranMapData ? (
        <div className="text-center p-8">Data tidak ditemukan</div>
      ) : (
        <>
          {/* Progress Stats */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">
                      {quranMapData.stats.totalMemorized}
                    </p>
                    <p className="text-sm text-muted-foreground">Hafal</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold text-amber-600">
                      {quranMapData.stats.totalInProgress}
                    </p>
                    <p className="text-sm text-muted-foreground">Proses</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {quranMapData.stats.totalNotStarted}
                    </p>
                    <p className="text-sm text-muted-foreground">Belum</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Total Progress</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {quranMapData.stats.percentage}%
                  </p>
                </div>
                <Progress
                  value={quranMapData.stats.percentage}
                  className="h-2"
                />
              </CardContent>
            </Card>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500" />
              <span className="text-sm">Hafal</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-500" />
              <span className="text-sm">Proses</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-100 border" />
              <span className="text-sm">Belum</span>
            </div>
          </div>

          {/* Surah Grid */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Semua Surah (114)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                {filteredSurahs.map((surah) => {
                  return (
                    <TooltipProvider key={surah.surahNumber}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setSelectedSurah(surah)}
                            className={cn(
                              "aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all hover:scale-110",
                              getStatusColor(surah.status),
                            )}
                          >
                            <span className="font-bold">
                              {surah.surahNumber}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <div className="text-center">
                            <p className="font-semibold">{surah.surahName}</p>
                            <Badge
                              className={cn(
                                "mt-1",
                                getStatusColor(surah.status),
                              )}
                            >
                              {surah.status === "MEMORIZED"
                                ? "Hafal"
                                : surah.status === "IN_PROGRESS"
                                  ? "Proses"
                                  : "Belum"}
                            </Badge>
                            {surah.strength && surah.strength > 0 && (
                              <p className="text-xs mt-1">
                                Kualitas: {surah.strength}/100
                              </p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Surah Detail Dialog */}
      <Dialog
        open={!!selectedSurah}
        onOpenChange={() => setSelectedSurah(null)}
      >
        <DialogContent>
          {selectedSurah && (
            <>
              <DialogHeader>
                <div className="text-center">
                  <DialogTitle>{selectedSurah.surahName}</DialogTitle>
                  <DialogDescription>
                    Surah ke-{selectedSurah.surahNumber}
                  </DialogDescription>
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Badge className={getStatusColor(selectedSurah.status)}>
                    {selectedSurah.status === "MEMORIZED"
                      ? "✓ Hafal"
                      : selectedSurah.status === "IN_PROGRESS"
                        ? "⏳ Sedang Proses"
                        : "○ Belum Dimulai"}
                  </Badge>
                </div>

                {selectedSurah.status === "MEMORIZED" && (
                  <div className="p-4 bg-emerald-50 rounded-lg text-center">
                    <Star className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-emerald-700">
                      Alhamdulillah!
                    </p>
                    <p className="text-sm text-emerald-600">
                      Surah ini sudah dihafal
                    </p>
                    {selectedSurah.strength && (
                      <p className="text-xs text-emerald-600 mt-1">
                        Kualitas Hafalan: {selectedSurah.strength}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 justify-center">
                  <Button variant="outline" asChild>
                    <Link
                      href={`/tahfidz?surah=${selectedSurah.surahNumber}&studentId=${selectedStudentId}`}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Lihat Catatan
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link
                      href={`/tahfidz/new?surah=${selectedSurah.surahNumber}&studentId=${selectedStudentId}`}
                    >
                      Input Setoran
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
