"use client";

import { useState } from "react";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReportCards, usePublishReportCards } from "@/hooks";
import { useClasses, useAcademicYears } from "@/hooks";
import {
  FileText,
  Search,
  Plus,
  Eye,
  Download,
  Send,
  Loader2,
  CheckCircle,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function ReportCardsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("");
  const [semesterFilter, setSemesterFilter] = useState<string>("1");
  const [selectedReportCards, setSelectedReportCards] = useState<string[]>([]);

  const { data: reportCards, isLoading } = useReportCards({
    classId: classFilter || undefined,
    semester: semesterFilter ? parseInt(semesterFilter) : undefined,
  });
  const { data: classes } = useClasses();
  const { data: academicYears } = useAcademicYears();
  const publishReportCards = usePublishReportCards();

  const activeAcademicYear = academicYears?.data?.find((ay) => ay.isActive);

  const filteredReportCards = reportCards?.filter((report) => {
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        report.student?.user?.name?.toLowerCase().includes(searchLower) ||
        report.student?.nisn?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const publishedCount = reportCards?.filter((r) => r.isPublished).length ?? 0;
  const draftCount = reportCards?.filter((r) => !r.isPublished).length ?? 0;

  const handleSelectAll = () => {
    if (selectedReportCards.length === filteredReportCards?.length) {
      setSelectedReportCards([]);
    } else {
      setSelectedReportCards(filteredReportCards?.map((r) => r.id) ?? []);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedReportCards((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleBulkPublish = async () => {
    const unpublishedIds = selectedReportCards.filter(
      (id) => !reportCards?.find((r) => r.id === id)?.isPublished,
    );
    if (unpublishedIds.length === 0) {
      toast.info("Semua rapor yang dipilih sudah dipublikasikan");
      return;
    }
    try {
      await publishReportCards.mutateAsync(unpublishedIds);
      toast.success(`${unpublishedIds.length} rapor berhasil dipublikasikan`);
      setSelectedReportCards([]);
    } catch (error) {
      toast.error("Gagal mempublikasikan rapor");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Rapor Santri
              </h1>
              <p className="text-muted-foreground">
                Kelola dan publikasikan rapor semester
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedReportCards.length > 0 && (
              <Button
                variant="outline"
                onClick={handleBulkPublish}
                disabled={publishReportCards.isPending}
              >
                {publishReportCards.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Publikasikan ({selectedReportCards.length})
              </Button>
            )}
            <Button asChild>
              <Link href="/assessment/report-cards/generate">
                <Plus className="mr-2 h-4 w-4" />
                Generate Rapor
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Rapor</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reportCards?.length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Semester {semesterFilter} {activeAcademicYear?.name}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Dipublikasikan
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {publishedCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Sudah dirilis ke santri
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Draft</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {draftCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Menunggu publikasi
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Rata-rata Kelas
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reportCards?.length
                  ? (
                      reportCards.reduce(
                        (sum, r) => sum + (r.averageScore ?? 0),
                        0,
                      ) / reportCards.length
                    ).toFixed(1)
                  : "-"}
              </div>
              <p className="text-xs text-muted-foreground">Nilai keseluruhan</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau NISN santri..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
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
              <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder="Semester" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Semester 1</SelectItem>
                  <SelectItem value="2">Semester 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Report Cards Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <input
                    type="checkbox"
                    checked={
                      filteredReportCards?.length !== 0 &&
                      selectedReportCards.length === filteredReportCards?.length
                    }
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </TableHead>
                <TableHead>NISN</TableHead>
                <TableHead>Nama Santri</TableHead>
                <TableHead>Kelas</TableHead>
                <TableHead>Semester</TableHead>
                <TableHead className="text-center">Rata-rata</TableHead>
                <TableHead className="text-center">Peringkat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredReportCards?.length ? (
                filteredReportCards.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedReportCards.includes(report.id)}
                        onChange={() => handleSelect(report.id)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {report.student?.nisn}
                    </TableCell>
                    <TableCell className="font-medium">
                      {report.student?.user?.name || "-"}
                    </TableCell>
                    <TableCell>{report.class?.name}</TableCell>
                    <TableCell>Semester {report.semester}</TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`font-semibold ${
                          (report.averageScore ?? 0) >= 80
                            ? "text-green-600"
                            : (report.averageScore ?? 0) >= 70
                              ? "text-blue-600"
                              : "text-red-600"
                        }`}
                      >
                        {report.averageScore?.toFixed(1) ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {report.rank ? (
                        <Badge variant="outline">
                          #{report.rank}/{report.totalStudents}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={report.isPublished ? "default" : "secondary"}
                      >
                        {report.isPublished ? "Dipublikasikan" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/assessment/report-cards/${report.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            href={`/assessment/report-cards/${report.id}/print`}
                          >
                            <Download className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Belum ada data rapor
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </MainLayout>
  );
}
