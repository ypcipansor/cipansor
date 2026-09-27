"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  X,
  AlertCircle,
  Clock,
  Save,
  Users,
  Calendar,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AttendanceStatus } from "@cipansor/shared";
import { MainLayout } from "@/components/layout";
import {
  useHomeroomClasses,
  useHomeroomClassStudents,
} from "@/hooks/use-homeroom";
import {
  describeAttendanceSave,
  useBulkCreateAttendance,
  useClassAttendance,
} from "@/hooks/use-attendance";

// Types
interface StudentAttendance {
  studentId: string;
  nis: string;
  name: string;
  gender: "MALE" | "FEMALE";
  status: AttendanceStatus;
  notes: string;
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  [AttendanceStatus.PRESENT]: {
    label: "Hadir",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
    icon: <Check className="h-4 w-4" />,
  },
  [AttendanceStatus.LATE]: {
    label: "Terlambat",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
    icon: <Clock className="h-4 w-4" />,
  },
  [AttendanceStatus.SICK]: {
    label: "Sakit",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  [AttendanceStatus.EXCUSED]: {
    label: "Izin",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  [AttendanceStatus.ABSENT]: {
    label: "Alpha",
    color: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
    icon: <X className="h-4 w-4" />,
  },
};

function QuickAttendancePageContent() {
  const router = useRouter();
  // The teacher's own calendar day ("yyyy-MM-dd", browser time) — not
  // toISOString(), which dates a 06:45 WIB register the day before.
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [attendances, setAttendances] = useState<StudentAttendance[]>([]);

  // This academic year's class of this wali kelas (the API lists it first).
  const { data: classes, isLoading: isLoadingClass } = useHomeroomClasses();
  const homeroomClass = classes?.find((c) => c.isCurrent);

  const { data: students } = useHomeroomClassStudents(homeroomClass?.id);
  // The day's register as recorded so far, by anyone who records this class.
  const { data: existingAttendance } = useClassAttendance(
    homeroomClass?.id ?? "",
    selectedDate,
  );
  const saveAttendance = useBulkCreateAttendance();

  // Fill the list once the pupils and the day's register have both loaded:
  // saved statuses where there are some, "Hadir" for the rest.
  const filledFor = useRef("");
  useEffect(() => {
    if (!students || existingAttendance === undefined) return;
    const key = `${homeroomClass?.id}-${selectedDate}-${students.length}-${existingAttendance.length}`;
    if (filledFor.current === key) return;
    filledFor.current = key;
    const saved = new Map(existingAttendance.map((a) => [a.studentId, a]));
    setAttendances(
      students.map((student) => ({
        studentId: student.id,
        nis: student.nis,
        name: student.user.name,
        gender: student.gender,
        status: saved.get(student.id)?.status ?? AttendanceStatus.PRESENT,
        notes: saved.get(student.id)?.notes ?? "",
      })),
    );
  }, [students, existingAttendance, homeroomClass?.id, selectedDate]);

  const updateAttendance = (
    studentId: string,
    field: keyof StudentAttendance,
    value: string,
  ) => {
    setAttendances((prev) =>
      prev.map((a) =>
        a.studentId === studentId ? { ...a, [field]: value } : a,
      ),
    );
  };

  const setAllPresent = () => {
    setAttendances((prev) =>
      prev.map((a) => ({ ...a, status: AttendanceStatus.PRESENT })),
    );
    toast.success("Semua siswa diset hadir");
  };

  const getSummary = () => {
    return {
      present: attendances.filter((a) => a.status === AttendanceStatus.PRESENT)
        .length,
      late: attendances.filter((a) => a.status === AttendanceStatus.LATE)
        .length,
      sick: attendances.filter((a) => a.status === AttendanceStatus.SICK)
        .length,
      excused: attendances.filter((a) => a.status === AttendanceStatus.EXCUSED)
        .length,
      absent: attendances.filter((a) => a.status === AttendanceStatus.ABSENT)
        .length,
      total: attendances.length,
    };
  };

  const summary = getSummary();

  const handleSubmit = async () => {
    if (!homeroomClass?.id) {
      toast.error("Kelas tidak ditemukan");
      return;
    }

    try {
      const result = await saveAttendance.mutateAsync({
        classId: homeroomClass.id,
        date: selectedDate,
        records: attendances.map((a) => ({
          studentId: a.studentId,
          status: a.status,
          notes: a.notes || undefined,
        })),
      });
      toast.success(describeAttendanceSave(result));
      router.push("/homeroom");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menyimpan absensi",
      );
    }
  };

  // Loading state
  if (isLoadingClass) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // No class found
  if (!homeroomClass) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium">Tidak Ada Kelas Wali</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Anda bukan wali kelas kelas mana pun tahun ajaran ini
            </p>
            <Link href="/homeroom">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/homeroom">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Absensi Harian</h1>
          <p className="text-muted-foreground">
            {homeroomClass.name} -{" "}
            {homeroomClass.unit?.name || "Pesantren Cipansor"}
          </p>
        </div>
      </div>

      {/* Date & Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Tanggal Absensi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="date">Pilih Tanggal</Label>
                <Input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={today}
                  className="mt-1"
                />
              </div>
              <Button variant="secondary" onClick={setAllPresent}>
                <Check className="h-4 w-4 mr-2" />
                Semua Hadir
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Ringkasan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-sm px-3 py-1">
                Hadir: {summary.present}
              </Badge>
              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 text-sm px-3 py-1">
                Telat: {summary.late}
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 text-sm px-3 py-1">
                Sakit: {summary.sick}
              </Badge>
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 text-sm px-3 py-1">
                Izin: {summary.excused}
              </Badge>
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 text-sm px-3 py-1">
                Alpha: {summary.absent}
              </Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Total: {summary.total}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance List */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Kehadiran</CardTitle>
          <CardDescription>
            Klik status untuk mengubah kehadiran siswa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 py-2 px-3 bg-muted rounded-lg text-sm font-medium">
              <div className="col-span-1">No</div>
              <div className="col-span-2">NIS</div>
              <div className="col-span-3">Nama</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-3">Keterangan</div>
            </div>

            {/* Student Rows */}
            {attendances.map((student, index) => (
              <div
                key={student.studentId}
                data-testid={`attendance-row-${student.studentId}`}
                className="grid grid-cols-12 gap-2 py-2 px-3 items-center border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="col-span-1 text-sm text-muted-foreground">
                  {index + 1}
                </div>
                <div className="col-span-2 font-mono text-sm">
                  {student.nis}
                </div>
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback
                        className={
                          student.gender === "MALE"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-pink-100 text-pink-700"
                        }
                      >
                        {student.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{student.name}</span>
                  </div>
                </div>
                <div className="col-span-3">
                  <Select
                    value={student.status}
                    onValueChange={(value) =>
                      updateAttendance(student.studentId, "status", value)
                    }
                  >
                    <SelectTrigger
                      className="h-9"
                      aria-label={`Status ${student.name}`}
                    >
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_CONFIG[student.status].color}`}
                          >
                            {STATUS_CONFIG[student.status].label}
                          </span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            {config.icon}
                            <span>{config.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="Tambah keterangan..."
                    value={student.notes}
                    onChange={(e) =>
                      updateAttendance(
                        student.studentId,
                        "notes",
                        e.target.value,
                      )
                    }
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Link href="/homeroom">
          <Button variant="outline">Batal</Button>
        </Link>
        <Button
          onClick={handleSubmit}
          disabled={saveAttendance.isPending || attendances.length === 0}
        >
          {saveAttendance.isPending ? (
            <>Menyimpan...</>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Simpan Absensi
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function QuickAttendancePage() {
  return (
    <MainLayout>
      <QuickAttendancePageContent />
    </MainLayout>
  );
}
