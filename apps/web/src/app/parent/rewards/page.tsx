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
import { Award, Trophy, Star, Calendar, User } from "lucide-react";

interface Reward {
  id: string;
  type: string;
  title: string;
  description?: string;
  points: number;
  awardedAt: string;
  awardedBy?: {
    name: string;
  };
}

interface RewardSummary {
  totalRewards: number;
  totalPoints: number;
  byType: Record<string, number>;
}

export default function RewardsPage() {
  const searchParams = useSearchParams();
  const selectedStudentId = searchParams.get("studentId");

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [summary, setSummary] = useState<RewardSummary | null>(null);

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

    const fetchRewards = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/parent/children/${selectedChild}/rewards`);
        setRewards(res.data.data.rewards || []);
        setSummary(res.data.data.summary || null);
      } catch (err) {
        console.error("Failed to fetch rewards:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRewards();
  }, [selectedChild]);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      ACADEMIC: "Akademik",
      TAHFIDZ: "Tahfidz",
      BEHAVIOR: "Perilaku",
      COMPETITION: "Kompetisi",
      ATTENDANCE: "Kehadiran",
      OTHER: "Lainnya",
    };
    return labels[type] || type;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "ACADEMIC":
        return <Star className="h-5 w-5 text-blue-500" />;
      case "TAHFIDZ":
        return <Star className="h-5 w-5 text-green-500" />;
      case "COMPETITION":
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      default:
        return <Award className="h-5 w-5 text-purple-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Penghargaan</h1>
          <p className="text-muted-foreground">
            Penghargaan yang diterima anak
          </p>
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
                  <Trophy className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold">
                    {summary.totalRewards}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Total Penghargaan
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Star className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-yellow-600">
                    {summary.totalPoints}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Poin</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Award className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                  <div className="text-lg font-bold">
                    {summary.totalPoints < 10
                      ? "Pemula"
                      : summary.totalPoints < 50
                        ? "Berkembang"
                        : summary.totalPoints < 100
                          ? "Berprestasi"
                          : "Teladan"}
                  </div>
                  <p className="text-sm text-muted-foreground">Predikat</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Rewards List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Daftar Penghargaan
              </CardTitle>
              <CardDescription>
                {rewards.length} penghargaan diterima
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rewards.length === 0 ? (
                <div className="text-center py-8">
                  <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">Belum ada penghargaan</h3>
                  <p className="text-muted-foreground mt-2">
                    Anak Anda belum menerima penghargaan
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rewards.map((reward) => (
                    <Card
                      key={reward.id}
                      className="bg-linear-to-r from-yellow-50 to-orange-50 border-yellow-200"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="p-2 rounded-full bg-yellow-100">
                            {getTypeIcon(reward.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{reward.title}</p>
                              <Badge variant="secondary">
                                {getTypeLabel(reward.type)}
                              </Badge>
                              <Badge className="bg-yellow-500">
                                {reward.points} Poin
                              </Badge>
                            </div>
                            {reward.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {reward.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {new Date(reward.awardedAt).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </div>
                              {reward.awardedBy && (
                                <div className="flex items-center gap-1">
                                  <User className="h-4 w-4" />
                                  {reward.awardedBy.name}
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
