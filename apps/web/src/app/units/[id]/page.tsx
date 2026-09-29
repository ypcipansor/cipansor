"use client";
import { useParams } from "next/navigation";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Building2,
  Pencil,
  MapPin,
  Phone,
  Mail,
  User,
  Calendar,
  Users,
  GraduationCap,
  Loader2,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useUnit, useUnitSummary, UNIT_TYPES } from "@/hooks/use-units";
import { UnitAccreditationCard } from "@/components/units/unit-accreditation-card";
import { getPrimaryRoleCode } from "@/lib/rbac";
import { useAuthStore } from "@/stores/auth";
import { ADMIN_ROLE_CODES } from "@cipansor/shared";

const getUnitTypeLabel = (type: string) => {
  const unitType = UNIT_TYPES.find((t) => t.value === type);
  return unitType?.label || type;
};

const getUnitTypeColor = (type: string) => {
  switch (type) {
    case "PESANTREN":
      return "bg-green-100 text-green-800";
    case "SD_IT":
      return "bg-blue-100 text-blue-800";
    case "SMP_IT":
      return "bg-purple-100 text-purple-800";
    case "SMA_IT":
      return "bg-orange-100 text-orange-800";
    case "MA":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function UnitDetailPage() {
  const params = useParams();
  const unitId = params.id as string;

  const { data: unit, isLoading } = useUnit(unitId);
  const { data: summary, isError: summaryFailed } = useUnitSummary(unitId);
  // The kepala sekolah and the yayasan's organs read this page (Profil Unit);
  // the Super Admin edits every unit, a unit's admin their own (PATCH /units/:id).
  const user = useAuthStore((s) => s.user);
  const roleCode = getPrimaryRoleCode(user);
  const canEdit =
    roleCode === "SUPER_ADMIN" ||
    (!!roleCode &&
      ADMIN_ROLE_CODES.includes(roleCode) &&
      user?.unitId === unitId);
  const count = (n: number | undefined) =>
    n !== undefined ? n.toLocaleString("id-ID") : summaryFailed ? "–" : "…";

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!unit) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <Building2 className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Unit tidak ditemukan</p>
          <Button asChild>
            <Link href="/units">Kembali ke Daftar Unit</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/units">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">
                  {unit.name}
                </h1>
                <Badge
                  className={getUnitTypeColor(unit.type)}
                  variant="secondary"
                >
                  {getUnitTypeLabel(unit.type)}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                Detail informasi unit pendidikan
              </p>
            </div>
          </div>
          {canEdit && (
            <Button asChild>
              <Link href={`/units/${unitId}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Unit
              </Link>
            </Button>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Info Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informasi Unit
              </CardTitle>
              <CardDescription>Data lengkap unit pendidikan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Nama Unit
                  </p>
                  <p className="text-sm">{unit.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Tipe
                  </p>
                  <p className="text-sm">{getUnitTypeLabel(unit.type)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    NPSN
                  </p>
                  <p className="text-sm" data-testid="unit-npsn">
                    {unit.npsn ?? (
                      <span className="text-muted-foreground">
                        Belum diisi
                        {canEdit ? " — isi lewat Edit Unit" : ""}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <Separator />

              {unit.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Alamat
                    </p>
                    <p className="text-sm">{unit.address}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {unit.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Telepon
                      </p>
                      <p className="text-sm">{unit.phone}</p>
                    </div>
                  </div>
                )}

                {unit.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Email
                      </p>
                      <p className="text-sm">{unit.email}</p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Dibuat
                    </p>
                    <p className="text-sm">
                      {safeFormat(new Date(unit.createdAt), "d MMMM yyyy", {
                        locale: localeId,
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Terakhir Diperbarui
                    </p>
                    <p className="text-sm">
                      {safeFormat(new Date(unit.updatedAt), "d MMMM yyyy", {
                        locale: localeId,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle>Statistik Unit</CardTitle>
              <CardDescription>Hari ini, dari data portal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Users className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-students">
                    {count(summary?.activeStudents)}
                  </p>
                  <p className="text-sm text-muted-foreground">Santri aktif</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <GraduationCap className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-teachers">
                    {count(summary?.teachers)}
                  </p>
                  <p className="text-sm text-muted-foreground">Guru</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Building2 className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-classes">
                    {count(summary?.classes)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Kelas tahun ajaran aktif
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <UnitAccreditationCard unitId={unitId} />

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Aksi Cepat</CardTitle>
            <CardDescription>Kelola data terkait unit ini</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/students?unitId=${unitId}`}>
                  <Users className="h-4 w-4 mr-2" />
                  Lihat Siswa
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/users?unitId=${unitId}`}>
                  <User className="h-4 w-4 mr-2" />
                  Lihat Pengguna
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/classes?unitId=${unitId}`}>
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Lihat Kelas
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
