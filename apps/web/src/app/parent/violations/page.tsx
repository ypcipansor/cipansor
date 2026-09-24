"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
// Children come from `useParentChildren`'s shared `ParentChild` shape.
// Each of these pages used to declare its own local `Child` with a nested
// `student` object the API never returns — see use-parent-portal.ts.
import type { ParentChild } from "@/hooks/use-parent-portal";
import { AlertTriangle, Calendar, User } from "lucide-react";

interface Violation {
  id: string;
  type: string;
  description: string;
  points: number;
  status: string;
  occurredAt: string;
  reportedBy?: {
    name: string;
  };
  notes?: string;
}

interface ViolationSummary {
  totalViolations: number;
  totalPoints: number;
  byType: Record<string, number>;
}

export default function ViolationsPage() {
  const searchParams = useSearchParams();
  const selectedStudentId = searchParams.get("studentId");

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [violations, setViolations] = useState<Violation[]>([]);
  const [summary, setSummary] = useState<ViolationSummary | null>(null);

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        const res = await api.get("/parent/children");
        const childrenData = res.data.data || [];
        setChildren(childrenData);

        if (childrenData.length > 0) {
          const defaultChild = selectedStudentId
            ? childrenData.find((c: ParentChild) => c.id === selectedStudentId)
                ?.id
            : childrenData[0].id;
          setSelectedChild(defaultChild || childrenData[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch children:", err);
      }
    };

    fetchChildren();
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedChild) return;

    const fetchViolations = async () => {
      setLoading(true);
      try {
        const res = await api.get(
          `/parent/children/${selectedChild}/violations`,
        );
        setViolations(res.data.data.violations || []);
        setSummary(res.data.data.summary || null);
      } catch (err) {
        console.error("Failed to fetch violations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchViolations();
  }, [selectedChild]);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      MINOR: "Ringan",
      MODERATE: "Sedang",
      MAJOR: "Berat",
      CRITICAL: "Sangat Berat",
    };
    return labels[type] || type;
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case "MINOR":
        return "secondary";
      case "MODERATE":
        return "default";
      case "MAJOR":
        return "destructive";
      case "CRITICAL":
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pelanggaran</h1>
          <p className="text-muted-foreground">Riwayat pelanggaran anak</p>
        </div>
        {children.length > 1 && (
          <Select value={selectedChild} onValueChange={setSelectedChild}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Pilih Anak" />
            </SelectTrigger>
            <SelectContent>
              {children.map((child) => (
                <SelectItem key={child.id} value={child.id}>
                  {child.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold">
                    {summary.totalViolations}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Total Pelanggaran
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {summary.totalPoints}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Poin</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-lg font-bold">
                    {summary.totalPoints < 10
                      ? "Baik"
                      : summary.totalPoints < 25
                        ? "Perlu Perhatian"
                        : summary.totalPoints < 50
                          ? "Peringatan"
                          : "Serius"}
                  </div>
                  <p className="text-sm text-muted-foreground">Status</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Violations List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Daftar Pelanggaran
              </CardTitle>
              <CardDescription>
                {violations.length} pelanggaran tercatat
              </CardDescription>
            </CardHeader>
            <CardContent>
              {violations.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-green-600">
                    Tidak ada pelanggaran
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    Anak Anda tidak memiliki catatan pelanggaran
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {violations.map((violation) => (
                    <Card key={violation.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  getTypeBadgeVariant(violation.type) as any
                                }
                              >
                                {getTypeLabel(violation.type)}
                              </Badge>
                              <Badge variant="outline">
                                {violation.points} Poin
                              </Badge>
                            </div>
                            <p className="mt-2">{violation.description}</p>
                            {violation.notes && (
                              <p className="text-sm text-muted-foreground mt-2">
                                Catatan: {violation.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <div className="flex items-center gap-1 justify-end">
                              <Calendar className="h-4 w-4" />
                              {new Date(
                                violation.occurredAt,
                              ).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                            {violation.reportedBy && (
                              <div className="flex items-center gap-1 justify-end mt-1">
                                <User className="h-4 w-4" />
                                {violation.reportedBy.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
