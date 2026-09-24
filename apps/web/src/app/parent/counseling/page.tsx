"use client";

import { useEffect, useState } from "react";
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
import { HeartHandshake, Calendar, User } from "lucide-react";

interface CounselingSummary {
  id: string;
  scheduledAt: string;
  status: string;
  summary: string | null;
  recommendations: string | null;
  counselorName: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Terjadwal",
  IN_PROGRESS: "Berlangsung",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export default function ParentCounselingPage() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [sessions, setSessions] = useState<CounselingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: ParentChild[] }>("/parent/children")
      .then((res) => {
        const list = res.data.data || [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
        else setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedChildId) return;
    setIsLoading(true);
    api
      .get<{ data: CounselingSummary[] }>(
        `/parent/children/${selectedChildId}/counseling`,
      )
      .then((res) => setSessions(res.data.data || []))
      .catch(() => setSessions([]))
      .finally(() => setIsLoading(false));
  }, [selectedChildId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Konseling</h1>
          <p className="text-muted-foreground">
            Ringkasan dan rekomendasi sesi konseling yang dibagikan sekolah
          </p>
        </div>
        {children.length > 1 && (
          <Select value={selectedChildId} onValueChange={setSelectedChildId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Pilih anak" />
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

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <HeartHandshake className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Belum ada ringkasan konseling yang dibagikan untuk ananda.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {new Date(session.scheduledAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </CardTitle>
                  <Badge
                    variant={
                      session.status === "COMPLETED" ? "default" : "outline"
                    }
                  >
                    {STATUS_LABELS[session.status] || session.status}
                  </Badge>
                </div>
                {session.counselorName && (
                  <CardDescription className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {session.counselorName}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {session.summary && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Ringkasan
                    </p>
                    <p className="text-sm">{session.summary}</p>
                  </div>
                )}
                {session.recommendations && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Rekomendasi untuk Orang Tua
                    </p>
                    <p className="text-sm text-blue-900">
                      {session.recommendations}
                    </p>
                  </div>
                )}
                {!session.summary && !session.recommendations && (
                  <p className="text-sm text-muted-foreground italic">
                    Belum ada ringkasan tertulis untuk sesi ini.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
