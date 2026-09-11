"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { PageHeader, DataTable } from "@/components/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDailyReports, DailyReport } from "@/hooks/use-daily-report";
import { useClasses } from "@/hooks/use-classes";
import { type ColumnDef } from "@/components/shared";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Users,
  CalendarIcon,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  FileEdit,
  Smile,
  Meh,
  Frown,
  UserCheck,
  UserX,
} from "lucide-react";

const moodIcons: Record<string, React.ReactNode> = {
  EXCELLENT: <Smile className="h-4 w-4 text-green-500" />,
  GOOD: <Smile className="h-4 w-4 text-blue-500" />,
  NEUTRAL: <Meh className="h-4 w-4 text-gray-500" />,
  LOW: <Frown className="h-4 w-4 text-yellow-500" />,
  STRUGGLING: <Frown className="h-4 w-4 text-red-500" />,
};

const moodLabels: Record<string, string> = {
  EXCELLENT: "Sangat Baik",
  GOOD: "Baik",
  NEUTRAL: "Biasa",
  LOW: "Kurang",
  STRUGGLING: "Sangat Kurang",
};

export default function ClassDailyReportsPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedClass, setSelectedClass] = useState<string>("");

  const { data: classesData } = useClasses({ limit: 100 });
  const { data, isLoading } = useDailyReports({
    classId: selectedClass || undefined,
  });

  const reports = data?.data || [];

  // Calculate statistics
  const totalStudents = reports.length;
  const presentCount = reports.filter(
    (r: DailyReport) => !!r.arrivalTime,
  ).length;
  const absentCount = totalStudents - presentCount;
  const attendanceRate =
    totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  const columns: ColumnDef<DailyReport>[] = [
    {
      accessorKey: "student",
      header: "Santri",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={row.original.student?.photoUrl} />
            <AvatarFallback>
              {row.original.student?.user?.name?.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">
              {row.original.student?.user?.name}
            </div>
            <div className="text-sm text-muted-foreground">
              {row.original.student?.nis}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "attendanceStatus",
      header: "Kehadiran",
      cell: ({ row }) => {
        const isPresent = !!row.original.arrivalTime;
        return (
          <Badge
            variant={isPresent ? "default" : "destructive"}
            className="flex items-center gap-1 w-fit"
          >
            {isPresent ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {isPresent ? "HADIR" : "TIDAK HADIR"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "mood",
      header: "Kondisi",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.mood && moodIcons[row.original.mood]}
          <span>
            {row.original.mood &&
              (moodLabels[row.original.mood] || row.original.mood)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "arrivalTime",
      header: "Check-in",
      cell: ({ row }) =>
        row.original.arrivalTime ? (
          <span>{safeFormat(new Date(row.original.arrivalTime), "HH:mm")}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      accessorKey: "departureTime",
      header: "Check-out",
      cell: ({ row }) =>
        row.original.departureTime ? (
          <span>
            {safeFormat(new Date(row.original.departureTime), "HH:mm")}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      accessorKey: "teacherNotes",
      header: "Catatan",
      cell: ({ row }) =>
        row.original.teacherNotes ? (
          <div className="max-w-[200px] truncate">
            {row.original.teacherNotes}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              router.push(`/paud/daily-reports/${row.original.id}`)
            }
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              router.push(`/paud/daily-reports/${row.original.id}/edit`)
            }
          >
            <FileEdit className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Laporan Harian Kelas"
          description="Ringkasan laporan harian per kelas"
          icon={Users}
        />

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Tanggal:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-[240px] justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, "EEEE, dd MMMM yyyy", {
                        locale: id,
                      })}
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

              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Semua Kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua Kelas</SelectItem>
                  {classesData?.data?.map((cls: any) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Santri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{totalStudents}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hadir
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{presentCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tidak Hadir
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold">{absentCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tingkat Kehadiran
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">{attendanceRate}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Daftar Laporan</CardTitle>
              <CardDescription>
                {format(selectedDate, "EEEE, dd MMMM yyyy", { locale: id })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">
                    Belum Ada Laporan
                  </h3>
                  <p className="text-muted-foreground">
                    Laporan untuk tanggal ini belum tersedia
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => router.push("/paud/daily-reports/check-in")}
                  >
                    Buat Laporan
                  </Button>
                </div>
              ) : (
                <DataTable columns={columns} data={reports} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
