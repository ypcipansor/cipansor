"use client";
import { MainLayout } from "@/components/layout";

/**
 * Reports Page
 * Phase 7A.4 - Advanced Reporting Frontend
 * Generate and export various reports
 */

import { useState, useMemo } from "react";
import {
  FileText,
  Download,
  Filter,
  Calendar,
  Users,
  BookOpen,
  Wallet,
  AlertTriangle,
  Award,
  Briefcase,
  CalendarCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useStudentReport,
  useAttendanceReport,
  useTahfidzReport,
  useQuickFinanceReport,
  downloadReport,
  getReportFilename,
  EXPORT_REPORT_TYPES,
  REPORT_CATEGORY_LABELS,
  type ExportReportType,
  type QuickReportParams,
} from "@/hooks/use-reports";
import { useUnits, type Unit } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";

// Icon mapping
const REPORT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  users: Users,
  "calendar-check": CalendarCheck,
  "book-open": BookOpen,
  wallet: Wallet,
  "file-text": FileText,
  "alert-triangle": AlertTriangle,
  award: Award,
  briefcase: Briefcase,
};

// Report category colors
const CATEGORY_COLORS: Record<string, string> = {
  STUDENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ACADEMIC:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  FINANCE:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  HR: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  DISCIPLINE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function ReportsPageContent() {
  // State
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [selectedReport, setSelectedReport] = useState<ExportReportType | null>(
    null,
  );
  const [filters, setFilters] = useState<QuickReportParams>({});
  const [shouldFetch, setShouldFetch] = useState(false);

  // Queries
  const { data: units } = useUnits();
  const { data: classes } = useClasses(
    filters.unitId ? { unitId: filters.unitId } : undefined,
  );

  // Report queries (enabled based on selection and shouldFetch)
  const {
    data: studentReport,
    isLoading: studentLoading,
    refetch: refetchStudents,
  } = useStudentReport(
    filters,
    shouldFetch && selectedReport === "STUDENT_LIST",
  );

  const {
    data: attendanceReport,
    isLoading: attendanceLoading,
    refetch: refetchAttendance,
  } = useAttendanceReport(
    filters,
    shouldFetch && selectedReport === "ATTENDANCE_SUMMARY",
  );

  const {
    data: tahfidzReport,
    isLoading: tahfidzLoading,
    refetch: refetchTahfidz,
  } = useTahfidzReport(
    filters,
    shouldFetch && selectedReport === "TAHFIDZ_PROGRESS",
  );

  const {
    data: financeReport,
    isLoading: financeLoading,
    refetch: refetchFinance,
  } = useQuickFinanceReport(
    {
      unitId: filters.unitId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    shouldFetch && selectedReport === "FINANCIAL_SUMMARY",
  );

  // Group reports by category
  const reportsByCategory = useMemo(() => {
    const grouped: Record<string, typeof EXPORT_REPORT_TYPES> = {};
    for (const report of EXPORT_REPORT_TYPES) {
      if (!grouped[report.category]) {
        grouped[report.category] = [];
      }
      grouped[report.category].push(report);
    }
    return grouped;
  }, []);

  // Handle report selection
  const handleSelectReport = (reportType: ExportReportType) => {
    setSelectedReport(reportType);
    setShouldFetch(false);
    setActiveTab("generate");
  };

  // Handle generate report
  const handleGenerateReport = () => {
    setShouldFetch(true);
    // Refetch based on selected report
    switch (selectedReport) {
      case "STUDENT_LIST":
        refetchStudents();
        break;
      case "ATTENDANCE_SUMMARY":
        refetchAttendance();
        break;
      case "TAHFIDZ_PROGRESS":
        refetchTahfidz();
        break;
      case "FINANCIAL_SUMMARY":
        refetchFinance();
        break;
    }
  };

  // Handle download
  const handleDownload = (format: "JSON" | "CSV") => {
    if (!selectedReport) return;

    let data;
    switch (selectedReport) {
      case "STUDENT_LIST":
        data = studentReport;
        break;
      case "ATTENDANCE_SUMMARY":
        data = attendanceReport;
        break;
      case "TAHFIDZ_PROGRESS":
        data = tahfidzReport;
        break;
      case "FINANCIAL_SUMMARY":
        data = financeReport;
        break;
    }

    if (data) {
      const filename = getReportFilename(selectedReport, format);
      downloadReport(data, filename, format);
    }
  };

  // Check if any report is loading
  const isLoading =
    studentLoading || attendanceLoading || tahfidzLoading || financeLoading;

  // Get current report data
  const currentReportData = useMemo(() => {
    switch (selectedReport) {
      case "STUDENT_LIST":
        return studentReport;
      case "ATTENDANCE_SUMMARY":
        return attendanceReport;
      case "TAHFIDZ_PROGRESS":
        return tahfidzReport;
      case "FINANCIAL_SUMMARY":
        return financeReport;
      default:
        return null;
    }
  }, [
    selectedReport,
    studentReport,
    attendanceReport,
    tahfidzReport,
    financeReport,
  ]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Laporan</h1>
          <p className="text-muted-foreground">
            Generate dan export berbagai laporan pesantren
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Pilih Laporan</TabsTrigger>
          <TabsTrigger value="generate" disabled={!selectedReport}>
            Generate Laporan
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab - Report Selection */}
        <TabsContent value="overview" className="space-y-6">
          {Object.entries(reportsByCategory).map(([category, reports]) => (
            <div key={category}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Badge className={CATEGORY_COLORS[category]}>
                  {REPORT_CATEGORY_LABELS[category]}
                </Badge>
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {reports.map((report) => {
                  const IconComponent = REPORT_ICONS[report.icon] || FileText;
                  return (
                    <Card
                      key={report.type}
                      className={`cursor-pointer transition-all hover:shadow-md hover:border-primary ${
                        selectedReport === report.type
                          ? "border-primary ring-2 ring-primary/20"
                          : ""
                      }`}
                      onClick={() => handleSelectReport(report.type)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg ${CATEGORY_COLORS[report.category]}`}
                          >
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">
                              {report.label}
                            </CardTitle>
                            <CardDescription className="text-sm">
                              {report.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* Generate Tab - Filters and Results */}
        <TabsContent value="generate" className="space-y-6">
          {selectedReport && (
            <>
              {/* Selected Report Info */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      {(() => {
                        const report = EXPORT_REPORT_TYPES.find(
                          (r) => r.type === selectedReport,
                        );
                        const IconComponent = report
                          ? REPORT_ICONS[report.icon] || FileText
                          : FileText;
                        return (
                          <>
                            <div
                              className={`p-2 rounded-lg ${report ? CATEGORY_COLORS[report.category] : ""}`}
                            >
                              <IconComponent className="h-6 w-6" />
                            </div>
                            <div>
                              <CardTitle>{report?.label}</CardTitle>
                              <CardDescription>
                                {report?.description}
                              </CardDescription>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedReport(null);
                        setShouldFetch(false);
                        setActiveTab("overview");
                      }}
                    >
                      Pilih Laporan Lain
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Filters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filter Laporan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* Unit Filter */}
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Select
                        value={filters.unitId || ""}
                        onValueChange={(value) =>
                          setFilters({
                            ...filters,
                            unitId: value || undefined,
                            classId: undefined,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Semua Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Semua Unit</SelectItem>
                          {units?.map((unit: Unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Class Filter (for student/attendance/tahfidz reports) */}
                    {[
                      "STUDENT_LIST",
                      "ATTENDANCE_SUMMARY",
                      "TAHFIDZ_PROGRESS",
                    ].includes(selectedReport) && (
                      <div className="space-y-2">
                        <Label>Kelas</Label>
                        <Select
                          value={filters.classId || ""}
                          onValueChange={(value) =>
                            setFilters({
                              ...filters,
                              classId: value || undefined,
                            })
                          }
                          disabled={!filters.unitId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Semua Kelas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Semua Kelas</SelectItem>
                            {classes?.data?.map((cls) => (
                              <SelectItem key={cls.id} value={cls.id}>
                                {cls.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Date Range (for time-based reports) */}
                    {[
                      "ATTENDANCE_SUMMARY",
                      "TAHFIDZ_PROGRESS",
                      "FINANCIAL_SUMMARY",
                    ].includes(selectedReport) && (
                      <>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Dari Tanggal
                          </Label>
                          <Input
                            type="date"
                            value={filters.startDate || ""}
                            onChange={(e) =>
                              setFilters({
                                ...filters,
                                startDate: e.target.value || undefined,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Sampai Tanggal
                          </Label>
                          <Input
                            type="date"
                            value={filters.endDate || ""}
                            onChange={(e) =>
                              setFilters({
                                ...filters,
                                endDate: e.target.value || undefined,
                              })
                            }
                          />
                        </div>
                      </>
                    )}

                    {/* Status Filter (for student report) */}
                    {selectedReport === "STUDENT_LIST" && (
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={filters.status || ""}
                          onValueChange={(value) =>
                            setFilters({
                              ...filters,
                              status: value || undefined,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Semua Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Semua Status</SelectItem>
                            <SelectItem value="ACTIVE">Aktif</SelectItem>
                            <SelectItem value="INACTIVE">
                              Tidak Aktif
                            </SelectItem>
                            <SelectItem value="GRADUATED">Lulus</SelectItem>
                            <SelectItem value="TRANSFERRED">Pindah</SelectItem>
                            <SelectItem value="DROPPED">Keluar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Generate Button */}
                  <div className="flex gap-2 mt-6">
                    <Button onClick={handleGenerateReport} disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Generate Laporan
                        </>
                      )}
                    </Button>
                    {currentReportData && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => handleDownload("JSON")}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download JSON
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleDownload("CSV")}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download CSV
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Results */}
              {currentReportData && (
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle>Hasil Laporan</CardTitle>
                        <CardDescription>
                          Generated at:{" "}
                          {new Date(
                            currentReportData.generatedAt,
                          ).toLocaleString("id-ID")}
                        </CardDescription>
                      </div>
                      {"totalRecords" in currentReportData &&
                        currentReportData.totalRecords !== undefined && (
                          <Badge variant="secondary">
                            {currentReportData.totalRecords} records
                          </Badge>
                        )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Student Report Table */}
                    {selectedReport === "STUDENT_LIST" && studentReport && (
                      <StudentReportTable data={studentReport.data} />
                    )}

                    {/* Attendance Report */}
                    {selectedReport === "ATTENDANCE_SUMMARY" &&
                      attendanceReport && (
                        <AttendanceReportView data={attendanceReport} />
                      )}

                    {/* Tahfidz Report */}
                    {selectedReport === "TAHFIDZ_PROGRESS" && tahfidzReport && (
                      <TahfidzReportView data={tahfidzReport} />
                    )}

                    {/* Finance Report */}
                    {selectedReport === "FINANCIAL_SUMMARY" &&
                      financeReport && (
                        <FinanceReportView data={financeReport} />
                      )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Student Report Table Component
function StudentReportTable({
  data,
}: {
  data: Array<{
    id: string;
    nisn: string;
    name: string;
    gender: string;
    status: string;
    className: string;
    unitName: string;
  }>;
}) {
  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>NISN</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Kelas</TableHead>
            <TableHead>Unit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground py-8"
              >
                Tidak ada data
              </TableCell>
            </TableRow>
          ) : (
            data.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="font-mono">{student.nisn}</TableCell>
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      student.gender === "MALE" ? "default" : "secondary"
                    }
                  >
                    {student.gender === "MALE" ? "Laki-laki" : "Perempuan"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      student.status === "ACTIVE" ? "default" : "outline"
                    }
                  >
                    {student.status}
                  </Badge>
                </TableCell>
                <TableCell>{student.className}</TableCell>
                <TableCell>{student.unitName}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// Attendance Report View Component
function AttendanceReportView({
  data,
}: {
  data: {
    summary: {
      totalStudents: number;
      averageAttendanceRate: number;
      totalPresent: number;
      totalAbsent: number;
      totalSick: number;
      totalPermitted: number;
      totalLate: number;
    };
    data: Array<{
      studentId: string;
      studentName: string;
      nisn: string;
      className: string;
      totalDays: number;
      present: number;
      absent: number;
      sick: number;
      permitted: number;
      late: number;
      attendanceRate: number;
    }>;
  };
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {data.summary.totalStudents}
            </div>
            <p className="text-xs text-muted-foreground">Total Santri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {data.summary.averageAttendanceRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Rata-rata Kehadiran</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {data.summary.totalPresent}
            </div>
            <p className="text-xs text-muted-foreground">Hadir</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">
              {data.summary.totalAbsent}
            </div>
            <p className="text-xs text-muted-foreground">Absen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">
              {data.summary.totalLate}
            </div>
            <p className="text-xs text-muted-foreground">Terlambat</p>
          </CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NISN</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Kelas</TableHead>
              <TableHead className="text-right">Hadir</TableHead>
              <TableHead className="text-right">Absen</TableHead>
              <TableHead className="text-right">Sakit</TableHead>
              <TableHead className="text-right">Izin</TableHead>
              <TableHead className="text-right">Terlambat</TableHead>
              <TableHead className="text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  Tidak ada data
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((item) => (
                <TableRow key={item.studentId}>
                  <TableCell className="font-mono">{item.nisn}</TableCell>
                  <TableCell className="font-medium">
                    {item.studentName}
                  </TableCell>
                  <TableCell>{item.className}</TableCell>
                  <TableCell className="text-right">{item.present}</TableCell>
                  <TableCell className="text-right text-red-600">
                    {item.absent}
                  </TableCell>
                  <TableCell className="text-right">{item.sick}</TableCell>
                  <TableCell className="text-right">{item.permitted}</TableCell>
                  <TableCell className="text-right text-yellow-600">
                    {item.late}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Badge
                      variant={
                        item.attendanceRate >= 90
                          ? "default"
                          : item.attendanceRate >= 75
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {item.attendanceRate.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Tahfidz Report View Component
function TahfidzReportView({
  data,
}: {
  data: {
    summary: {
      totalStudents: number;
      averageJuz: number;
      completedHafidz: number;
      totalMemorization: number;
      totalMurajaah: number;
    };
    data: Array<{
      studentId: string;
      studentName: string;
      nisn: string;
      className: string;
      totalJuz: number;
      totalSurah: number;
      totalAyat: number;
      progressPercentage: number;
    }>;
  };
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {data.summary.totalStudents}
            </div>
            <p className="text-xs text-muted-foreground">Total Santri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {data.summary.averageJuz.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">Rata-rata Juz</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">
              {data.summary.completedHafidz}
            </div>
            <p className="text-xs text-muted-foreground">Hafidz (30 Juz)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {data.summary.totalMemorization}
            </div>
            <p className="text-xs text-muted-foreground">Total Setoran</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {data.summary.totalMurajaah}
            </div>
            <p className="text-xs text-muted-foreground">Total Murajaah</p>
          </CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NISN</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Kelas</TableHead>
              <TableHead className="text-right">Juz</TableHead>
              <TableHead className="text-right">Surah</TableHead>
              <TableHead className="text-right">Ayat</TableHead>
              <TableHead className="text-right">Progres</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  Tidak ada data
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((item) => (
                <TableRow key={item.studentId}>
                  <TableCell className="font-mono">{item.nisn}</TableCell>
                  <TableCell className="font-medium">
                    {item.studentName}
                  </TableCell>
                  <TableCell>{item.className}</TableCell>
                  <TableCell className="text-right font-medium">
                    {item.totalJuz}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.totalSurah}
                  </TableCell>
                  <TableCell className="text-right">{item.totalAyat}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        item.progressPercentage >= 100 ? "default" : "secondary"
                      }
                    >
                      {item.progressPercentage.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Finance Report View Component
function FinanceReportView({
  data,
}: {
  data: {
    summary: {
      totalIncome: number;
      totalExpense: number;
      netIncome: number;
      pendingPayments: number;
      collectionRate: number;
    };
    incomeByCategory: Array<{
      category: string;
      amount: number;
      percentage: number;
    }>;
    expenseByCategory: Array<{
      category: string;
      amount: number;
      percentage: number;
    }>;
  };
}) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.summary.totalIncome)}
            </div>
            <p className="text-xs text-muted-foreground">Total Pemasukan</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(data.summary.totalExpense)}
            </div>
            <p className="text-xs text-muted-foreground">Total Pengeluaran</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div
              className={`text-2xl font-bold ${data.summary.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatCurrency(data.summary.netIncome)}
            </div>
            <p className="text-xs text-muted-foreground">Pendapatan Bersih</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(data.summary.pendingPayments)}
            </div>
            <p className="text-xs text-muted-foreground">Tunggakan</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {data.summary.collectionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Collection Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Income & Expense by Category */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pemasukan per Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.incomeByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada data</p>
              ) : (
                data.incomeByCategory.map((item) => (
                  <div
                    key={item.category}
                    className="flex justify-between items-center"
                  >
                    <span className="text-sm">{item.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(item.amount)}
                      </span>
                      <Badge variant="secondary">
                        {item.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pengeluaran per Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.expenseByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada data</p>
              ) : (
                data.expenseByCategory.map((item) => (
                  <div
                    key={item.category}
                    className="flex justify-between items-center"
                  >
                    <span className="text-sm">{item.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(item.amount)}
                      </span>
                      <Badge variant="secondary">
                        {item.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ReportsPageWithShell() {
  return (
    <MainLayout>
      <ReportsPageContent />
    </MainLayout>
  );
}
