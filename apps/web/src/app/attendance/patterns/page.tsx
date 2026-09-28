"use client";

import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CheckCircle2, Loader2 } from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAttendancePatterns } from "@/hooks/use-attendance";
import {
  ATTENDANCE_PATTERN_ABSENCE_RATE,
  ATTENDANCE_PATTERN_LATE_COUNT,
  ATTENDANCE_PATTERN_LATE_WINDOW_DAYS,
  ATTENDANCE_PATTERN_MIN_DAYS,
  type AttendancePatternItem,
} from "@cipansor/shared";

/**
 * Pola Kehadiran — the third tier of the attendance follow-up (decided
 * 2026-09-28, decisions/absensi-harian.md). The santri whose attendance shows
 * a pattern now, for their wali kelas, their unit's guru BK and a santri
 * mukim's musyrif: absent on at least 10% of the days recorded this semester,
 * or late three times in 30 days. Each is told once when the pattern appears;
 * this page shows it for as long as it holds.
 */

const AS_LABELS: Record<AttendancePatternItem["as"][number], string> = {
  WALI_KELAS: "Perwalian",
  GURU_BK: "Bimbingan konseling",
  MUSYRIF: "Santri mukim binaan",
};

const dayLabel = (day: string) =>
  format(new Date(`${day}T00:00:00`), "d MMMM yyyy", { locale: localeId });

function PatternCard({ item }: { item: AttendancePatternItem }) {
  const { absence } = item;
  const percent = Math.round(
    (absence.absentDays / Math.max(absence.recordedDays, 1)) * 100,
  );
  const raised = (kind: keyof AttendancePatternItem["raisedAt"]) =>
    item.raisedAt[kind]
      ? ` · ditandai ${format(new Date(item.raisedAt[kind]!), "d MMM", {
          locale: localeId,
        })}`
      : "";

  return (
    <li>
      <Card>
        <CardContent
          className="space-y-3 p-4"
          role="article"
          aria-label={`Pola kehadiran ${item.student.name}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{item.student.name}</p>
              <p className="text-sm text-muted-foreground">
                {[
                  item.class?.name,
                  item.student.nis && `NIS ${item.student.nis}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {item.as.map((a) => (
                <Badge key={a} variant="outline">
                  {AS_LABELS[a]}
                </Badge>
              ))}
            </div>
          </div>

          <ul className="space-y-1 text-sm">
            <li
              className={
                item.kinds.includes("ABSENCE") ? "" : "text-muted-foreground"
              }
            >
              {item.kinds.includes("ABSENCE") && (
                <Badge variant="destructive" className="mr-2">
                  Tidak hadir {percent}%
                </Badge>
              )}
              Tidak hadir {absence.absentDays} dari {absence.recordedDays} hari
              tercatat sejak {dayLabel(absence.since)} — Alpa {absence.alpa},
              Sakit {absence.sakit}, Izin {absence.izin}
              {raised("ABSENCE")}
            </li>
            <li
              className={
                item.kinds.includes("LATE") ? "" : "text-muted-foreground"
              }
            >
              {item.kinds.includes("LATE") && (
                <Badge variant="destructive" className="mr-2">
                  Sering terlambat
                </Badge>
              )}
              Terlambat {item.lateDays} kali dalam{" "}
              {ATTENDANCE_PATTERN_LATE_WINDOW_DAYS} hari terakhir
              {raised("LATE")}
            </li>
          </ul>
        </CardContent>
      </Card>
    </li>
  );
}

export default function AttendancePatternsPage() {
  const { data: items = [], isLoading } = useAttendancePatterns();

  return (
    <MainLayout>
      <PageHeader
        title="Pola Kehadiran"
        description={`Santri yang tidak hadir — Alpa, Sakit, atau Izin — pada ${Math.round(
          ATTENDANCE_PATTERN_ABSENCE_RATE * 100,
        )}% hari atau lebih semester ini (dihitung sesudah ${ATTENDANCE_PATTERN_MIN_DAYS} hari tercatat), atau terlambat ${ATTENDANCE_PATTERN_LATE_COUNT} kali dalam ${ATTENDANCE_PATTERN_LATE_WINDOW_DAYS} hari: santri kelas perwalian, santri mukim binaan, dan — bagi guru BK — santri unitnya.`}
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8" />
            <p>Tidak ada santri Anda dengan pola kehadiran saat ini</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Santri dengan pola kehadiran">
          {items.map((item) => (
            <PatternCard key={item.student.id} item={item} />
          ))}
        </ul>
      )}
    </MainLayout>
  );
}
