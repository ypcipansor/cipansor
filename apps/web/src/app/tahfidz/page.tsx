"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  BookOpen,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Calendar as CalendarIcon,
  Filter,
  BarChart3,
  Users,
  BookmarkCheck,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useTahfidzRecords,
  useTahfidzDashboard,
  useDeleteTahfidz,
  TAHFIDZ_TYPES,
  TAHFIDZ_GRADES,
  TahfidzType,
  TahfidzGrade,
} from "@/hooks/use-tahfidz";
import { cn } from "@/lib/utils";

export default function TahfidzPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [type, setType] = useState<string>("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch dashboard stats for accurate summary
  const { data: dashboardStats, isLoading: isStatsLoading } =
    useTahfidzDashboard();

  // Hook now uses the standardized API which returns PaginatedResponse
  // The structure change from flat meta to meta.pagination is handled here
  const { data: response, isLoading } = useTahfidzRecords({
    page,
    limit: pageSize,
    type: (type as TahfidzType) || undefined,
    startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
  });

  const deleteTahfidz = useDeleteTahfidz();

  const records = response?.data || [];
  // Handle nested pagination structure from shared type
  const pagination = response?.meta?.pagination;

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteTahfidz.mutateAsync(deleteId);
      toast.success("Catatan tahfidz berhasil dihapus");
      setDeleteId(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus catatan";
      toast.error(errorMessage);
    }
  };

  const getTypeLabel = (t: TahfidzType) => {
    return TAHFIDZ_TYPES.find((x) => x.value === t)?.label || t;
  };

  const getGradeBadge = (grade: TahfidzGrade) => {
    const gradeConfig = TAHFIDZ_GRADES.find((g) => g.value === grade);
    return (
      <Badge variant="secondary" className={gradeConfig?.color}>
        {gradeConfig?.label.split(" ")[0] || grade}
      </Badge>
    );
  };

  return (
    <MainLayout>
      <PageHeader
        title="Tahfidz Al-Quran"
        description="Kelola catatan hafalan Al-Quran santri"
        action={{
          label: "Tambah Catatan",
          icon: <Plus className="h-4 w-4" />,
          href: "/tahfidz/new",
        }}
      />

      {/* Dashboard Link */}
      <div className="mb-4">
        <Button variant="outline" asChild>
          <Link href="/tahfidz/dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Lihat Dashboard
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Total Setoran
              </span>
            </div>
            <p className="text-2xl font-bold">
              {isStatsLoading ? "..." : dashboardStats?.totalRecords || 0}
            </p>
            <p className="text-xs text-muted-foreground">Tahun ini</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Santri Aktif
              </span>
            </div>
            <p className="text-2xl font-bold">
              {isStatsLoading ? "..." : dashboardStats?.totalStudents || 0}
            </p>
            <p className="text-xs text-muted-foreground">Menghafal tahun ini</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Hafalan Baru
              </span>
            </div>
            <p className="text-2xl font-bold">
              {isStatsLoading
                ? "..."
                : dashboardStats?.recordsByType?.find(
                    (r) => r.type === "ZIYADAH",
                  )?.count || 0}
            </p>
            <p className="text-xs text-muted-foreground">Ziyadah</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Murajaah</span>
            </div>
            <p className="text-2xl font-bold">
              {isStatsLoading
                ? "..."
                : dashboardStats?.recordsByType?.find(
                    (r) => r.type === "MUROJAAH",
                  )?.count || 0}
            </p>
            <p className="text-xs text-muted-foreground">Pengulangan</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select
              value={type || "ALL"}
              onValueChange={(val) => setType(val === "ALL" ? "" : val)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semua Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Tipe</SelectItem>
                {TAHFIDZ_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate
                    ? format(startDate, "d MMM yyyy", { locale: localeId })
                    : "Dari Tanggal"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  autoFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate
                    ? format(endDate, "d MMM yyyy", { locale: localeId })
                    : "Sampai Tanggal"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  autoFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              onClick={() => {
                setType("");
                setStartDate(undefined);
                setEndDate(undefined);
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Santri</TableHead>
                <TableHead>Surah</TableHead>
                <TableHead>Ayat</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Nilai</TableHead>
                <TableHead>Pembimbing</TableHead>
                <TableHead className="w-[120px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">
                      Tidak ada catatan tahfidz
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {safeFormat(new Date(record.recordedAt), "d MMM yyyy", {
                        locale: localeId,
                      })}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {record.student?.user?.name || "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {record.student?.nisn || record.student?.nik || "-"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {record.surahName}
                    </TableCell>
                    <TableCell>
                      {record.ayahStart} - {record.ayahEnd}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getTypeLabel(record.activityType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {record.score !== undefined && record.score !== null
                        ? record.score
                        : record.grade
                          ? getGradeBadge(record.grade as TahfidzGrade)
                          : "-"}
                    </TableCell>
                    <TableCell>{record.recordedBy?.name || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/tahfidz/${record.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/tahfidz/${record.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(record.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pagination && (
        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.limit}
            total={pagination.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Hapus Catatan Tahfidz"
        description="Apakah Anda yakin ingin menghapus catatan tahfidz ini?"
        onConfirm={handleDelete}
        isLoading={deleteTahfidz.isPending}
      />
    </MainLayout>
  );
}
