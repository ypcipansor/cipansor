"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ClipboardList,
  Plus,
  Eye,
  Calendar as CalendarIcon,
  Users,
  Filter,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useAttendances,
  ATTENDANCE_STATUSES,
  AttendanceStatus,
} from "@/hooks/use-attendance";
import { useClasses } from "@/hooks/use-classes";
import { useUnits } from "@/hooks/use-units";
import { cn } from "@/lib/utils";

export default function AttendancePage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [classId, setClassId] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [unitId, setUnitId] = useState<string>("ALL");

  const { data: units } = useUnits();
  const { data: classesData } = useClasses({
    unitId: unitId === "ALL" ? undefined : unitId,
  });
  const classes = classesData?.data || [];

  const { data: attendanceData, isLoading } = useAttendances({
    page,
    limit: pageSize,
    classId: classId === "ALL" ? undefined : classId,
    status: status === "ALL" ? undefined : (status as AttendanceStatus),
    date: date ? format(date, "yyyy-MM-dd") : undefined,
  });

  const attendances = attendanceData?.data || [];
  const pagination = attendanceData?.meta?.pagination;

  const getStatusBadge = (status: AttendanceStatus) => {
    const statusConfig = ATTENDANCE_STATUSES.find((s) => s.value === status);
    return (
      <Badge variant="secondary" className={statusConfig?.color}>
        {statusConfig?.label || status}
      </Badge>
    );
  };

  // Calculate summary stats
  const summary = {
    total: attendances.length,
    present: attendances.filter((a) => a.status === "PRESENT").length,
    absent: attendances.filter((a) => a.status === "ABSENT").length,
    late: attendances.filter((a) => a.status === "LATE").length,
    sick: attendances.filter((a) => a.status === "SICK").length,
    excused: attendances.filter((a) => a.status === "EXCUSED").length,
  };

  return (
    <MainLayout>
      <PageHeader
        title="Kehadiran"
        description="Kelola data kehadiran siswa"
        action={{
          label: "Input Kehadiran",
          icon: <Plus className="h-4 w-4" />,
          href: "/attendance/record",
        }}
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-6 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm text-muted-foreground">Hadir</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {summary.present}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-sm text-muted-foreground">Tidak Hadir</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{summary.absent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-sm text-muted-foreground">Terlambat</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600">{summary.late}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="text-sm text-muted-foreground">Sakit</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{summary.sick}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-purple-500" />
              <span className="text-sm text-muted-foreground">Izin</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">
              {summary.excused}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date
                    ? format(date, "d MMMM yyyy", { locale: localeId })
                    : "Pilih tanggal"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  autoFocus
                />
              </PopoverContent>
            </Popover>

            <Select
              value={unitId}
              onValueChange={(v) => {
                setUnitId(v);
                setClassId("ALL");
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semua Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Unit</SelectItem>
                {units?.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semua Kelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Kelas</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                {ATTENDANCE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              onClick={() => {
                setDate(new Date());
                setUnitId("");
                setClassId("");
                setStatus("");
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>NIS</TableHead>
                <TableHead>Nama Siswa</TableHead>
                <TableHead>Kelas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead>Dicatat Oleh</TableHead>
                <TableHead className="w-20">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : attendances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">
                      Tidak ada data kehadiran
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                attendances.map((attendance) => (
                  <TableRow key={attendance.id}>
                    <TableCell>
                      {safeFormat(new Date(attendance.date), "d MMM yyyy", {
                        locale: localeId,
                      })}
                    </TableCell>
                    <TableCell className="font-mono">
                      {attendance.student?.nisn || attendance.student?.nik || "-"}
                    </TableCell>
                    <TableCell>{attendance.student?.name || "-"}</TableCell>
                    <TableCell>{attendance.class?.name || "-"}</TableCell>
                    <TableCell>{getStatusBadge(attendance.status)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {attendance.notes || "-"}
                    </TableCell>
                    <TableCell>{attendance.recordedBy?.name || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/attendance/${attendance.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pagination && (
        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.limit}
            total={pagination.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}
    </MainLayout>
  );
}
