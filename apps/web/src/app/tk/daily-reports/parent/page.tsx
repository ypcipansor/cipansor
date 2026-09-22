"use client";

import { useState, useMemo } from "react";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDailyReports } from "@/hooks/use-daily-report";
import { useResolvedFileUrls } from "@/hooks/use-resolved-file-url";
import { displayableResolvedUrl } from "@/lib/files";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Users,
  CalendarIcon,
  CheckCircle,
  XCircle,
  Clock,
  Utensils,
  Moon,
  BookOpen,
  Image as ImageIcon,
  ChevronRight,
  Smile,
  Meh,
  Frown,
} from "lucide-react";

const moodIcons: Record<string, React.ReactNode> = {
  EXCELLENT: <Smile className="h-5 w-5 text-green-500" />,
  GOOD: <Smile className="h-5 w-5 text-blue-500" />,
  NEUTRAL: <Meh className="h-5 w-5 text-gray-500" />,
  LOW: <Frown className="h-5 w-5 text-yellow-500" />,
  STRUGGLING: <Frown className="h-5 w-5 text-red-500" />,
};

const moodLabels: Record<string, string> = {
  EXCELLENT: "Sangat Baik",
  GOOD: "Baik",
  NEUTRAL: "Biasa",
  LOW: "Kurang",
  STRUGGLING: "Sangat Kurang",
};

const mealLabels: Record<string, string> = {
  FINISHED: "Habis",
  HALF: "Setengah",
  LITTLE: "Sedikit",
  NOT_EAT: "Tidak Makan",
};

// This page is intended for parents to view their children's daily reports
// It would typically filter by the logged-in parent's children
export default function ParentDailyReportsPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // In real implementation, this would filter by parent's children
  const { data, isLoading } = useDailyReports({
    date: format(selectedDate, "yyyy-MM-dd"),
  });

  const reports = data?.data || [];

  // Report photos live in the private container, so a raw URL 403s once Azure
  // is enabled; resolve them like every other private viewer.
  const photoUrls = useMemo(
    () =>
      reports.flatMap(
        (r: { photos?: Array<{ photoUrl: string }> }) =>
          (r.photos ?? []).map((p) => p.photoUrl)
      ),
    [reports]
  );
  const resolvedPhotos = useResolvedFileUrls(photoUrls);
  const photoSrc = (url: string): string | null =>
    displayableResolvedUrl(url, resolvedPhotos);

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Laporan Harian Anak"
          description="Lihat aktivitas dan perkembangan anak Anda"
          icon={Users}
        />

        {/* Date Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">Tanggal:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[240px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "EEEE, dd MMMM yyyy", { locale: id })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date > new Date()}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Reports */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Belum Ada Laporan</h3>
              <p className="text-muted-foreground">
                Laporan untuk tanggal ini belum tersedia
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {reports.map((report: any) => (
              <Card key={report.id} className="overflow-hidden">
                {/* Header with Student Info */}
                <CardHeader className="bg-primary/5">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-white shadow">
                      <AvatarImage src={report.student?.photoUrl} />
                      <AvatarFallback className="text-lg">
                        {report.student?.name?.substring(0, 2).toUpperCase() ||
                          "ST"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle>{report.student?.name}</CardTitle>
                      <CardDescription>
                        {report.student?.class?.name}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                  {/* Attendance */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {report.attendanceStatus === "HADIR" ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="font-medium">Kehadiran</span>
                    </div>
                    <Badge
                      variant={
                        report.attendanceStatus === "HADIR"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {report.attendanceStatus}
                    </Badge>
                  </div>

                  {/* Mood */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Kondisi/Mood</span>
                    <div className="flex items-center gap-2">
                      {moodIcons[report.mood]}
                      <span className="font-medium">
                        {moodLabels[report.mood]}
                      </span>
                    </div>
                  </div>

                  {/* Check Times */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Check-in</p>
                      <p className="font-medium">
                        {report.checkInTime
                          ? safeFormat(new Date(report.checkInTime), "HH:mm")
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Check-out</p>
                      <p className="font-medium">
                        {report.checkOutTime
                          ? safeFormat(new Date(report.checkOutTime), "HH:mm")
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {/* Meals */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Utensils className="h-4 w-4" />
                      Makan
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="p-2 bg-muted/50 rounded text-center">
                        <p className="text-muted-foreground">Pagi</p>
                        <p className="font-medium">
                          {mealLabels[report.breakfast] || "-"}
                        </p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded text-center">
                        <p className="text-muted-foreground">Siang</p>
                        <p className="font-medium">
                          {mealLabels[report.lunch] || "-"}
                        </p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded text-center">
                        <p className="text-muted-foreground">Snack</p>
                        <p className="font-medium">
                          {mealLabels[report.snack] || "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sleep */}
                  {report.napStartTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Moon className="h-4 w-4" />
                        Tidur Siang
                      </span>
                      <span className="font-medium">
                        {safeFormat(new Date(report.napStartTime), "HH:mm")} -
                        {report.napEndTime
                          ? safeFormat(new Date(report.napEndTime), "HH:mm")
                          : "..."}
                      </span>
                    </div>
                  )}

                  {/* Activities */}
                  {report.activities && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Aktivitas
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {report.activities}
                      </p>
                    </div>
                  )}

                  {/* Photos */}
                  {report.photos && report.photos.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        Foto ({report.photos.length})
                      </h4>
                      <div className="flex gap-2 overflow-x-auto">
                        {report.photos
                          .slice(0, 4)
                          .map((photo: any, idx: number) => (
                            <div
                              key={photo.id || idx}
                              className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden"
                            >
                              <img
                                src={photoSrc(photo.photoUrl) ?? undefined}
                                alt={photo.caption || `Photo ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {report.notes && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Catatan dari Guru:
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        {report.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
