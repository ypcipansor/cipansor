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
import {
  Heart,
  Activity,
  Calendar,
  User,
  Stethoscope,
  Pill,
  AlertTriangle,
} from "lucide-react";

interface HealthRecord {
  id: string;
  type: string;
  diagnosis?: string;
  symptoms?: string;
  treatment?: string;
  notes?: string;
  visitedAt: string;
  treatedBy?: {
    name: string;
  };
  status: string;
}

interface HealthProfile {
  bloodType?: string;
  allergies?: string[];
  chronicConditions?: string[];
  medications?: string[];
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
}

interface HealthSummary {
  totalVisits: number;
  lastVisit?: string;
  recentConditions: string[];
}

export default function HealthPage() {
  const searchParams = useSearchParams();
  const selectedStudentId = searchParams.get("studentId");

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [summary, setSummary] = useState<HealthSummary | null>(null);

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

    const fetchHealth = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/parent/children/${selectedChild}/health`);
        setRecords(res.data.data.records || []);
        setProfile(res.data.data.profile || null);
        setSummary(res.data.data.summary || null);
      } catch (err) {
        console.error("Failed to fetch health:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, [selectedChild]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "CHECKUP":
        return <Stethoscope className="h-5 w-5 text-blue-500" />;
      case "TREATMENT":
        return <Pill className="h-5 w-5 text-green-500" />;
      case "EMERGENCY":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      CHECKUP: "Pemeriksaan",
      TREATMENT: "Pengobatan",
      EMERGENCY: "Darurat",
      SICK: "Sakit",
      INJURY: "Cedera",
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RECOVERED":
        return <Badge className="bg-green-500">Sembuh</Badge>;
      case "ONGOING":
        return <Badge className="bg-yellow-500">Dalam Perawatan</Badge>;
      case "REFERRED":
        return <Badge variant="outline">Dirujuk</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kesehatan</h1>
          <p className="text-muted-foreground">Riwayat kesehatan anak di UKS</p>
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
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Health Profile & Summary */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Profile Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Heart className="h-5 w-5 text-pink-500" />
                  Profil Kesehatan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile?.bloodType && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Golongan Darah:
                    </span>
                    <Badge className="ml-2 bg-red-500">
                      {profile.bloodType}
                    </Badge>
                  </div>
                )}
                {profile?.allergies && profile.allergies.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Alergi:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.allergies.map((allergy, idx) => (
                        <Badge
                          key={idx}
                          variant="destructive"
                          className="text-xs"
                        >
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {profile?.chronicConditions &&
                  profile.chronicConditions.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground">
                        Kondisi Kronis:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {profile.chronicConditions.map((condition, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs"
                          >
                            {condition}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                {profile?.medications && profile.medications.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Obat Rutin:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.medications.map((med, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="text-xs"
                        >
                          {med}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {!profile?.bloodType &&
                  !profile?.allergies?.length &&
                  !profile?.chronicConditions?.length && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Belum ada data profil kesehatan
                    </p>
                  )}
              </CardContent>
            </Card>

            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-blue-500" />
                  Ringkasan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm">Total Kunjungan UKS</span>
                  <span className="text-2xl font-bold">
                    {summary?.totalVisits || 0}
                  </span>
                </div>
                {summary?.lastVisit && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm">Kunjungan Terakhir</span>
                    <span className="font-medium">
                      {new Date(summary.lastVisit).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
                {summary?.recentConditions &&
                  summary.recentConditions.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground">
                        Keluhan Terakhir:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {summary.recentConditions.map((cond, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs"
                          >
                            {cond}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>

          {/* Health Records */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Riwayat Kunjungan UKS
              </CardTitle>
              <CardDescription>
                {records.length} kunjungan tercatat
              </CardDescription>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <div className="text-center py-8">
                  <Heart className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-green-600">Sehat!</h3>
                  <p className="text-muted-foreground mt-2">
                    Tidak ada riwayat kunjungan UKS
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {records.map((record) => (
                    <Card key={record.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="p-2 rounded-full bg-muted">
                            {getTypeIcon(record.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {getTypeLabel(record.type)}
                              </span>
                              {getStatusBadge(record.status)}
                            </div>
                            {record.diagnosis && (
                              <p className="mt-1">
                                <span className="text-sm text-muted-foreground">
                                  Diagnosis:
                                </span>{" "}
                                {record.diagnosis}
                              </p>
                            )}
                            {record.symptoms && (
                              <p className="text-sm text-muted-foreground">
                                Gejala: {record.symptoms}
                              </p>
                            )}
                            {record.treatment && (
                              <p className="text-sm text-muted-foreground">
                                Tindakan: {record.treatment}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {new Date(record.visitedAt).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </div>
                              {record.treatedBy && (
                                <div className="flex items-center gap-1">
                                  <User className="h-4 w-4" />
                                  {record.treatedBy.name}
                                </div>
                              )}
                            </div>
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
