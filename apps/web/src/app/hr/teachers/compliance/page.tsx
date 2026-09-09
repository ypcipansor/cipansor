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
  Award,
  BarChart3,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { type ColumnDef } from "@/components/shared";

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
  useTeacherComplianceList,
  useTeacherComplianceReport,
  useSimtunReadyReport,
  useCertificationReport,
  TeacherComplianceData,
  CERTIFICATION_STATUS,
} from "@/hooks/use-teacher-compliance";

const REQUIRED_FIELDS = [
  { key: "nik", label: "NIK" },
  { key: "noKK", label: "No. KK" },
  { key: "nuptk", label: "NUPTK" },
  { key: "address", label: "Alamat" },
  { key: "villageId", label: "Wilayah" },
  { key: "highestEducation", label: "Pendidikan" },
  { key: "certificationStatus", label: "Status Sertifikasi" },
];

function calculateCompleteness(teacher: TeacherComplianceData): number {
  let filled = 0;
  REQUIRED_FIELDS.forEach(({ key }) => {
    if (teacher[key as keyof TeacherComplianceData]) {
      filled++;
    }
  });
  return Math.round((filled / REQUIRED_FIELDS.length) * 100);
}

function getMissingFields(teacher: TeacherComplianceData): string[] {
  return REQUIRED_FIELDS.filter(
    ({ key }) => !teacher[key as keyof TeacherComplianceData],
  ).map(({ label }) => label);
}

export default function TeacherCompliancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<string>("");

  // Data hooks
  const { data: units } = useUnits();
  const { data: teachers, isLoading: loadingTeachers } =
    useTeacherComplianceList({
      search: searchQuery,
      unitId: selectedUnit || undefined,
    });
  const { data: completenessReport, isLoading: loadingReport } =
    useTeacherComplianceReport(selectedUnit || undefined);
  const { data: simtunReport, isLoading: loadingSimtun } = useSimtunReadyReport(
    selectedUnit || undefined,
  );
  const { data: certificationReport, isLoading: loadingCert } =
    useCertificationReport(selectedUnit || undefined);

  // Teacher columns
  const teacherColumns: ColumnDef<TeacherComplianceData>[] = [
    {
      accessorKey: "user.name",
      header: "Nama Guru",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.user?.name}</div>
          <div className="text-sm text-muted-foreground">
            {row.original.nip || "-"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "nuptk",
      header: "NUPTK",
      cell: ({ row }) => (
        <span className={row.getValue("nuptk") ? "" : "text-red-500"}>
          {row.getValue("nuptk") || "Belum diisi"}
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
      accessorKey: "certificationStatus",
      header: "Sertifikasi",
      cell: ({ row }) => {
        const status = row.getValue("certificationStatus") as string;
        const label =
          CERTIFICATION_STATUS.find((s) => s.value === status)?.label ||
          "Belum diisi";
        const colorMap: Record<string, string> = {
          SUDAH_SERTIFIKASI: "bg-green-100 text-green-800",
          DALAM_PROSES: "bg-yellow-100 text-yellow-800",
          BELUM_SERTIFIKASI: "bg-gray-100 text-gray-800",
        };
        return (
          <Badge className={colorMap[status] || "bg-gray-100 text-gray-800"}>
            {label}
          </Badge>
        );
      },
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
      id: "simtunReady",
      header: "Simtun Ready",
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
            <Link href={`/hr/teachers/compliance/${row.original.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  // Calculate local stats if API report not available
  const localStats = teachers
    ? {
        total: teachers.length,
        complete: teachers.filter((t) => calculateCompleteness(t) === 100)
          .length,
        incomplete: teachers.filter((t) => calculateCompleteness(t) < 100)
          .length,
        certified: teachers.filter(
          (t) => t.certificationStatus === "SUDAH_SERTIFIKASI",
        ).length,
      }
    : { total: 0, complete: 0, incomplete: 0, certified: 0 };

  const stats = [
    {
      title: "Total Guru",
      value: completenessReport?.totalTeachers || localStats.total,
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
      title: "Sudah Sertifikasi",
      value: certificationReport?.certified || localStats.certified,
      icon: Award,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Siap Simtun",
      value: simtunReport?.ready || 0,
      icon: FileCheck,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
  ];

  return (
    <MainLayout>
      <PageHeader
        title="Kelengkapan Data Guru"
        description="Kelola data kepatuhan guru untuk Simtun dan kebutuhan administrasi Indonesia"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "SDM", href: "/hr" },
          { label: "Guru", href: "/hr/teachers" },
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
              <CardTitle>Data Kepatuhan Guru</CardTitle>
              <CardDescription>
                Kelola data identitas, alamat, kepegawaian, dan sertifikasi guru
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
                  placeholder="Cari guru..."
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
                Daftar Guru
              </TabsTrigger>
              <TabsTrigger value="report" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Laporan Kelengkapan
              </TabsTrigger>
              <TabsTrigger value="simtun" className="gap-2">
                <FileCheck className="h-4 w-4" />
                Kesiapan Simtun
              </TabsTrigger>
              <TabsTrigger value="certification" className="gap-2">
                <Award className="h-4 w-4" />
                Sertifikasi
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list">
              <DataTable
                columns={teacherColumns}
                data={teachers || []}
                isLoading={loadingTeachers}
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
                      {completenessReport?.totalTeachers || 0} guru memiliki
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
                      Rincian field yang masih kosong per guru
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
                            <TableCell>{field.count} guru</TableCell>
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

            <TabsContent value="simtun">
              <div className="space-y-6">
                {/* Simtun Readiness */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Kesiapan Data Simtun
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <Progress
                        value={simtunReport?.readyPercentage || 0}
                        className="flex-1 h-4"
                      />
                      <span className="text-2xl font-bold">
                        {simtunReport?.readyPercentage?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span>
                          {simtunReport?.ready || 0} guru siap sinkronisasi
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span>
                          {simtunReport?.notReady || 0} guru perlu dilengkapi
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Teachers Not Ready */}
                {simtunReport?.issues && simtunReport.issues.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Guru dengan Data Belum Lengkap
                      </CardTitle>
                      <CardDescription>
                        Guru yang belum memenuhi persyaratan minimum Simtun
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>NIP</TableHead>
                            <TableHead>Field yang Kosong</TableHead>
                            <TableHead>Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {simtunReport.issues.slice(0, 10).map((issue) => (
                            <TableRow key={issue.teacherId}>
                              <TableCell className="font-medium">
                                {issue.teacherName}
                              </TableCell>
                              <TableCell>{issue.nip || "-"}</TableCell>
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
                                    href={`/hr/teachers/compliance/${issue.teacherId}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {simtunReport.issues.length > 10 && (
                        <p className="text-sm text-muted-foreground mt-4">
                          Dan {simtunReport.issues.length - 10} guru lainnya...
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="certification">
              <div className="space-y-6">
                {/* Certification Overview */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-green-100 p-3 rounded-lg">
                          <Award className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Sudah Sertifikasi
                          </p>
                          <p className="text-2xl font-bold">
                            {certificationReport?.certified || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {certificationReport?.certifiedPercentage?.toFixed(
                              1,
                            ) || 0}
                            % dari total
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-yellow-100 p-3 rounded-lg">
                          <GraduationCap className="h-5 w-5 text-yellow-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Dalam Proses
                          </p>
                          <p className="text-2xl font-bold">
                            {certificationReport?.inProcess || 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-gray-100 p-3 rounded-lg">
                          <AlertTriangle className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Belum Sertifikasi
                          </p>
                          <p className="text-2xl font-bold">
                            {certificationReport?.notCertified || 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Certification by Year */}
                {certificationReport?.byYear &&
                  certificationReport.byYear.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Sertifikasi per Tahun
                        </CardTitle>
                        <CardDescription>
                          Distribusi guru bersertifikat berdasarkan tahun
                          sertifikasi
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tahun</TableHead>
                              <TableHead>Jumlah Guru</TableHead>
                              <TableHead>Persentase</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {certificationReport.byYear.map((item) => (
                              <TableRow key={item.year}>
                                <TableCell className="font-medium">
                                  {item.year}
                                </TableCell>
                                <TableCell>{item.count} guru</TableCell>
                                <TableCell>
                                  {(
                                    (item.count /
                                      (certificationReport.certified || 1)) *
                                    100
                                  ).toFixed(1)}
                                  %
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
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
