"use client";

import { useState } from "react";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Building2,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

// Shapes returned by GET /foundation/accreditation/readiness
interface ReadinessStandard {
  standardCode: string;
  standardName: string;
  autoScore: number;
  needsManualAssessment: boolean;
}

interface UnitReadiness {
  unitId: string;
  unitName: string;
  npsn: string | null;
  currentGrade: string | null;
  overallReadiness: number;
  standards: ReadinessStandard[];
  recommendedActions: string[];
}

interface ReadinessOverview {
  units: UnitReadiness[];
  averageReadiness: number;
}

function useAccreditationReadiness() {
  return useQuery({
    queryKey: ["foundation", "accreditation-readiness"],
    queryFn: async () => {
      const response = await api.get<{ data: ReadinessOverview }>(
        "/foundation/accreditation/readiness",
      );
      return response.data.data;
    },
  });
}

const getGradeBadge = (grade: string | null) => {
  if (!grade) return <Badge variant="secondary">Belum Terakreditasi</Badge>;
  const colors: Record<string, string> = {
    A: "bg-green-500",
    B: "bg-blue-500",
    C: "bg-yellow-500",
    D: "bg-red-500",
  };
  return <Badge className={colors[grade] || "bg-gray-500"}>{grade}</Badge>;
};

export default function AccreditationReadinessPage() {
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const { data, isLoading } = useAccreditationReadiness();

  const units = data?.units ?? [];
  const filteredUnits =
    selectedUnit === "all"
      ? units
      : units.filter((u) => u.unitId === selectedUnit);

  return (
    <MainLayout
      allowedRoles={["SUPER_ADMIN", "FOUNDATION_ADMIN", "UNIT_ADMIN"]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Kesiapan Akreditasi"
          description="Skor kesiapan akreditasi 8 SNP per unit (dihitung dari data sertifikasi guru, keuangan, dan asesmen mandiri)"
          actions={
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Semua Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Unit</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.unitId} value={u.unitId}>
                    {u.unitName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : units.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Belum ada unit pendidikan terdaftar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Overall Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="md:col-span-2 bg-gradient-to-r from-primary/10 to-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Kesiapan Rata-rata Yayasan
                      </p>
                      <p className="text-4xl font-bold text-primary">
                        {data.averageReadiness}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Dari {units.length} unit pendidikan
                      </p>
                    </div>
                    <div className="p-4 bg-primary/20 rounded-full">
                      <Shield className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Akreditasi A
                      </p>
                      <p className="text-2xl font-bold">
                        {units.filter((u) => u.currentGrade === "A").length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-100 rounded-lg">
                      <ClipboardList className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Perlu Asesmen Manual
                      </p>
                      <p className="text-2xl font-bold">
                        {
                          units.filter((u) =>
                            u.standards.some((s) => s.needsManualAssessment),
                          ).length
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Unit Cards */}
            <div className="grid gap-6">
              {filteredUnits.map((unit) => (
                <Card key={unit.unitId}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-muted rounded-lg">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {unit.unitName}
                            {getGradeBadge(unit.currentGrade)}
                          </CardTitle>
                          <CardDescription>
                            {unit.npsn
                              ? `NPSN: ${unit.npsn}`
                              : "NPSN belum terdaftar"}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold">
                          {unit.overallReadiness}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Skor Kesiapan
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      {unit.standards.map((std) => (
                        <div
                          key={std.standardCode}
                          className={cn(
                            "p-3 border rounded-lg",
                            !std.needsManualAssessment
                              ? "border-green-200 bg-green-50/50"
                              : "border-amber-200 bg-amber-50/50",
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-sm font-medium truncate"
                              title={std.standardName}
                            >
                              {std.standardName}
                            </span>
                            {!std.needsManualAssessment ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={std.autoScore}
                              className="h-2 flex-1"
                            />
                            <span className="text-sm font-bold">
                              {std.autoScore}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {unit.recommendedActions.length > 0 && (
                      <div className="mt-4 p-3 border border-amber-200 bg-amber-50/50 rounded-lg">
                        <p className="text-sm font-medium text-amber-800 mb-1">
                          Rekomendasi:
                        </p>
                        <ul className="text-sm text-amber-700 list-disc pl-5 space-y-0.5">
                          {unit.recommendedActions.map((action) => (
                            <li key={action}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
