"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Plus,
  Users,
  Bed,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ConfirmDialog, Pagination } from "@/components/shared";
import { toast } from "sonner";
import {
  useCanManageDormitories,
  useDormitories,
  useDeleteDormitory,
  DORMITORY_TYPES,
  DormitoryType,
  Dormitory,
} from "@/hooks/use-dormitory";
import { useUnits } from "@/hooks/use-units";

function DormitoriesPageContent() {
  const [page, setPage] = useState(1);
  const [unitId, setUnitId] = useState<string>("");
  const [type, setType] = useState<DormitoryType | "">("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const limit = 12;

  const { data: dormitoriesData, isLoading } = useDormitories({
    page,
    limit,
    unitId: unitId || undefined,
    type: type || undefined,
  });

  const { data: unitsData } = useUnits();
  const deleteMutation = useDeleteDormitory();
  const canManage = useCanManageDormitories();

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success("Asrama berhasil dihapus");
      setDeleteId(null);
    } catch {
      // The API client has already shown the server's message — an asrama
      // that still houses santri is refused with how many.
    }
  };

  const getTypeColor = (dormitoryType: DormitoryType) => {
    return dormitoryType === "MALE"
      ? "bg-blue-100 text-blue-800"
      : "bg-pink-100 text-pink-800";
  };

  const getOccupancyColor = (current: number, capacity: number) => {
    const ratio = current / capacity;
    if (ratio >= 0.9) return "text-red-600";
    if (ratio >= 0.7) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Asrama</h1>
          <p className="text-muted-foreground">
            Kelola asrama dan kamar santri
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/dormitories/new">
              <Plus className="mr-2 h-4 w-4" />
              Tambah Asrama
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select
              value={unitId}
              onValueChange={(v) => setUnitId(v === "ALL" ? "" : v)}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Semua Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Unit</SelectItem>
                {unitsData?.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={type}
              onValueChange={(v) =>
                setType(v === "ALL" ? "" : (v as DormitoryType))
              }
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Semua Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Tipe</SelectItem>
                {DORMITORY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(unitId || type) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setUnitId("");
                  setType("");
                }}
              >
                Reset Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dormitory Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-6 w-3/4 rounded bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 w-full rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : dormitoriesData?.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Belum ada asrama</h3>
            <p className="mt-2 text-center text-muted-foreground">
              Tambahkan asrama baru untuk mulai mengelola tempat tinggal santri.
            </p>
            {canManage && (
              <Button asChild className="mt-4">
                <Link href="/dormitories/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Asrama
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dormitoriesData?.data.map((dormitory: Dormitory) => (
              <Card key={dormitory.id} className="relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">
                          {dormitory.name}
                        </CardTitle>
                        <Badge className={getTypeColor(dormitory.type)}>
                          {dormitory.type === "MALE" ? "Putra" : "Putri"}
                        </Badge>
                      </div>
                      <CardDescription>{dormitory.code}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span
                        className={`text-sm font-medium ${getOccupancyColor(dormitory.currentOccupancy || 0, dormitory.capacity)}`}
                      >
                        {dormitory.currentOccupancy || 0}/{dormitory.capacity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bed className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {dormitory.capacity - (dormitory.currentOccupancy || 0)}{" "}
                        kosong
                      </span>
                    </div>
                  </div>

                  {/*
                    Rendered even without a unit. A blank line read as missing
                    data; "Yayasan" is the actual answer for an asrama that
                    takes santri from every school.
                  */}
                  <p className="text-sm text-muted-foreground">
                    Pengelola: {dormitory.unit?.name ?? "Yayasan (lintas unit)"}
                  </p>

                  {/* Occupancy Progress Bar */}
                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          (dormitory.currentOccupancy || 0) /
                            dormitory.capacity >=
                          0.9
                            ? "bg-red-500"
                            : (dormitory.currentOccupancy || 0) /
                                  dormitory.capacity >=
                                0.7
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        }`}
                        style={{
                          width: `${Math.min(((dormitory.currentOccupancy || 0) / dormitory.capacity) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(
                        ((dormitory.currentOccupancy || 0) /
                          dormitory.capacity) *
                          100,
                      )}
                      % terisi
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-1">
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            aria-label={`Edit ${dormitory.name}`}
                          >
                            <Link href={`/dormitories/${dormitory.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Hapus ${dormitory.name}`}
                            onClick={() => setDeleteId(dormitory.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dormitories/${dormitory.id}`}>
                        Detail
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {dormitoriesData && dormitoriesData.meta.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={dormitoriesData.meta.totalPages}
              pageSize={limit}
              total={dormitoriesData.meta.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open: boolean) => !open && setDeleteId(null)}
        title="Hapus Asrama"
        description="Asrama yang masih dihuni santri tidak bisa dihapus. Asrama yang dihapus hilang dari daftar."
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}

export default function DormitoriesPageWithShell() {
  return (
    <MainLayout>
      <DormitoriesPageContent />
    </MainLayout>
  );
}
