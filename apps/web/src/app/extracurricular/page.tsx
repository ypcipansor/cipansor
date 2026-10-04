"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Users,
  Calendar,
  Trophy,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Clock,
  MapPin,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

import {
  useExtracurriculars,
  useDeleteExtracurricular,
  EXTRACURRICULAR_CATEGORIES,
  getCategoryConfig,
  formatSchedule,
  EXTRACURRICULAR_STATUS_LABELS,
  type ExtracurricularCategory,
  type ExtracurricularStatus,
} from "@/hooks/use-extracurricular";
import { useUnits } from "@/hooks/use-units";
import { useDebounce } from "@/hooks/use-debounce";

export default function ExtracurricularPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ExtracurricularCategory | "ALL">(
    "ALL",
  );
  const [status, setStatus] = useState<ExtracurricularStatus | "ALL">("ALL");
  const [unitId, setUnitId] = useState<string>("ALL");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const debouncedSearch = useDebounce(search, 300);

  const { data: unitsData } = useUnits();
  const units = unitsData || [];

  const { data, isLoading, error } = useExtracurriculars({
    search: debouncedSearch || undefined,
    category: category !== "ALL" ? category : undefined,
    status: status !== "ALL" ? status : undefined,
    unitId: unitId !== "ALL" ? unitId : undefined,
  });

  const deleteMutation = useDeleteExtracurricular();

  const extracurriculars = data?.data || [];

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success("Ekstrakurikuler berhasil dihapus");
      setDeleteId(null);
    } catch {
      toast.error("Gagal menghapus ekstrakurikuler");
    }
  };

  // Stats calculation
  const stats = {
    total: extracurriculars.length,
    active: extracurriculars.filter((e) => e.status === "ACTIVE").length,
    totalMembers: extracurriculars.reduce(
      (acc, e) => acc + (e._count?.enrollments ?? 0),
      0,
    ),
    byCategory: EXTRACURRICULAR_CATEGORIES.map((cat) => ({
      ...cat,
      count: extracurriculars.filter((e) => e.category === cat.value).length,
    })),
  };

  return (
    <MainLayout>
      <PageHeader
        title="Ekstrakurikuler"
        description="Kelola kegiatan ekstrakurikuler dan keanggotaan santri"
        action={{
          label: "Tambah Ekskul",
          icon: <Plus className="h-4 w-4" />,
          href: "/extracurricular/new",
        }}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Trophy className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Ekskul</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ekskul Aktif</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Anggota</p>
                <p className="text-2xl font-bold">{stats.totalMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-2">Per Kategori</p>
            <div className="flex flex-wrap gap-1">
              {stats.byCategory
                .filter((c) => c.count > 0)
                .slice(0, 4)
                .map((cat) => (
                  <Badge
                    key={cat.value}
                    variant="secondary"
                    className="text-xs"
                  >
                    {cat.icon} {cat.count}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari ekstrakurikuler..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as typeof category)}
            >
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Kategori</SelectItem>
                {EXTRACURRICULAR_CATEGORIES.map((cat) => (
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
              <SelectTrigger className="w-full md:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="ACTIVE">Aktif</SelectItem>
                <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
                <SelectItem value="SUSPENDED">Ditangguhkan</SelectItem>
              </SelectContent>
            </Select>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="w-full md:w-44">
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
            <div className="flex gap-2">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("grid")}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              Gagal memuat data ekstrakurikuler
            </p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : extracurriculars.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              Belum Ada Ekstrakurikuler
            </h3>
            <p className="text-muted-foreground mb-4">
              Tambahkan kegiatan ekstrakurikuler pertama untuk memulai
            </p>
            <Button asChild>
              <Link href="/extracurricular/new">
                <Plus className="h-4 w-4 mr-2" />
                Tambah Ekskul
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {extracurriculars.map((ekskul) => {
            const catConfig = getCategoryConfig(ekskul.category);
            const members = ekskul._count?.enrollments ?? 0;
            const capacity = ekskul.maxParticipants;
            const memberProgress = capacity ? (members / capacity) * 100 : 0;
            const schedule = formatSchedule(ekskul);

            return (
              <Card
                key={ekskul.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{catConfig?.icon}</span>
                      <div>
                        <CardTitle className="text-lg">{ekskul.name}</CardTitle>
                        <CardDescription>{ekskul.code}</CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/extracurricular/${ekskul.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            Lihat Detail
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/extracurricular/${ekskul.id}/edit`}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(ekskul.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Category & Status */}
                    <div className="flex items-center gap-2">
                      <Badge className={catConfig?.color}>
                        {catConfig?.label}
                      </Badge>
                      <Badge
                        variant={
                          ekskul.status === "ACTIVE" ? "default" : "secondary"
                        }
                      >
                        {EXTRACURRICULAR_STATUS_LABELS[ekskul.status]}
                      </Badge>
                    </div>

                    {/* Description */}
                    {ekskul.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {ekskul.description}
                      </p>
                    )}

                    {/* Members */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Anggota
                        </span>
                        <span>
                          {members}
                          {capacity ? ` / ${capacity}` : ""}
                        </span>
                      </div>
                      {Boolean(capacity) && (
                        <Progress value={memberProgress} className="h-1.5" />
                      )}
                    </div>

                    {/* Coach */}
                    {ekskul.coach && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Pembina:</span>{" "}
                        {ekskul.coach.user.name}
                      </p>
                    )}

                    {/* Schedule Preview */}
                    {schedule && (
                      <p className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {schedule}
                        {ekskul.venue ? ` · ${ekskul.venue}` : ""}
                      </p>
                    )}

                    {/* Unit */}
                    {ekskul.unit && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {ekskul.unit.name}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="divide-y">
            {extracurriculars.map((ekskul) => {
              const catConfig = getCategoryConfig(ekskul.category);

              return (
                <div
                  key={ekskul.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{catConfig?.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{ekskul.name}</p>
                        <Badge className={catConfig?.color} variant="secondary">
                          {catConfig?.label}
                        </Badge>
                        <Badge
                          variant={
                            ekskul.status === "ACTIVE" ? "default" : "outline"
                          }
                        >
                          {EXTRACURRICULAR_STATUS_LABELS[ekskul.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {ekskul._count?.enrollments ?? 0} anggota •{" "}
                        {ekskul.coach?.user.name ?? "Belum ada pembina"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/extracurricular/${ekskul.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        Detail
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/extracurricular/${ekskul.id}/edit`}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(ekskul.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Ekstrakurikuler?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Semua data terkait termasuk
              pendaftaran anggota dan prestasi akan ikut terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
