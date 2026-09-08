"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  FileText,
  Users,
  Download,
  Settings,
  Eye,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Pagination,
  ConfirmDialog,
  PageHeader,
  LoadingSpinner,
} from "@/components/shared";
import { toast } from "sonner";
import { useUnits } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";
import { useAcademicYears } from "@/hooks/use-academic-years";
import {
  useRaporList,
  useGenerateBatchRapor,
  useDeleteRapor,
  RaporListItem,
  RAPOR_STATUS,
} from "@/hooks/use-rapor-pesantren";

const PAGE_SIZE = 10;

function RaporPesantrenPageContent() {
  const router = useRouter();

  // Filters
  const [unitId, setUnitId] = useState<string>("ALL");
  const [classId, setClassId] = useState<string>("ALL");
  const [academicYearId, setAcademicYearId] = useState<string>("ALL");
  const [semester, setSemester] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Queries
  const { data: unitsData } = useUnits();
  const { data: classesData } = useClasses({
    unitId: unitId !== "ALL" ? unitId : undefined,
  });
  const { data: academicYearsData } = useAcademicYears();

  const {
    data: raporData,
    isLoading,
    refetch,
  } = useRaporList({
    unitId: unitId !== "ALL" ? unitId : undefined,
    classId: classId !== "ALL" ? classId : undefined,
    academicYearId: academicYearId !== "ALL" ? academicYearId : undefined,
    semester: semester !== "ALL" ? parseInt(semester) : undefined,
    status: status !== "ALL" ? status : undefined,
    page,
    limit: PAGE_SIZE,
  });

  // Mutations
  const generateBatch = useGenerateBatchRapor();
  const deleteRapor = useDeleteRapor();

  const units = unitsData || [];
  const classes = classesData?.data || [];
  const academicYears = academicYearsData?.data || [];

  const rapors: RaporListItem[] = raporData?.data || [];
  const pagination = raporData?.meta;

  const handleGenerateBatch = async () => {
    if (!unitId || !academicYearId || !semester) {
      toast.error("Pilih unit, tahun ajaran, dan semester terlebih dahulu");
      return;
    }

    try {
      const result = await generateBatch.mutateAsync({
        unitId,
        classId: classId || undefined,
        academicYearId,
        semester: parseInt(semester),
      });

      toast.success(
        `Rapor berhasil digenerate: ${result.success}/${result.total}`,
      );
    } catch {
      toast.error("Gagal generate rapor");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteRapor.mutateAsync(deleteId);
      toast.success("Rapor berhasil dihapus");
      setDeleteId(null);
    } catch {
      toast.error("Gagal menghapus rapor");
    }
  };

  const getStatusBadge = (status: string) => {
    const statusInfo = RAPOR_STATUS[status as keyof typeof RAPOR_STATUS];
    if (!statusInfo) return <Badge variant="outline">{status}</Badge>;

    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      gray: "secondary",
      blue: "default",
      green: "default",
    };

    return (
      <Badge variant={variants[statusInfo.color] || "outline"}>
        {statusInfo.label}
      </Badge>
    );
  };

  const formatScore = (score: number | null) => {
    if (score === null) return "-";
    return score.toFixed(1);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Rapor Pesantren Terintegrasi"
        description="Kelola rapor pesantren yang mengintegrasikan seluruh aspek penilaian santri"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rapor</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagination?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <FileText className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rapors.filter((r) => r.status === "DRAFT").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Final</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rapors.filter((r) => r.status === "FINAL").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terpublikasi</CardTitle>
            <FileText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rapors.filter((r) => r.status === "PUBLISHED").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">
            <FileText className="w-4 h-4 mr-2" />
            Daftar Rapor
          </TabsTrigger>
          <TabsTrigger value="generate">
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Batch
          </TabsTrigger>
          <TabsTrigger
            value="leger"
            onClick={() => router.push("/rapor-pesantren/leger")}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Leger Nilai
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Konfigurasi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Rapor Pesantren</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid gap-4 md:grid-cols-5">
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Unit" />
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

                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kelas" />
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

                <Select
                  value={academicYearId}
                  onValueChange={setAcademicYearId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tahun Ajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua</SelectItem>
                    {academicYears.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua</SelectItem>
                    <SelectItem value="1">Semester 1</SelectItem>
                    <SelectItem value="2">Semester 2</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Status</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="FINAL">Final</SelectItem>
                    <SelectItem value="PUBLISHED">Terpublikasi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : rapors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Tidak ada data rapor
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>NISN</TableHead>
                        <TableHead>Nama Santri</TableHead>
                        <TableHead>Kelas</TableHead>
                        <TableHead>Tahun Ajaran</TableHead>
                        <TableHead>Semester</TableHead>
                        <TableHead>Nilai</TableHead>
                        <TableHead>Predikat</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rapors.map((rapor) => (
                        <TableRow key={rapor.id}>
                          <TableCell className="font-mono">
                            {rapor.studentNisn}
                          </TableCell>
                          <TableCell className="font-medium">
                            {rapor.studentName}
                          </TableCell>
                          <TableCell>{rapor.className || "-"}</TableCell>
                          <TableCell>{rapor.academicYearName}</TableCell>
                          <TableCell>Semester {rapor.semester}</TableCell>
                          <TableCell className="font-semibold">
                            {formatScore(rapor.overallScore)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {rapor.overallGrade || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(rapor.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  router.push(`/rapor-pesantren/${rapor.id}`)
                                }
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteId(rapor.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {pagination && (
                    <Pagination
                      page={page}
                      totalPages={Math.ceil(pagination.total / PAGE_SIZE)}
                      pageSize={PAGE_SIZE}
                      total={pagination.total}
                      onPageChange={setPage}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle>Generate Rapor Batch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unit *</label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Kelas (opsional)
                  </label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Semua Kelas" />
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
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tahun Ajaran *</label>
                  <Select
                    value={academicYearId}
                    onValueChange={setAcademicYearId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Tahun Ajaran" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((year) => (
                        <SelectItem key={year.id} value={year.id}>
                          {year.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Semester *</label>
                  <Select value={semester} onValueChange={setSemester}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Semester" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Semester 1</SelectItem>
                      <SelectItem value="2">Semester 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2">
                  Komponen yang akan dihitung:
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Tahfidz Al-Quran (hafalan, murajaah, tasmi)</li>
                  <li>• Ibadah Harian (sholat, dzikir, tilawah)</li>
                  <li>• Muhadhoroh (latihan pidato/ceramah)</li>
                  <li>• Muhadatsah (latihan percakapan bahasa)</li>
                  <li>• Progress Kitab Kuning</li>
                  <li>• Akhlak & Perilaku (pelanggaran & penghargaan)</li>
                  <li>• Kehadiran</li>
                </ul>
              </div>

              <Button
                onClick={handleGenerateBatch}
                disabled={
                  generateBatch.isPending ||
                  !unitId ||
                  !academicYearId ||
                  !semester
                }
                className="w-full"
              >
                {generateBatch.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate Rapor Batch
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Konfigurasi Bobot Penilaian</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Konfigurasi bobot penilaian dapat diatur per unit. Pilih unit
                terlebih dahulu untuk mengatur bobot.
              </p>

              <div className="space-y-4">
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Pilih Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {unitId && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Tahfidz</span>
                        <span className="text-sm text-muted-foreground">
                          25%
                        </span>
                      </div>
                      <Progress value={25} className="h-2" />
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Ibadah</span>
                        <span className="text-sm text-muted-foreground">
                          20%
                        </span>
                      </div>
                      <Progress value={20} className="h-2" />
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Muhadhoroh</span>
                        <span className="text-sm text-muted-foreground">
                          15%
                        </span>
                      </div>
                      <Progress value={15} className="h-2" />
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Muhadatsah</span>
                        <span className="text-sm text-muted-foreground">
                          15%
                        </span>
                      </div>
                      <Progress value={15} className="h-2" />
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Kitab</span>
                        <span className="text-sm text-muted-foreground">
                          15%
                        </span>
                      </div>
                      <Progress value={15} className="h-2" />
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Akhlak</span>
                        <span className="text-sm text-muted-foreground">
                          10%
                        </span>
                      </div>
                      <Progress value={10} className="h-2" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Hapus Rapor"
        description="Apakah Anda yakin ingin menghapus rapor ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}

export default function RaporPesantrenPageWithShell() {
  return (
    <MainLayout>
      <RaporPesantrenPageContent />
    </MainLayout>
  );
}
