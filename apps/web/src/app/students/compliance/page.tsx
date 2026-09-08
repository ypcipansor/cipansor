"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Download,
  Eye,
  Pencil,
  Filter,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useUnits } from "@/hooks/use-units";
import {
  useStudentComplianceList,
  useComplianceReport,
  useDapodikReadyReport,
  StudentComplianceData,
} from "@/hooks/use-student-compliance";

const REQUIRED_FIELDS = [
  { key: "nisn", label: "NISN" },
  { key: "nik", label: "NIK" },
  { key: "noAkta", label: "No. Akta Lahir" },
  { key: "noKK", label: "No. KK" },
  { key: "fatherName", label: "Nama Ayah" },
  { key: "motherName", label: "Nama Ibu" },
  { key: "address", label: "Alamat" },
  { key: "villageId", label: "Wilayah" },
];

function calculateCompleteness(student: StudentComplianceData): number {
  let filled = 0;
  REQUIRED_FIELDS.forEach(({ key }) => {
    if (student[key as keyof StudentComplianceData]) {
      filled++;
    }
  });
  return Math.round((filled / REQUIRED_FIELDS.length) * 100);
}

function getMissingFields(student: StudentComplianceData): string[] {
  return REQUIRED_FIELDS.filter(
    ({ key }) => !student[key as keyof StudentComplianceData],
  ).map(({ label }) => label);
}

export default function StudentCompliancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<string>("");

  // Data hooks
  const { data: units } = useUnits();
  const { data: students, isLoading: loadingStudents } =
    useStudentComplianceList({
      search: searchQuery,
      unitId: selectedUnit || undefined,
      status: "ACTIVE",
    });
  const { data: completenessReport, isLoading: loadingReport } =
    useComplianceReport(selectedUnit || undefined);
  const { data: dapodikReport, isLoading: loadingDapodik } =
    useDapodikReadyReport(selectedUnit || undefined);

  // Student columns
  const studentColumns: ColumnDef<StudentComplianceData>[] = [
    {
      accessorKey: "name",
      header: "Nama Siswa",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          <div className="text-sm text-muted-foreground">
            {row.original.nisn}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "nisn",
      header: "NISN",
      cell: ({ row }) => (
        <span className={row.getValue("nisn") ? "" : "text-red-500"}>
          {row.getValue("nisn") || "Belum diisi"}
        </span>
      ),
    },
    {
      accessorKey: "nik",
      header: "NIK",
      cell: ({ row }) => (
        <span className={row.getValue("nik") ? "" : "text-red-500"}>
          {row.getValue("nik") || "Belum diisi"}
        </span>
      ),
    },
    {
      id: "completeness",
      header: "Kelengkapan",
      cell: ({ row }) => {
        const completeness = calculateCompleteness(row.original);
        return (
          <div className="flex items-center gap-2">
            <Progress value={completeness} className="w-16 h-2" />
            <span
              className={
                completeness === 100 ? "text-green-600" : "text-orange-600"
              }
            >
              {completeness}%
            </span>
          </div>
        );
      },
    },
    {
      id: "dapodikReady",
      header: "Dapodik Ready",
      cell: ({ row }) => {
        const missing = getMissingFields(row.original);
        const isReady = missing.length === 0;
        return (
          <Badge variant={isReady ? "default" : "destructive"}>
            {isReady ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" /> Siap
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" /> {missing.length} Field
              </>
            )}
          </Badge>
        );
      },
    },
    {
      id: "unit",
      header: "Unit",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.unit?.name || "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/students/compliance/${row.original.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  // Calculate local stats if API report not available
  const localStats = students
    ? {
        total: students.length,
        complete: students.filter((s) => calculateCompleteness(s) === 100)
          .length,
        incomplete: students.filter((s) => calculateCompleteness(s) < 100)
          .length,
      }
    : { total: 0, complete: 0, incomplete: 0 };

  const stats = [
    {
      title: "Total Siswa",
      value: completenessReport?.totalStudents || localStats.total,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Data Lengkap",
      value: completenessReport?.complete || localStats.complete,
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Data Belum Lengkap",
      value: completenessReport?.incomplete || localStats.incomplete,
      icon: AlertTriangle,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      title: "Siap Dapodik",
      value: dapodikReport?.ready || 0,
      icon: FileCheck,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  return (
    <MainLayout>
      <PageHeader
        title="Kelengkapan Data Siswa"
        description="Kelola data kepatuhan siswa untuk Dapodik dan kebutuhan administrasi Indonesia"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Siswa", href: "/students" },
          { label: "Kelengkapan Data" },
        ]}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Data Kepatuhan Siswa</CardTitle>
              <CardDescription>
                Kelola data identitas, alamat, dan keluarga siswa
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua Unit</SelectItem>
                  {units?.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari siswa..."
                  className="pl-10 w-[200px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="list" className="gap-2">
                <Users className="h-4 w-4" />
                Daftar Siswa
              </TabsTrigger>
              <TabsTrigger value="report" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Laporan Kelengkapan
              </TabsTrigger>
              <TabsTrigger value="dapodik" className="gap-2">
                <FileCheck className="h-4 w-4" />
                Kesiapan Dapodik
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list">
              <DataTable
                columns={studentColumns}
                data={students || []}
                isLoading={loadingStudents}
              />
            </TabsContent>

            <TabsContent value="report">
              <div className="space-y-6">
                {/* Completion Rate */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Tingkat Kelengkapan Data
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <Progress
                        value={completenessReport?.completionRate || 0}
                        className="flex-1 h-4"
                      />
                      <span className="text-2xl font-bold">
                        {completenessReport?.completionRate?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {completenessReport?.complete || 0} dari{" "}
                      {completenessReport?.totalStudents || 0} siswa memiliki
                      data lengkap
                    </p>
                  </CardContent>
                </Card>

                {/* Missing Fields Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Field yang Belum Lengkap
                    </CardTitle>
                    <CardDescription>
                      Rincian field yang masih kosong per siswa
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Jumlah Kosong</TableHead>
                          <TableHead>Persentase</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completenessReport?.missingFields?.map((field) => (
                          <TableRow key={field.field}>
                            <TableCell className="font-medium">
                              {field.field}
                            </TableCell>
                            <TableCell>{field.count} siswa</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={100 - field.percentage}
                                  className="w-16 h-2"
                                />
                                <span>
                                  {(100 - field.percentage).toFixed(1)}% terisi
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {field.percentage === 0 ? (
                                <Badge variant="default">Lengkap</Badge>
                              ) : field.percentage < 20 ? (
                                <Badge variant="secondary">
                                  Hampir Lengkap
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  Perlu Perhatian
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )) || (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center text-muted-foreground"
                            >
                              Memuat data...
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="dapodik">
              <div className="space-y-6">
                {/* Dapodik Readiness */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Kesiapan Data Dapodik
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <Progress
                        value={dapodikReport?.readyPercentage || 0}
                        className="flex-1 h-4"
                      />
                      <span className="text-2xl font-bold">
                        {dapodikReport?.readyPercentage?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span>
                          {dapodikReport?.ready || 0} siswa siap sinkronisasi
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span>
                          {dapodikReport?.notReady || 0} siswa perlu dilengkapi
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Students Not Ready */}
                {dapodikReport?.issues && dapodikReport.issues.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Siswa dengan Data Belum Lengkap
                      </CardTitle>
                      <CardDescription>
                        Siswa yang belum memenuhi persyaratan minimum Dapodik
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>NISN</TableHead>
                            <TableHead>Field yang Kosong</TableHead>
                            <TableHead>Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dapodikReport.issues.slice(0, 10).map((issue) => (
                            <TableRow key={issue.studentId}>
                              <TableCell className="font-medium">
                                {issue.studentName}
                              </TableCell>
                              <TableCell>{issue.nisn}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {issue.missingFields.map((field) => (
                                    <Badge
                                      key={field}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {field}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" asChild>
                                  <Link
                                    href={`/students/compliance/${issue.studentId}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {dapodikReport.issues.length > 10 && (
                        <p className="text-sm text-muted-foreground mt-4">
                          Dan {dapodikReport.issues.length - 10} siswa
                          lainnya...
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
