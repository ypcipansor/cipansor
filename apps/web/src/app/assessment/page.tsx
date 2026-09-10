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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  useAssessments,
  useReportCards,
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABELS,
  ExamType,
  type AssessmentType,
} from "@/hooks";
import { useClasses, useAcademicYears, useSubjects } from "@/hooks";
import {
  ClipboardList,
  Search,
  Plus,
  Eye,
  Edit,
  FileText,
  BarChart3,
  CheckCircle,
  Clock,
  Loader2,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import Link from "next/link";

export default function AssessmentPage() {
  const [activeTab, setActiveTab] = useState("assessments");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssessmentType | "ALL">("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");
  const [semesterFilter, setSemesterFilter] = useState<string>("1");

  const { data: assessments, isLoading: loadingAssessments } = useAssessments({
    type: typeFilter !== "ALL" ? typeFilter : undefined,
    classId: classFilter === "ALL" ? undefined : classFilter,
    subjectId: subjectFilter === "ALL" ? undefined : subjectFilter,
    semester: semesterFilter ? parseInt(semesterFilter) : undefined,
  });
  const { data: reportCards, isLoading: loadingReportCards } = useReportCards({
    classId: classFilter === "ALL" ? undefined : classFilter,
    semester: semesterFilter ? parseInt(semesterFilter) : undefined,
  });
  const { data: classes } = useClasses();
  const { data: academicYears } = useAcademicYears();
  const { data: subjects } = useSubjects();

  const activeAcademicYear = academicYears?.data?.find((ay) => ay.isActive);
  const publishedAssessments =
    assessments?.filter((a) => a.status !== "DRAFT").length ?? 0;
  const draftAssessments =
    assessments?.filter((a) => a.status === "DRAFT").length ?? 0;

  const getAssessmentTypeBadge = (type: AssessmentType) => {
    const colors: Record<AssessmentType, string> = {
      [ExamType.DAILY_TEST]: "bg-gray-100 text-gray-800",
      [ExamType.MIDTERM]: "bg-purple-100 text-purple-800",
      [ExamType.FINAL]: "bg-red-100 text-red-800",
      [ExamType.PRACTICAL]: "bg-green-100 text-green-800",
      [ExamType.PROJECT]: "bg-yellow-100 text-yellow-800",
      [ExamType.QUIZ]: "bg-pink-100 text-pink-800",
      [ExamType.TAHFIDZ_TEST]: "bg-teal-100 text-teal-800",
    };
    return (
      <Badge className={colors[type]}>{ASSESSMENT_TYPE_LABELS[type]}</Badge>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Penilaian</h1>
            <p className="text-muted-foreground">
              Kelola ujian, nilai, dan rapor santri
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/assessment/report-cards">
                <FileText className="mr-2 h-4 w-4" />
                Rapor
              </Link>
            </Button>
            <Button asChild>
              <Link href="/assessment/new">
                <Plus className="mr-2 h-4 w-4" />
                Buat Penilaian
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Penilaian
              </CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {assessments?.length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Semester {semesterFilter || "1"}
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
                {publishedAssessments}
              </div>
              <p className="text-xs text-muted-foreground">
                Nilai sudah dirilis
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
                {draftAssessments}
              </div>
              <p className="text-xs text-muted-foreground">
                Menunggu input nilai
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rapor</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reportCards?.length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {reportCards?.filter((r) => r.isPublished).length ?? 0}{" "}
                dipublikasikan
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="assessments">
              <ClipboardList className="mr-2 h-4 w-4" />
              Penilaian
            </TabsTrigger>
            <TabsTrigger value="report-cards">
              <FileText className="mr-2 h-4 w-4" />
              Rapor
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analitik
            </TabsTrigger>
          </TabsList>

          {/* Assessments Tab */}
          <TabsContent value="assessments" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cari penilaian..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger className="w-full md:w-[150px]">
                      <SelectValue placeholder="Semua Kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Kelas</SelectItem>
                      {classes?.data?.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={subjectFilter}
                    onValueChange={setSubjectFilter}
                  >
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Semua Mapel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Mapel</SelectItem>
                      {subjects?.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={typeFilter}
                    onValueChange={(v) =>
                      setTypeFilter(v as AssessmentType | "ALL")
                    }
                  >
                    <SelectTrigger className="w-full md:w-[130px]">
                      <SelectValue placeholder="Semua Tipe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Tipe</SelectItem>
                      {ASSESSMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ASSESSMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={semesterFilter}
                    onValueChange={setSemesterFilter}
                  >
                    <SelectTrigger className="w-full md:w-[130px]">
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

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Penilaian</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Nilai Max</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAssessments ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : assessments?.length ? (
                    assessments.map((assessment) => (
                      <TableRow key={assessment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{assessment.title}</p>
                            {assessment.description && (
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {assessment.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{assessment.class?.name ?? "-"}</TableCell>
                        <TableCell>{assessment.subject?.name ?? "-"}</TableCell>
                        <TableCell>
                          {getAssessmentTypeBadge(assessment.type)}
                        </TableCell>
                        <TableCell>
                          {format(
                            new Date(assessment.scheduledAt),
                            "d MMM yyyy",
                            { locale: id },
                          )}
                        </TableCell>
                        <TableCell>{assessment.maxScore}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              assessment.status !== "DRAFT"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {assessment.status !== "DRAFT"
                              ? "Dipublikasikan"
                              : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/assessment/${assessment.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <Link
                                href={`/assessment/${assessment.id}/grades`}
                              >
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Belum ada penilaian
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Report Cards Tab */}
          <TabsContent value="report-cards" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Pilih Kelas" />
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
                <Select
                  value={semesterFilter}
                  onValueChange={setSemesterFilter}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Semester 1</SelectItem>
                    <SelectItem value="2">Semester 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button asChild>
                <Link href="/assessment/report-cards/generate">
                  <Plus className="mr-2 h-4 w-4" />
                  Generate Rapor
                </Link>
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NISN</TableHead>
                    <TableHead>Nama Santri</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Semester</TableHead>
                    <TableHead>Rata-rata</TableHead>
                    <TableHead>Peringkat</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingReportCards ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : reportCards?.length ? (
                    reportCards.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-mono text-sm">
                          {report.student?.nisn}
                        </TableCell>
                        <TableCell className="font-medium">
                          {report.student?.user?.name || "-"}
                        </TableCell>
                        <TableCell>{report.class?.name}</TableCell>
                        <TableCell>Semester {report.semester}</TableCell>
                        <TableCell>
                          <span className="font-semibold">
                            {report.averageScore?.toFixed(1) ?? "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {report.rank ? (
                            <Badge variant="outline">#{report.rank}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              report.isPublished ? "default" : "secondary"
                            }
                          >
                            {report.isPublished ? "Dipublikasikan" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link
                                href={`/assessment/report-cards/${report.id}`}
                              >
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
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Belum ada data rapor
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Distribusi Nilai per Tipe</CardTitle>
                  <CardDescription>Berdasarkan semester ini</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {ASSESSMENT_TYPES.map((type) => {
                      const count =
                        assessments?.filter((a) => a.type === type).length ?? 0;
                      const total = assessments?.length ?? 1;
                      const percentage = (count / total) * 100;
                      return (
                        <div key={type} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{ASSESSMENT_TYPE_LABELS[type]}</span>
                            <span>{count} penilaian</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Status Penilaian</CardTitle>
                  <CardDescription>Progres input nilai</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="text-4xl font-bold">
                        {assessments?.length
                          ? Math.round(
                              (publishedAssessments / assessments.length) * 100,
                            )
                          : 0}
                        %
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Sudah dipublikasikan
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          {publishedAssessments}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Dipublikasikan
                        </p>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-yellow-600">
                          {draftAssessments}
                        </div>
                        <p className="text-xs text-muted-foreground">Draft</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
