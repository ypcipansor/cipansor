"use client";

import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Users, TrendingDown, AlertTriangle } from "lucide-react";
import type {
  AttendanceCalendarResponse,
  AttendanceCalendarDay,
} from "@cipansor/shared";
import { useClasses } from "@/hooks/use-classes";
import { useAuthStore } from "@/stores/auth";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

const getHeatmapColor = (attendanceRate: number) => {
  if (attendanceRate >= 95) return "bg-green-500";
  if (attendanceRate >= 90) return "bg-green-400";
  if (attendanceRate >= 85) return "bg-yellow-400";
  if (attendanceRate >= 80) return "bg-orange-400";
  if (attendanceRate >= 75) return "bg-orange-500";
  return "bg-red-500";
};

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function AttendanceHeatmapPage() {
  const { user } = useAuthStore();

  // Last 6 months as selectable options.
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric",
        }),
      });
    }
    return opts;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [hoveredCell, setHoveredCell] = useState<{
    class: string;
    date: string;
  } | null>(null);

  const { data: classesResp, isLoading: classesLoading } = useClasses({
    unitId: user?.unitId,
    limit: 100,
  });
  const classList = useMemo(() => classesResp?.data ?? [], [classesResp]);

  // Parse the selected month (value is 1-indexed; the calendar API wants 0-indexed).
  const [year, month1] = selectedMonth.split("-").map(Number);
  const apiMonth = month1 - 1;
  const daysInMonth = new Date(year, month1, 0).getDate();
  const firstDayOfMonth = new Date(year, month1 - 1, 1).getDay();

  const visibleClasses = useMemo(
    () =>
      selectedClass === "all"
        ? classList
        : classList.filter((c) => c.id === selectedClass),
    [classList, selectedClass],
  );

  // One real calendar request per visible class.
  const calendarQueries = useQueries({
    queries: visibleClasses.map((c) => ({
      queryKey: ["attendance-calendar", c.id, year, apiMonth],
      queryFn: async () => {
        const res = await api.get<{ data: AttendanceCalendarResponse }>(
          `/attendance/calendar/${c.id}`,
          { params: { year, month: apiMonth } },
        );
        return res.data.data;
      },
      enabled: !!c.id,
    })),
  });

  const isLoading = classesLoading || calendarQueries.some((q) => q.isLoading);

  // Per-class day lookup keyed by day-of-month.
  const calendars = useMemo(
    () =>
      visibleClasses.map((c, i) => {
        const days = calendarQueries[i]?.data?.days ?? [];
        const byDay = new Map<number, AttendanceCalendarDay>();
        for (const d of days) {
          byDay.set(new Date(d.date).getDate(), d);
        }
        return { class: c, byDay };
      }),
    [visibleClasses, calendarQueries],
  );

  // Aggregate stats from real days.
  const overallStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let total = 0;
    const byDate = new Map<string, { present: number; total: number }>();

    for (const { byDay } of calendars) {
      for (const d of byDay.values()) {
        present += d.present;
        absent += d.absent;
        late += d.late;
        total += d.total;
        const cur = byDate.get(d.date) || { present: 0, total: 0 };
        cur.present += d.present;
        cur.total += d.total;
        byDate.set(d.date, cur);
      }
    }

    let worstDay: string | null = null;
    let worstRate = Infinity;
    for (const [date, agg] of byDate) {
      if (agg.total === 0) continue;
      const rate = (agg.present / agg.total) * 100;
      if (rate < worstRate) {
        worstRate = rate;
        worstDay = date;
      }
    }

    return {
      attendanceRate: total > 0 ? ((present / total) * 100).toFixed(1) : "0",
      totalAbsent: absent,
      totalLate: late,
      worstDay,
    };
  }, [calendars]);

  const renderHeatmapForClass = (
    classItem: { id: string; name: string },
    byDay: Map<number, AttendanceCalendarDay>,
  ) => {
    const calendarDays: ({
      day: number;
      data?: AttendanceCalendarDay;
    } | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      calendarDays.push({ day, data: byDay.get(day) });
    }

    return (
      <div key={classItem.id} className="mb-6">
        <h4 className="font-medium mb-2">{classItem.name}</h4>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-xs text-center text-muted-foreground py-1"
            >
              {label}
            </div>
          ))}

          {calendarDays.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const hasData = !!cell.data && cell.data.total > 0;
            const attendanceRate = hasData
              ? (cell.data!.present / cell.data!.total) * 100
              : 0;
            const cellKey = `${classItem.id}-${cell.day}`;
            const isHovered =
              hoveredCell?.class === classItem.id &&
              hoveredCell?.date === cellKey;

            return (
              <div
                key={cellKey}
                className="relative"
                onMouseEnter={() =>
                  setHoveredCell({ class: classItem.id, date: cellKey })
                }
                onMouseLeave={() => setHoveredCell(null)}
              >
                <div
                  className={cn(
                    "aspect-square rounded-sm flex items-center justify-center text-xs font-medium transition-all cursor-pointer",
                    hasData
                      ? cn(getHeatmapColor(attendanceRate), "text-white")
                      : "bg-muted text-muted-foreground",
                    isHovered && "ring-2 ring-primary ring-offset-1",
                  )}
                >
                  {cell.day}
                </div>

                {isHovered && hasData && (
                  <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border rounded-lg shadow-lg p-3 min-w-[150px]">
                    <p className="font-medium text-sm mb-2">
                      {new Date(cell.data!.date).toLocaleDateString("id-ID", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Hadir:</span>
                        <span className="font-medium text-green-600">
                          {cell.data!.present}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tidak Hadir:</span>
                        <span className="font-medium text-red-600">
                          {cell.data!.absent}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Terlambat:</span>
                        <span className="font-medium text-amber-600">
                          {cell.data!.late}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span>Rate:</span>
                        <span className="font-bold">
                          {attendanceRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN", "TEACHER"]}>
      <div className="space-y-6">
        <PageHeader
          title="Heatmap Kehadiran"
          description="Visualisasi pola kehadiran siswa per kelas"
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Semua Kelas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kelas</SelectItem>
              {classList.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Tingkat Kehadiran
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {overallStats.attendanceRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-100 rounded-lg">
                  <TrendingDown className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Tidak Hadir
                  </p>
                  <p className="text-2xl font-bold">
                    {overallStats.totalAbsent}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Terlambat
                  </p>
                  <p className="text-2xl font-bold">{overallStats.totalLate}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Calendar className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hari Terendah</p>
                  <p className="text-lg font-bold">
                    {overallStats.worstDay
                      ? new Date(overallStats.worstDay).toLocaleDateString(
                          "id-ID",
                          { weekday: "long", day: "numeric", month: "short" },
                        )
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Heatmap Legend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {[
                { label: "≥95%", color: "bg-green-500" },
                { label: "90-94%", color: "bg-green-400" },
                { label: "85-89%", color: "bg-yellow-400" },
                { label: "80-84%", color: "bg-orange-400" },
                { label: "75-79%", color: "bg-orange-500" },
                { label: "<75%", color: "bg-red-500" },
                { label: "Tidak ada data", color: "bg-muted" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={cn("w-6 h-6 rounded", item.color)} />
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Heatmaps */}
        <Card>
          <CardHeader>
            <CardTitle>Heatmap Kehadiran per Kelas</CardTitle>
            <CardDescription>
              Hover untuk melihat detail kehadiran per hari
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Memuat data kehadiran…
              </div>
            ) : calendars.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Belum ada kelas untuk ditampilkan.
              </div>
            ) : (
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {calendars.map(({ class: c, byDay }) =>
                  renderHeatmapForClass(c, byDay),
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
