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
  useTKReports,
  useDeleteTKReport,
  TKNarrativeReport,
  ReportStatus,
} from "@/hooks/use-tk-report";
import { useAcademicYears } from "@/hooks/use-academic-years";
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
import {
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Plus,
  FileText,
  CheckCircle,
  Printer,
  Sparkles,
} from "lucide-react";

import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { getEffectiveRole } from "@/lib/rbac";

const STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: "Draft",
  FINALIZED: "Final",
  PRINTED: "Tercetak",
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  FINALIZED: "bg-blue-100 text-blue-800",
  PRINTED: "bg-green-100 text-green-800",
};

const SEMESTER_LABELS = {
  GANJIL: "Ganjil",
  GENAP: "Genap",
};

export default function TKReportListPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [semesterFilter, setSemesterFilter] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("");
  const [academicYearFilter, setAcademicYearFilter] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: academicYears } = useAcademicYears();
  const { data: classes } = useClasses({ unitId: user?.unitId });

  const { data, isLoading } = useTKReports({
    page,
    limit: pageSize,
    search: search || undefined,
    status: (statusFilter as ReportStatus) || undefined,
    semester: (semesterFilter as "GANJIL" | "GENAP") || undefined,
    classId: classFilter || undefined,
    academicYearId: academicYearFilter || undefined,
    unitId: getEffectiveRole(user) !== "SUPER_ADMIN" ? user?.unitId : undefined,
  });

  const deleteMutation = useDeleteTKReport();

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success("Raport berhasil dihapus");
      setDeleteId(null);
    } catch {
      toast.error("Gagal menghapus raport");
    }
  };

  const columns: ColumnDef<TKNarrativeReport>[] = [
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
              {row.original.student?.nisn}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "academicYear",
      header: "Tahun Ajaran",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            {row.original.academicYear?.name || "-"}
          </p>
          <p className="text-xs text-muted-foreground">
            Semester {SEMESTER_LABELS[row.original.semester]}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          className={cn("font-normal", STATUS_COLORS[row.original.status])}
        >
          {STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: "attendance",
      header: "Kehadiran",
      cell: ({ row }) => (
        <div className="text-sm">
          <span className="font-medium">{row.original.presentDays}</span>
          <span className="text-muted-foreground">
            {" "}
            / {row.original.totalDays} hari
          </span>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Dibuat",
      cell: ({ row }) => (
        <span className="text-sm">
          {safeFormat(new Date(row.original.createdAt), "dd MMM yyyy", {
            locale: idLocale,
          })}
        </span>
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
              onClick={() => router.push(`/paud/reports/${row.original.id}`)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Lihat Detail
            </DropdownMenuItem>
            {row.original.status === "DRAFT" && (
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/paud/reports/${row.original.id}/edit`)
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                window.open(`/api/paud-report/${row.original.id}/pdf`, "_blank")
              }
            >
              <FileText className="mr-2 h-4 w-4" />
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {row.original.status === "DRAFT" && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteId(row.original.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Raport TK Qur'an"
          description="Kelola raport narasi deskriptif siswa TK Qur'an"
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push("/paud/reports/generate")}
                className="transition-all hover:shadow-md hover:-translate-y-0.5 group"
              >
                <Sparkles className="mr-2 h-4 w-4 transition-transform group-hover:rotate-12 group-hover:scale-110" />
                Generate Raport
              </Button>
              <Button
                onClick={() => router.push("/paud/reports/new")}
                className="transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <Plus className="mr-2 h-4 w-4" />
                Buat Manual
              </Button>
            </div>
          }
        />

        {/* Filters */}
        <div className="glass-card p-4 rounded-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 shadow-sm border-none">
          <SearchInput
            placeholder="Cari nama siswa atau NISN..."
            value={search}
            onChange={setSearch}
          />

          <Select
            value={academicYearFilter}
            onValueChange={setAcademicYearFilter}
          >
            <SelectTrigger className="bg-background/50 backdrop-blur-sm border-muted-foreground/20">
              <SelectValue placeholder="Semua Tahun Ajaran" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Tahun Ajaran</SelectItem>
              {academicYears?.data?.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={semesterFilter} onValueChange={setSemesterFilter}>
            <SelectTrigger className="bg-background/50 backdrop-blur-sm border-muted-foreground/20">
              <SelectValue placeholder="Semua Semester" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Semester</SelectItem>
              <SelectItem value="GANJIL">Ganjil</SelectItem>
              <SelectItem value="GENAP">Genap</SelectItem>
            </SelectContent>
          </Select>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="bg-background/50 backdrop-blur-sm border-muted-foreground/20">
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

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-background/50 backdrop-blur-sm border-muted-foreground/20">
              <SelectValue placeholder="Semua Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          pagination={{
            page: page,
            pageSize,
            totalPages: data?.meta?.totalPages || 0,
            total: data?.meta?.total || 0,
            onPageChange: (newPage) => setPage(newPage),
            onPageSizeChange: setPageSize,
          }}
        />

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={() => setDeleteId(null)}
          title="Hapus Raport"
          description="Apakah Anda yakin ingin menghapus raport ini? Tindakan ini tidak dapat dibatalkan."
          onConfirm={handleDelete}
          loading={deleteMutation.isPending}
        />
      </div>
    </MainLayout>
  );
}
