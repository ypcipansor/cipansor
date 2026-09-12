"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdmissionsStats } from "@cipansor/shared";
import { Users, Clock } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUS_COLORS,
  type RegistrationStatus,
} from "@/hooks/use-admissions";

interface AdmissionsStatsCardProps {
  stats?: AdmissionsStats;
  isLoading?: boolean;
}

/**
 * Dashboard summary of the admissions (PPDB/PSB) pipeline. Rendered only for
 * admin/staff roles — the backend omits `admissions` for everyone else.
 */
export function AdmissionsStatsCard({
  stats,
  isLoading,
}: AdmissionsStatsCardProps) {
  if (isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }
  if (!stats) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> SPMB
            </CardTitle>
            <CardDescription className="text-xs">
              Ringkasan pendaftaran murid/santri baru
            </CardDescription>
          </div>
          <Badge variant="secondary">{stats.activePeriods} Periode Aktif</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
            <p className="text-[10px] font-bold text-blue-600 uppercase">
              Total Pendaftar
            </p>
            <p className="text-2xl font-black text-blue-900">
              {stats.totalRegistrants}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-green-50 border border-green-100">
            <p className="text-[10px] font-bold text-green-600 uppercase">
              Diterima
            </p>
            <p className="text-2xl font-black text-green-900">
              {stats.byStatus["ACCEPTED"] || 0}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
            <Clock className="h-3 w-3" /> Pendaftar Terbaru
          </h4>
          {stats.recentRegistrants.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              Belum ada pendaftar.
            </p>
          ) : (
            <div className="space-y-2">
              {stats.recentRegistrants.map((reg) => (
                <div
                  key={reg.id}
                  className="flex items-center justify-between p-2 rounded-lg border bg-slate-50/30"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold truncate max-w-[140px]">
                      {reg.fullName}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {format(new Date(reg.createdAt), "dd MMM HH:mm", {
                        locale: id,
                      })}
                    </span>
                  </div>
                  <Badge
                    className={`text-[9px] px-1.5 py-0 ${
                      REGISTRATION_STATUS_COLORS[
                        reg.status as RegistrationStatus
                      ] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {REGISTRATION_STATUS_LABELS[
                      reg.status as RegistrationStatus
                    ] || reg.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
