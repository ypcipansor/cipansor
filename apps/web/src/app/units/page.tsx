"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Eye,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUnits, useDeleteUnit, UNIT_TYPES } from "@/hooks/use-units";

const getUnitTypeLabel = (type: string) => {
  const unitType = UNIT_TYPES.find((t) => t.value === type);
  return unitType?.label || type;
};

const getUnitTypeColor = (type: string) => {
  switch (type) {
    case "PESANTREN":
      return "bg-green-100 text-green-800";
    case "TK_QURAN":
      return "bg-pink-100 text-pink-800";
    case "SD_IT":
      return "bg-blue-100 text-blue-800";
    case "SMP_IT":
      return "bg-purple-100 text-purple-800";
    case "SMA_QURAN":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function UnitsPage() {
  const router = useRouter();
  const { data: units, isLoading } = useUnits();
  const deleteUnit = useDeleteUnit();

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteUnit.mutateAsync(deleteId);
      toast.success("Unit berhasil dihapus");
      setDeleteId(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus unit";
      toast.error(errorMessage);
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="Unit Pendidikan"
        description="Kelola unit-unit pendidikan pesantren"
        action={{
          label: "Tambah Unit",
          icon: <Plus className="h-4 w-4" />,
          href: "/units/new",
        }}
      />

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !units?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Belum ada unit</h3>
            <p className="text-muted-foreground mb-4">
              Mulai dengan menambahkan unit pendidikan pertama
            </p>
            <Button asChild>
              <Link href="/units/new">
                <Plus className="h-4 w-4 mr-2" />
                Tambah Unit
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {units.map((unit) => (
            <Card key={unit.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{unit.name}</CardTitle>
                    <Badge
                      className={getUnitTypeColor(unit.type)}
                      variant="secondary"
                    >
                      {getUnitTypeLabel(unit.type)}
                    </Badge>
                  </div>
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="space-y-2 mb-4">
                  {unit.address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 mt-0.5" />
                      <span className="line-clamp-2">{unit.address}</span>
                    </div>
                  )}
                  {unit.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4" />
                      <span>{unit.phone}</span>
                    </div>
                  )}
                  {unit.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4" />
                      <span>{unit.email}</span>
                    </div>
                  )}
                </CardDescription>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="flex-1"
                  >
                    <Link href={`/units/${unit.id}`}>
                      <Eye className="h-4 w-4 mr-1" />
                      Lihat
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="flex-1"
                  >
                    <Link href={`/units/${unit.id}/edit`}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteId(unit.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Hapus Unit"
        description="Apakah Anda yakin ingin menghapus unit ini? Semua data terkait (kelas, siswa, dll) juga akan terhapus."
        onConfirm={handleDelete}
        isLoading={deleteUnit.isPending}
      />
    </MainLayout>
  );
}
