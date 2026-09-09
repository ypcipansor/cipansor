"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@/components/shared";
import { MainLayout } from "@/components/layout";
import {
  PageHeader,
  DataTable,
  SearchInput,
  ConfirmDialog,
} from "@/components/shared";
import {
  useDailyReports,
  useDeleteDailyReport,
  DailyReport,
} from "@/hooks/use-daily-report";
import { useClasses } from "@/hooks/use-classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import {
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Plus,
  Calendar,
  Users,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { getEffectiveRole } from "@/lib/rbac";

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Hadir",
  ABSENT: "Alpha",
  LATE: "Terlambat",
  SICK: "Sakit",
  EXCUSED: "Izin",
};

const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-800",
  ABSENT: "bg-red-100 text-red-800",
  LATE: "bg-yellow-100 text-yellow-800",
  SICK: "bg-orange-100 text-orange-800",
  EXCUSED: "bg-blue-100 text-blue-800",
};

const MOOD_LABELS: Record<string, string> = {
  HAPPY: "😊 Senang",
  NEUTRAL: "😐 Biasa",
  SAD: "😢 Sedih",
  EXCITED: "🤩 Antusias",
  TIRED: "😴 Lelah",
  SICK: "🤒 Sakit",
};

const HEALTH_LABELS: Record<string, string> = {
  HEALTHY: "Sehat",
  SICK: "Sakit",
  RECOVERING: "Pemulihan",
  NEED_ATTENTION: "Perlu Perhatian",
};

const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: "bg-green-100 text-green-800",
  SICK: "bg-red-100 text-red-800",
  RECOVERING: "bg-yellow-100 text-yellow-800",
  NEED_ATTENTION: "bg-orange-100 text-orange-800",
};

export default function DailyReportListPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [attendanceFilter, setAttendanceFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: classes } = useClasses({ unitId: user?.unitId });

  const { data, isLoading } = useDailyReports({
    page,
    limit: pageSize,
    search: search || undefined,
    classId: classFilter !== "ALL" ? classFilter : undefined,
    attendanceStatus: attendanceFilter !== "ALL" ? attendanceFilter : undefined,
    dateFrom: dateRange?.from
      ? format(dateRange.from, "yyyy-MM-dd")
      : undefined,
    dateTo: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
    unitId: getEffectiveRole(user) !== "SUPER_ADMIN" ? user?.unitId : undefined,
  });

  const deleteMutation = useDeleteDailyReport();

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success("Laporan harian berhasil dihapus");
      setDeleteId(null);
    } catch {
      toast.error("Gagal menghapus laporan harian");
    }
  };

  const columns: ColumnDef<DailyReport>[] = [
    {
      accessorKey: "student",
      header: "Siswa",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.student?.photoUrl ? (
            <img
              src={row.original.student.photoUrl}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs font-medium">
                {row.original.student?.user?.name?.[0] || "?"}
              </span>
            </div>
          )}
          <div>
            <p className="font-medium">
              {row.original.student?.user?.name || "-"}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.student?.nisn || "-"}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "reportDate",
      header: "Tanggal",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            {safeFormat(new Date(row.original.reportDate), "EEEE", {
              locale: idLocale,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {safeFormat(new Date(row.original.reportDate), "dd MMM yyyy", {
              locale: idLocale,
            })}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "unitType",
      header: "Unit",
      cell: ({ row }) => (
        <Badge variant="outline" className="font-normal">
          {row.original.unitType.replace("_", " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "mood",
      header: "Kondisi",
      cell: ({ row }) => (
        <div className="space-y-1">
          {row.original.mood && (
            <span className="text-sm">{MOOD_LABELS[row.original.mood]}</span>
          )}
          {row.original.healthStatus && (
            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
              {row.original.healthStatus}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "activitiesSummary",
      header: "Ringkasan Kegiatan",
      cell: ({ row }) => (
        <p className="text-sm text-muted-foreground line-clamp-2 max-w-xs">
          {row.original.activitiesSummary || "-"}
        </p>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                router.push(`/paud/daily-reports/${row.original.id}`)
              }
            >
              <Eye className="mr-2 h-4 w-4" />
              Lihat Detail
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                router.push(`/paud/daily-reports/${row.original.id}/edit`)
              }
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setDeleteId(row.original.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Laporan Harian TK Qur'an"
          description="Kelola laporan harian aktivitas siswa TK Qur'an"
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push("/paud/daily-reports/check-in")}
              >
                <Users className="mr-2 h-4 w-4" />
                Check-in Kelas
              </Button>
              <Button onClick={() => router.push("/paud/daily-reports/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Buat Laporan
              </Button>
            </div>
          }
        />

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SearchInput
            placeholder="Cari nama siswa..."
            value={search}
            onChange={setSearch}
          />

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger>
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

          <Select value={attendanceFilter} onValueChange={setAttendanceFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Semua Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        </div>

        {/* Quick Date Filters */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const today = new Date();
              setDateRange({ from: today, to: today });
            }}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Hari Ini
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const today = new Date();
              const weekAgo = new Date(today);
              weekAgo.setDate(weekAgo.getDate() - 7);
              setDateRange({ from: weekAgo, to: today });
            }}
          >
            7 Hari Terakhir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const today = new Date();
              const monthAgo = new Date(today);
              monthAgo.setMonth(monthAgo.getMonth() - 1);
              setDateRange({ from: monthAgo, to: today });
            }}
          >
            30 Hari Terakhir
          </Button>
          {dateRange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateRange(undefined)}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          pagination={{
            page: page,
            pageSize,
            totalPages: data?.meta?.pagination?.totalPages || 0,
            total: data?.meta?.pagination?.total || 0,
            onPageChange: (newPage) => setPage(newPage),
            onPageSizeChange: setPageSize,
          }}
        />

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={() => setDeleteId(null)}
          title="Hapus Laporan Harian"
          description="Apakah Anda yakin ingin menghapus laporan harian ini? Tindakan ini tidak dapat dibatalkan."
          onConfirm={handleDelete}
          loading={deleteMutation.isPending}
        />
      </div>
    </MainLayout>
  );
}
