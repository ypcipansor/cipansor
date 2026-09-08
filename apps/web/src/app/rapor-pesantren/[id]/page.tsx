"use client";

import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Printer,
  User,
  BookOpen,
  Moon,
  Mic,
  MessageCircle,
  Book,
  Heart,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LoadingSpinner } from "@/components/shared";
import {
  useRaporDetail,
  RAPOR_STATUS,
  GRADE_COLORS,
  COMPONENT_LABELS,
} from "@/hooks/use-rapor-pesantren";

function RaporDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: rapor, isLoading, error } = useRaporDetail(id);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !rapor) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Rapor tidak ditemukan</p>
            <Button variant="link" onClick={() => router.back()}>
              Kembali
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getGradeColor = (grade: string) => {
    const color = GRADE_COLORS[grade as keyof typeof GRADE_COLORS] || "gray";
    const variants: Record<string, string> = {
      green:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
      yellow:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return variants[color] || variants.gray;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6 print:p-0">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Rapor Pesantren</h1>
            <p className="text-muted-foreground">
              {rapor.academicYear.name} - Semester {rapor.semester}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Cetak
          </Button>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Student Info Card */}
      <Card className="print:shadow-none print:border-2">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={rapor.student.photo} />
                <AvatarFallback className="text-2xl">
                  {rapor.student.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-bold">{rapor.student.name}</h2>
                <div className="text-muted-foreground space-y-1">
                  <p>
                    NISN: {rapor.student.nisn}{" "}
                    {rapor.student.nisn && `| NISN: ${rapor.student.nisn}`}
                  </p>
                  <p>Kelas: {rapor.student.class.name}</p>
                  {rapor.student.dormRoom && (
                    <p>Asrama: {rapor.student.dormRoom.name}</p>
                  )}
                </div>
              </div>
            </div>
            <Badge className={getGradeColor(rapor.overallGrade)}>
              {rapor.overallGrade}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-3xl font-bold">
                {rapor.overallScore.toFixed(1)}
              </p>
              <p className="text-sm text-muted-foreground">Nilai Akhir</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-3xl font-bold">{rapor.overallGrade}</p>
              <p className="text-sm text-muted-foreground">Predikat</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-3xl font-bold">
                {rapor.attendance.attendanceRate.toFixed(0)}%
              </p>
              <p className="text-sm text-muted-foreground">Kehadiran</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-3xl font-bold">{rapor.tahfidz.totalJuz}</p>
              <p className="text-sm text-muted-foreground">Juz Hafalan</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Component Scores Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Nilai per Komponen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(COMPONENT_LABELS).map(([key, label]) => {
              const component = rapor[key as keyof typeof COMPONENT_LABELS] as {
                score: number;
                grade: string;
              };
              return (
                <div key={key} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        {component.score.toFixed(1)}
                      </span>
                      <Badge
                        variant="outline"
                        className={getGradeColor(component.grade)}
                      >
                        {component.grade}
                      </Badge>
                    </div>
                  </div>
                  <Progress value={component.score} className="h-2" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Tabs */}
      <Tabs defaultValue="tahfidz" className="print:hidden">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="tahfidz">
            <BookOpen className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Tahfidz</span>
          </TabsTrigger>
          <TabsTrigger value="ibadah">
            <Moon className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Ibadah</span>
          </TabsTrigger>
          <TabsTrigger value="muhadhoroh">
            <Mic className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Muhadhoroh</span>
          </TabsTrigger>
          <TabsTrigger value="muhadatsah">
            <MessageCircle className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Muhadatsah</span>
          </TabsTrigger>
          <TabsTrigger value="kitab">
            <Book className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Kitab</span>
          </TabsTrigger>
          <TabsTrigger value="akhlak">
            <Heart className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Akhlak</span>
          </TabsTrigger>
        </TabsList>

        {/* Tahfidz Tab */}
        <TabsContent value="tahfidz">
          <Card>
            <CardHeader>
              <CardTitle>Tahfidz Al-Quran</CardTitle>
              <CardDescription>Hafalan, Murajaah, dan Tasmi</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{rapor.tahfidz.totalJuz}</p>
                  <p className="text-sm text-muted-foreground">Total Juz</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.tahfidz.totalSurah}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Surah</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.tahfidz.setoranCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Setoran</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.tahfidz.murajaahCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Murajaah</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Progress Hafalan</h4>
                <Progress
                  value={rapor.tahfidz.progressPercentage}
                  className="h-3"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {rapor.tahfidz.progressPercentage.toFixed(1)}% (
                  {rapor.tahfidz.totalAyah} ayat)
                </p>
              </div>

              {rapor.tahfidz.records.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Riwayat Setoran Terakhir</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Surah</TableHead>
                        <TableHead>Juz</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead>Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapor.tahfidz.records.slice(0, 5).map((record, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>{record.surah}</TableCell>
                          <TableCell>Juz {record.juz}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.type}</Badge>
                          </TableCell>
                          <TableCell>{record.grade}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ibadah Tab */}
        <TabsContent value="ibadah">
          <Card>
            <CardHeader>
              <CardTitle>Ibadah Harian</CardTitle>
              <CardDescription>Sholat, Dzikir, dan Tilawah</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.ibadah.totalPoints}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Poin</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.ibadah.completionRate.toFixed(0)}%
                  </p>
                  <p className="text-sm text-muted-foreground">Completion</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.ibadah.currentStreak}
                  </p>
                  <p className="text-sm text-muted-foreground">Streak Aktif</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.ibadah.longestStreak}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Streak Terpanjang
                  </p>
                </div>
              </div>

              {rapor.ibadah.categoryBreakdown.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Per Kategori</h4>
                  <div className="space-y-2">
                    {rapor.ibadah.categoryBreakdown.map((cat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-muted rounded"
                      >
                        <span>{cat.category}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm">
                            {cat.completionRate.toFixed(0)}%
                          </span>
                          <Badge>{cat.points} poin</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Muhadhoroh Tab */}
        <TabsContent value="muhadhoroh">
          <Card>
            <CardHeader>
              <CardTitle>Muhadhoroh</CardTitle>
              <CardDescription>Latihan Pidato dan Ceramah</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadhoroh.totalSessions}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Sesi</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadhoroh.attendedSessions}
                  </p>
                  <p className="text-sm text-muted-foreground">Dihadiri</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadhoroh.performanceCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Tampil</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadhoroh.averageScore.toFixed(1)}
                  </p>
                  <p className="text-sm text-muted-foreground">Rata-rata</p>
                </div>
              </div>

              {rapor.muhadhoroh.performances.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Riwayat Penampilan</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Tema</TableHead>
                        <TableHead>Nilai</TableHead>
                        <TableHead>Feedback</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapor.muhadhoroh.performances
                        .slice(0, 5)
                        .map((perf, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{formatDate(perf.date)}</TableCell>
                            <TableCell>{perf.theme}</TableCell>
                            <TableCell>{perf.score}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {perf.feedback || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Muhadatsah Tab */}
        <TabsContent value="muhadatsah">
          <Card>
            <CardHeader>
              <CardTitle>Muhadatsah</CardTitle>
              <CardDescription>Latihan Percakapan Bahasa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadatsah.totalSessions}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Sesi</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadatsah.practiceCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Latihan</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadatsah.averageScore.toFixed(1)}
                  </p>
                  <p className="text-sm text-muted-foreground">Rata-rata</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.muhadatsah.languages.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Bahasa</p>
                </div>
              </div>

              {rapor.muhadatsah.languages.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {rapor.muhadatsah.languages.map((lang, idx) => (
                    <Badge key={idx} variant="secondary">
                      {lang}
                    </Badge>
                  ))}
                </div>
              )}

              {rapor.muhadatsah.practices.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Riwayat Latihan</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Bahasa</TableHead>
                        <TableHead>Topik</TableHead>
                        <TableHead>Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapor.muhadatsah.practices
                        .slice(0, 5)
                        .map((practice, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{formatDate(practice.date)}</TableCell>
                            <TableCell>{practice.language}</TableCell>
                            <TableCell>{practice.topic}</TableCell>
                            <TableCell>{practice.score}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kitab Tab */}
        <TabsContent value="kitab">
          <Card>
            <CardHeader>
              <CardTitle>Kitab Kuning</CardTitle>
              <CardDescription>Progress Kajian Kitab</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.kitabProgress.totalKitab}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Kitab</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.kitabProgress.completedKitab}
                  </p>
                  <p className="text-sm text-muted-foreground">Selesai</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.kitabProgress.inProgressKitab}
                  </p>
                  <p className="text-sm text-muted-foreground">Berjalan</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {rapor.kitabProgress.progressPercentage.toFixed(0)}%
                  </p>
                  <p className="text-sm text-muted-foreground">Progress</p>
                </div>
              </div>

              {rapor.kitabProgress.kitabList.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Daftar Kitab</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Kitab</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapor.kitabProgress.kitabList.map((kitab, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{kitab.name}</TableCell>
                          <TableCell>{kitab.category}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={
                                  (kitab.completedPages / kitab.totalPages) *
                                  100
                                }
                                className="w-20 h-2"
                              />
                              <span className="text-sm">
                                {kitab.completedPages}/{kitab.totalPages}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                kitab.status === "COMPLETED"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {kitab.status === "COMPLETED"
                                ? "Selesai"
                                : kitab.status === "IN_PROGRESS"
                                  ? "Berjalan"
                                  : "Belum Mulai"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Akhlak Tab */}
        <TabsContent value="akhlak">
          <Card>
            <CardHeader>
              <CardTitle>Akhlak & Perilaku</CardTitle>
              <CardDescription>Pelanggaran dan Penghargaan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {rapor.akhlak.totalViolations}
                  </p>
                  <p className="text-sm text-muted-foreground">Pelanggaran</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {rapor.akhlak.totalRewards}
                  </p>
                  <p className="text-sm text-muted-foreground">Penghargaan</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{rapor.akhlak.netPoints}</p>
                  <p className="text-sm text-muted-foreground">Poin Bersih</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-lg font-bold">
                    {rapor.akhlak.behaviorGrade}
                  </p>
                  <p className="text-sm text-muted-foreground">Predikat</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Violations */}
                <div>
                  <h4 className="font-medium mb-2 text-red-600">Pelanggaran</h4>
                  {rapor.akhlak.violations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Tidak ada pelanggaran
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {rapor.akhlak.violations.slice(0, 5).map((v, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-red-50 dark:bg-red-950 rounded text-sm"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium">{v.category}</span>
                            <span className="text-red-600">
                              -{v.points} poin
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {v.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(v.date)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rewards */}
                <div>
                  <h4 className="font-medium mb-2 text-green-600">
                    Penghargaan
                  </h4>
                  {rapor.akhlak.rewards.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada penghargaan
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {rapor.akhlak.rewards.slice(0, 5).map((r, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-green-50 dark:bg-green-950 rounded text-sm"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium">{r.category}</span>
                            <span className="text-green-600">
                              +{r.points} poin
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {r.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(r.date)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Rekap Kehadiran
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {rapor.attendance.presentDays}
              </p>
              <p className="text-sm text-muted-foreground">Hadir</p>
            </div>
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">
                {rapor.attendance.lateDays}
              </p>
              <p className="text-sm text-muted-foreground">Terlambat</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {rapor.attendance.sickDays}
              </p>
              <p className="text-sm text-muted-foreground">Sakit</p>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">
                {rapor.attendance.permitDays}
              </p>
              <p className="text-sm text-muted-foreground">Izin</p>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="text-2xl font-bold text-red-600">
                {rapor.attendance.absentDays}
              </p>
              <p className="text-sm text-muted-foreground">Alfa</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{rapor.attendance.totalDays}</p>
              <p className="text-sm text-muted-foreground">Total Hari</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes Section */}
      {(rapor.notes ||
        rapor.headTeacherNotes ||
        rapor.musyrifNotes ||
        rapor.principalNotes) && (
        <Card>
          <CardHeader>
            <CardTitle>Catatan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rapor.notes && (
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">
                  Catatan Umum
                </h4>
                <p>{rapor.notes}</p>
              </div>
            )}
            {rapor.headTeacherNotes && (
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">
                  Catatan Wali Kelas
                </h4>
                <p>{rapor.headTeacherNotes}</p>
              </div>
            )}
            {rapor.musyrifNotes && (
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">
                  Catatan Musyrif
                </h4>
                <p>{rapor.musyrifNotes}</p>
              </div>
            )}
            {rapor.principalNotes && (
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">
                  Catatan Kepala Sekolah
                </h4>
                <p>{rapor.principalNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer Info */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Digenerate pada: {formatDate(rapor.generatedAt)}</p>
        {rapor.publishedAt && (
          <p>Dipublikasi pada: {formatDate(rapor.publishedAt)}</p>
        )}
      </div>
    </div>
  );
}

export default function RaporDetailPage() {
  return (
    <main id="main-content">
      <RaporDetailPageContent />
    </main>
  );
}
