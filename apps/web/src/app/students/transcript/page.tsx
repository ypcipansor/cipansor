"use client";

import { useState, useRef } from "react";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout/main-layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStudents, Student } from "@/hooks/use-students";
import {
  useStudentTahfidzProgress,
  useTahfidzRecords,
  SURAH_LIST,
} from "@/hooks/use-tahfidz";
import { useReportCards, useStudentGrades } from "@/hooks/use-assessment";
import { ReportCard } from "@cipansor/shared";
import { useUnits } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";
import { useAcademicYears } from "@/hooks/use-academic-years";
import {
  FileText,
  Printer,
  Search,
  User,
  GraduationCap,
  BookOpen,
  Calendar,
  TrendingUp,
  Award,
  CheckCircle2,
  Clock,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function StudentTranscriptPage() {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: units = [] } = useUnits();
  const { data: classesData } = useClasses({
    unitId: selectedUnitId || undefined,
  });
  const classes = classesData?.data || [];
  const { data: academicYearsData } = useAcademicYears();
  const academicYears = academicYearsData?.data || [];
  const activeYear = academicYears.find((y) => y.isActive);

  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    unitId: selectedUnitId || undefined,
    classId: selectedClassId || undefined,
    search: searchQuery || undefined,
    status: "ACTIVE",
    limit: 50,
  });

  const students = studentsData?.data || [];

  // Fetch student data
  const { data: tahfidzProgress } = useStudentTahfidzProgress(
    selectedStudent?.id || "",
  );
  const { data: tahfidzRecords } = useTahfidzRecords({
    studentId: selectedStudent?.id,
    limit: 100,
  });
  const { data: reportCardsData } = useReportCards({
    classId: selectedClassId || undefined,
  });
  const reportCards = reportCardsData || [];

  // Filter report cards for selected student
  const studentReportCards = reportCards.filter(
    (rc: ReportCard) => rc.studentId === selectedStudent?.id,
  );

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
  };

  const getStudentInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const handlePrint = () => {
    if (!selectedStudent) {
      toast.error("Pilih siswa terlebih dahulu");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup diblokir. Izinkan popup untuk mencetak.");
      return;
    }

    const printContent = printRef.current?.innerHTML || "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Transkrip - ${selectedStudent.name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 1.5cm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Noto Serif', serif;
              font-size: 11pt;
              line-height: 1.5;
              color: #000;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #000;
              padding: 6px 8px;
              text-align: left;
            }
            th {
              background-color: #f3f4f6;
              font-weight: 600;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            .mb-4 { margin-bottom: 1rem; }
            .mb-6 { margin-bottom: 1.5rem; }
            .border-b { border-bottom: 2px solid #000; }
            .pb-4 { padding-bottom: 1rem; }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);

    toast.success("Transkrip siap dicetak");
  };

  const getGradeLetter = (score: number): string => {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "E";
  };

  const getGradeDescription = (score: number): string => {
    if (score >= 90) return "Sangat Baik";
    if (score >= 80) return "Baik";
    if (score >= 70) return "Cukup";
    if (score >= 60) return "Kurang";
    return "Sangat Kurang";
  };

  const renderTranscriptPreview = () => {
    if (!selectedStudent) return null;

    return (
      <div
        ref={printRef}
        className="bg-white p-8 text-black"
        style={{ width: "210mm", minHeight: "297mm" }}
      >
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <h1 className="text-xl font-bold tracking-wide mb-1">
            TRANSKRIP AKADEMIK
          </h1>
          <h2 className="text-lg font-semibold">
            YAYASAN PENDIDIKAN ISLAM CIPANSOR
          </h2>
          <p className="text-sm">{selectedStudent.unit?.name}</p>
        </div>

        {/* Student Info */}
        <div className="mb-6">
          <h3 className="font-bold text-sm mb-2 uppercase border-b pb-1">
            Data Siswa
          </h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div className="flex">
              <span className="w-32">Nama Lengkap</span>
              <span>
                : <strong>{selectedStudent.name}</strong>
              </span>
            </div>
            <div className="flex">
              <span className="w-32">Jenis Kelamin</span>
              <span>
                :{" "}
                {selectedStudent.gender === "MALE" ? "Laki-laki" : "Perempuan"}
              </span>
            </div>
            <div className="flex">
              <span className="w-32">NISN</span>
              <span>: {selectedStudent.nisn}</span>
            </div>
            <div className="flex">
              <span className="w-32">Tempat, Tgl Lahir</span>
              <span>
                : {selectedStudent.birthPlace || "-"},{" "}
                {safeFormat(
                  new Date(selectedStudent.birthDate),
                  "d MMMM yyyy",
                  {
                    locale: idLocale,
                  },
                )}
              </span>
            </div>
            <div className="flex">
              <span className="w-32">Kelas</span>
              <span>: {selectedStudent.currentClass?.name || "-"}</span>
            </div>
            <div className="flex">
              <span className="w-32">Nama Orang Tua</span>
              <span>: {selectedStudent.parentName || "-"}</span>
            </div>
            <div className="flex">
              <span className="w-32">Status</span>
              <span>
                :{" "}
                <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                  Aktif
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Academic Records */}
        <div className="mb-6">
          <h3 className="font-bold text-sm mb-2 uppercase border-b pb-1">
            A. Rekam Nilai Akademik
          </h3>
          {studentReportCards.length > 0 ? (
            studentReportCards.map((rc: ReportCard, idx: number) => (
              <div key={rc.id} className="mb-4">
                <p className="text-sm font-semibold mb-2">
                  Semester {rc.semester} - TA {rc.academicYear?.name}
                </p>
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="w-8">No</th>
                      <th>Mata Pelajaran</th>
                      <th className="w-16 text-center">Pengetahuan</th>
                      <th className="w-16 text-center">Keterampilan</th>
                      <th className="w-16 text-center">Nilai</th>
                      <th className="w-12 text-center">Predikat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rc.subjects?.map((subj: any, sIdx: number) => (
                      <tr key={subj.subjectId || sIdx}>
                        <td className="text-center">{sIdx + 1}</td>
                        <td>{subj.subject?.name || subj.subjectName}</td>
                        <td className="text-center">
                          {(subj.knowledgeScore ?? 0).toFixed(0)}
                        </td>
                        <td className="text-center">
                          {(subj.skillScore ?? 0).toFixed(0)}
                        </td>
                        <td className="text-center font-semibold">
                          {subj.finalScore.toFixed(0)}
                        </td>
                        <td className="text-center font-bold">
                          {getGradeLetter(subj.finalScore)}
                        </td>
                      </tr>
                    ))}
                    <tr
                      className="font-bold"
                      style={{ backgroundColor: "#f3f4f6" }}
                    >
                      <td colSpan={4} className="text-right">
                        Rata-rata
                      </td>
                      <td className="text-center">
                        {(rc.averageScore || 0).toFixed(1)}
                      </td>
                      <td className="text-center">
                        {getGradeLetter(rc.averageScore || 0)}
                      </td>
                    </tr>
                    {rc.rank && (
                      <tr>
                        <td colSpan={4} className="text-right">
                          Peringkat
                        </td>
                        <td colSpan={2} className="text-center font-semibold">
                          {rc.rank} dari {rc.details?.length || 0} siswa
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic">
              Belum ada data rapor akademik.
            </p>
          )}
        </div>

        {/* Tahfidz Progress */}
        <div className="mb-6">
          <h3 className="font-bold text-sm mb-2 uppercase border-b pb-1">
            B. Progress Tahfidz Al-Quran
          </h3>
          {tahfidzProgress ? (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div className="p-3 bg-green-50 rounded border">
                  <p className="text-xs text-gray-600">Total Surah</p>
                  <p className="text-xl font-bold text-green-700">
                    {tahfidzProgress.summary?.surahCoveredCount || 0}
                  </p>
                </div>
                <div className="p-3 bg-blue-50 rounded border">
                  <p className="text-xs text-gray-600">Total Ayat</p>
                  <p className="text-xl font-bold text-blue-700">
                    {tahfidzProgress.summary?.totalAyahMemorized || 0}
                  </p>
                </div>
                <div className="p-3 bg-amber-50 rounded border">
                  <p className="text-xs text-gray-600">Juz Selesai</p>
                  <p className="text-xl font-bold text-amber-700">
                    {tahfidzProgress.summary?.juzCoveredCount || 0}
                  </p>
                </div>
              </div>

              {tahfidzProgress.surahCovered &&
                tahfidzProgress.surahCovered.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold mb-1">
                      Surah yang dihafal:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {tahfidzProgress.surahCovered.map((s) => (
                        <span
                          key={s.surahNumber}
                          className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded"
                        >
                          {s.surahName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              Belum ada data tahfidz.
            </p>
          )}
        </div>

        {/* Recent Tahfidz Records */}
        {tahfidzRecords?.data && tahfidzRecords.data.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-sm mb-2 uppercase border-b pb-1">
              C. Riwayat Setoran Terakhir
            </h3>
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="w-8">No</th>
                  <th className="w-24">Tanggal</th>
                  <th>Surah</th>
                  <th className="w-24">Ayat</th>
                  <th className="w-20">Jenis</th>
                  <th className="w-20">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {tahfidzRecords.data.slice(0, 10).map((record, idx) => (
                  <tr key={record.id}>
                    <td className="text-center">{idx + 1}</td>
                    <td>
                      {safeFormat(new Date(record.recordedAt), "d MMM yyyy", {
                        locale: idLocale,
                      })}
                    </td>
                    <td>{record.surahName}</td>
                    <td className="text-center">
                      {record.ayahStart} - {record.ayahEnd}
                    </td>
                    <td className="text-center">{record.activityType}</td>
                    <td className="text-center">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800">
                        {record.score !== undefined
                          ? record.score
                          : record.grade || "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t">
          <div className="flex justify-between items-start">
            <div className="text-xs text-gray-600">
              <p>
                Dicetak:{" "}
                {safeFormat(new Date(), "d MMMM yyyy, HH:mm", {
                  locale: idLocale,
                })}
              </p>
              <p>Dokumen ini digenerate otomatis oleh sistem CIPANSOR.</p>
            </div>
            <div className="text-center">
              <p className="text-sm mb-12">Kepala Madrasah</p>
              <p className="text-sm font-semibold">
                (.............................)
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Transkrip Akademik Siswa
            </h1>
            <p className="text-muted-foreground">
              Lihat dan cetak transkrip nilai akademik dan tahfidz siswa
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={handlePrint}
              disabled={!selectedStudent}
            >
              <Printer className="h-4 w-4 mr-2" />
              Cetak Transkrip
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Student Selection */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Pilih Siswa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  value={selectedUnitId || "ALL"}
                  onValueChange={(value) => {
                    const val = value === "ALL" ? "" : value;
                    setSelectedUnitId(val);
                    setSelectedClassId("");
                    setSelectedStudent(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Unit</SelectItem>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedClassId || "ALL"}
                  onValueChange={(value) => {
                    const val = value === "ALL" ? "" : value;
                    setSelectedClassId(val);
                    setSelectedStudent(null);
                  }}
                  disabled={!selectedUnitId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Kelas</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama/NISN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                {studentsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : students.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Tidak ada siswa</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {students.map((student) => {
                      const initials = student.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase();
                      const isSelected = selectedStudent?.id === student.id;

                      return (
                        <div
                          key={student.id}
                          className={`
                            flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                            ${isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted"}
                          `}
                          onClick={() => handleSelectStudent(student)}
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {student.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {student.nisn} •{" "}
                              {student.currentClass?.name || "-"}
                            </p>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Preview Transkrip
                </CardTitle>
                <CardDescription>
                  {selectedStudent ? (
                    <span>
                      Transkrip untuk <strong>{selectedStudent.name}</strong>
                    </span>
                  ) : (
                    "Pilih siswa untuk melihat transkrip"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedStudent ? (
                  <Tabs defaultValue="preview" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                      <TabsTrigger value="academic">Akademik</TabsTrigger>
                      <TabsTrigger value="tahfidz">Tahfidz</TabsTrigger>
                    </TabsList>

                    <TabsContent value="preview" className="mt-4">
                      <div className="border rounded-lg overflow-auto bg-gray-50 max-h-[700px]">
                        <div className="transform scale-75 origin-top-left w-[133%]">
                          {renderTranscriptPreview()}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="academic" className="mt-4 space-y-4">
                      {/* Student Summary Card */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-blue-100 rounded-lg">
                                <GraduationCap className="h-5 w-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Total Rapor
                                </p>
                                <p className="text-xl font-bold">
                                  {studentReportCards.length}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-green-100 rounded-lg">
                                <TrendingUp className="h-5 w-5 text-green-600" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Rata-rata
                                </p>
                                <p className="text-xl font-bold">
                                  {studentReportCards.length > 0
                                    ? (
                                        studentReportCards.reduce(
                                          (sum: number, rc: ReportCard) =>
                                            sum + (rc.averageScore || 0),
                                          0,
                                        ) / studentReportCards.length
                                      ).toFixed(1)
                                    : "-"}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-amber-100 rounded-lg">
                                <Award className="h-5 w-5 text-amber-600" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Best Rank
                                </p>
                                <p className="text-xl font-bold">
                                  {studentReportCards.length > 0
                                    ? Math.min(
                                        ...studentReportCards
                                          .filter((rc: ReportCard) => rc.rank)
                                          .map((rc: ReportCard) => rc.rank!),
                                      )
                                    : "-"}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-purple-100 rounded-lg">
                                <Calendar className="h-5 w-5 text-purple-600" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Tahun Aktif
                                </p>
                                <p className="text-xl font-bold">
                                  {activeYear?.name || "-"}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Report Cards List */}
                      {studentReportCards.length > 0 ? (
                        <div className="space-y-4">
                          {studentReportCards.map((rc: ReportCard) => (
                            <Card key={rc.id}>
                              <CardHeader className="pb-2">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                  <CardTitle className="text-base">
                                    Semester {rc.semester} -{" "}
                                    {rc.academicYear?.name}
                                  </CardTitle>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {rc.rank && (
                                      <Badge variant="outline">
                                        Rank #{rc.rank}
                                      </Badge>
                                    )}
                                    <Badge
                                      className={
                                        (rc.averageScore || 0) >= 80
                                          ? "bg-green-100 text-green-800"
                                          : (rc.averageScore || 0) >= 70
                                            ? "bg-blue-100 text-blue-800"
                                            : "bg-amber-100 text-amber-800"
                                      }
                                    >
                                      {(rc.averageScore || 0).toFixed(1)} (
                                      {getGradeLetter(rc.averageScore || 0)})
                                    </Badge>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                  {rc.subjects
                                    ?.slice(0, 8)
                                    .map((subj: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="p-2 bg-muted rounded-lg text-sm"
                                      >
                                        <p className="truncate font-medium">
                                          {subj.subject?.name ||
                                            subj.subjectName}
                                        </p>
                                        <p className="text-muted-foreground">
                                          {subj.finalScore.toFixed(0)} (
                                          {getGradeLetter(subj.finalScore)})
                                        </p>
                                      </div>
                                    ))}
                                  {rc.subjects && rc.subjects.length > 8 && (
                                    <div className="p-2 bg-muted rounded-lg text-sm flex items-center justify-center">
                                      <p className="text-muted-foreground">
                                        +{rc.subjects.length - 8} lainnya
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Belum ada data rapor akademik</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="tahfidz" className="mt-4 space-y-4">
                      {/* Tahfidz Summary */}
                      {tahfidzProgress ? (
                        <>
                          <div className="grid grid-cols-3 gap-4">
                            <Card>
                              <CardContent className="pt-4 text-center">
                                <BookOpen className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
                                <p className="text-2xl font-bold text-emerald-600">
                                  {tahfidzProgress.summary?.surahCoveredCount ||
                                    0}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Total Surah
                                </p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-4 text-center">
                                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                                <p className="text-2xl font-bold text-blue-600">
                                  {tahfidzProgress.summary?.juzCoveredCount ||
                                    0}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Juz Selesai
                                </p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-4 text-center">
                                <Clock className="h-8 w-8 mx-auto mb-2 text-amber-600" />
                                <p className="text-2xl font-bold text-amber-600">
                                  {tahfidzProgress.summary
                                    ?.totalAyahMemorized || 0}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Total Ayat
                                </p>
                              </CardContent>
                            </Card>
                          </div>

                          {tahfidzProgress.surahCovered &&
                            tahfidzProgress.surahCovered.length > 0 && (
                              <Card>
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-base">
                                    Surah yang Dihafal
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="flex flex-wrap gap-2">
                                    {tahfidzProgress.surahCovered.map((s) => (
                                      <Badge
                                        key={s.surahNumber}
                                        className="bg-emerald-100 text-emerald-800"
                                      >
                                        {s.surahName}
                                      </Badge>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                        </>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Belum ada data tahfidz</p>
                        </div>
                      )}

                      {/* Recent Records */}
                      {tahfidzRecords?.data &&
                        tahfidzRecords.data.length > 0 && (
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base">
                                Riwayat Setoran Terakhir
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                {tahfidzRecords.data
                                  .slice(0, 10)
                                  .map((record) => (
                                    <div
                                      key={record.id}
                                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                                    >
                                      <div>
                                        <p className="font-medium">
                                          {record.surahName}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          Ayat {record.ayahStart} -{" "}
                                          {record.ayahEnd} •{" "}
                                          {record.activityType}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <Badge variant="secondary">
                                          {record.score !== undefined
                                            ? record.score
                                            : record.grade || "-"}
                                        </Badge>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {format(
                                            new Date(record.recordedAt),
                                            "d MMM yyyy",
                                            { locale: idLocale },
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">
                      Pilih siswa untuk melihat transkrip
                    </p>
                    <p className="text-sm">
                      Gunakan filter di sebelah kiri untuk mencari siswa
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
