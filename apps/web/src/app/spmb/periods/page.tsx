"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import type { AdmissionPeriodDTO } from "@cipansor/shared";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdmissionPeriods } from "@/hooks/use-admissions";
import { useAuth } from "@/hooks/use-auth";
import { formatDays, wibDay } from "@/lib/admission-intake";
import { canManageIntake } from "@/lib/admission-intake-access";

/**
 * Every unit's SPMB intakes, newest first. A period is one unit's intake for
 * one academic year; its page holds the waves.
 */
export default function AdmissionPeriodsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useAdmissionPeriods({ limit: 100 });
  const periods: AdmissionPeriodDTO[] = data?.data ?? [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            title="Periode & Gelombang SPMB"
            description="Penerimaan tiap unit per tahun ajaran: tanggal, gelombang, persyaratan, dan narahubung yang diumumkan di situs."
          />
          {canManageIntake(user) && (
            <Button asChild>
              <Link href="/spmb/periods/new" data-testid="period-add">
                <Plus className="mr-2 h-4 w-4" /> Tambah Periode
              </Link>
            </Button>
          )}
        </div>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periode</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Tahun ajaran</TableHead>
                <TableHead>Pendaftaran</TableHead>
                <TableHead className="text-right">Pendaftar</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : periods.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Belum ada periode penerimaan.
                  </TableCell>
                </TableRow>
              ) : (
                periods.map((p) => (
                  <TableRow key={p.id} data-testid="period-row">
                    <TableCell className="font-medium">
                      <Link
                        href={`/spmb/periods/${p.id}`}
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.unit?.name}</TableCell>
                    <TableCell>{p.academicYear?.name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDays(wibDay(p.startDate), wibDay(p.endDate))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p._count?.registrants ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? "default" : "secondary"}>
                        {p.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </MainLayout>
  );
}
