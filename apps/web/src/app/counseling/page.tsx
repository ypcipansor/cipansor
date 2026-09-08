"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import {
  Plus,
  Search,
  FileText,
  Clock,
  MessageSquare,
  CheckCircle2,
  TrendingUp,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import {
  useCounselingRecords,
  useCounselingStats,
  useDeleteCounselingRecord,
  COUNSELING_CATEGORIES,
  COUNSELING_STATUSES,
  COUNSELING_PRIORITIES,
  getCounselingCategoryConfig,
  getCounselingStatusConfig,
  getCounselingPriorityConfig,
  type CounselingCategory,
  type CounselingStatus,
  type CounselingPriority,
} from "@/hooks/use-counseling";
import { useUnits } from "@/hooks/use-units";
import { useDebounce } from "@/hooks/use-debounce";

export default function CounselingPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CounselingCategory | "ALL">("ALL");
  const [status, setStatus] = useState<CounselingStatus | "ALL">("ALL");
  const [priority, setPriority] = useState<CounselingPriority | "ALL">("ALL");
  const [unitId, setUnitId] = useState<string>("ALL");

  const debouncedSearch = useDebounce(search, 300);

  const { data: unitsData } = useUnits();
  const units = unitsData || [];

  const { data, isLoading, error } = useCounselingRecords({
    search: debouncedSearch || undefined,
    category: category !== "ALL" ? category : undefined,
    status: status !== "ALL" ? status : undefined,
    priority: priority !== "ALL" ? priority : undefined,
    unitId: unitId !== "ALL" ? unitId : undefined,
  });

  const { data: stats, isLoading: statsLoading } = useCounselingStats(
    unitId !== "ALL" ? unitId : undefined,
  );

  const deleteMutation = useDeleteCounselingRecord();

  const records = data?.data || [];

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus sesi konseling ini?")) return;

    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Sesi konseling berhasil dihapus");
    } catch {
      toast.error("Gagal menghapus sesi konseling");
    }
  };

  // Calculate stats from new structure
  const totalSessions = stats?.totalSessions || 0;
  const countScheduled =
    stats?.byStatus?.find((s) => s.status === "SCHEDULED")?.count || 0;
  const countInProgress =
    stats?.byStatus?.find((s) => s.status === "IN_PROGRESS")?.count || 0;
  const countCompleted =
    stats?.byStatus?.find((s) => s.status === "COMPLETED")?.count || 0;

  return (
    <MainLayout>
      <PageHeader
        title="Bimbingan Konseling"
        description="Kelola sesi konseling dan bimbingan siswa"
        action={{
          label: "Buat Sesi",
          icon: <Plus className="h-4 w-4" />,
          href: "/counseling/new",
        }}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sesi</p>
                <p className="text-2xl font-bold">
                  {statsLoading ? "-" : totalSessions}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Terjadwal</p>
                <p className="text-2xl font-bold">
                  {statsLoading ? "-" : countScheduled}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageSquare className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Proses</p>
                <p className="text-2xl font-bold">
                  {statsLoading ? "-" : countInProgress}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Selesai</p>
                <p className="text-2xl font-bold">
                  {statsLoading ? "-" : countCompleted}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Quick Stats */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribusi Kategori</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {COUNSELING_CATEGORIES.map((cat) => {
              const count =
                stats?.byCategory?.find((c) => c.category === cat.value)
                  ?.count || 0;
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`p-2 rounded-lg text-center transition-all hover:scale-105 ${
                    category === cat.value ? "ring-2 ring-primary" : ""
                  } ${cat.color}`}
                >
                  <span className="text-xl block">{cat.icon}</span>
                  <span className="text-xs font-medium">{count}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari siswa atau judul..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as typeof category)}
            >
              <SelectTrigger className="w-full md:w-36">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua</SelectItem>
                {COUNSELING_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as typeof status)}
            >
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua</SelectItem>
                {COUNSELING_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as typeof priority)}
            >
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Prioritas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua</SelectItem>
                {COUNSELING_PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Unit" />
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
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-muted-foreground">Gagal memuat data</p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => window.location.reload()}
              >
                Coba Lagi
              </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                Belum Ada Sesi Konseling
              </h3>
              <p className="text-muted-foreground mb-4">
                Buat sesi konseling pertama untuk memulai
              </p>
              <Button asChild>
                <Link href="/counseling/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Buat Sesi
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Siswa</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Judul</TableHead>
                  <TableHead>Prioritas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const catConfig = getCounselingCategoryConfig(
                    record.category,
                  );
                  const statusConfig = getCounselingStatusConfig(record.status);
                  const priorityConfig = getCounselingPriorityConfig(
                    record.priority,
                  );

                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {record.student?.user?.name || "Unknown"}
                            {record.isConfidential && (
                              <span title="Rahasia" className="text-xs">
                                🔒
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {record.student?.nisn} •{" "}
                            {record.student?.currentClass?.name || "-"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={catConfig?.color}>
                          {catConfig?.icon} {catConfig?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-xs truncate" title={record.title}>
                          {record.title}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityConfig?.color}>
                          {priorityConfig?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig?.color}>
                          {statusConfig?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {record._count?.notes || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {safeFormat(
                            new Date(record.scheduledAt),
                            "dd MMM yyyy",
                            {
                              locale: localeId,
                            },
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/counseling/${record.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                Lihat Detail
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/counseling/${record.id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(record.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Hapus
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
