"use client";

import { useState, useEffect } from "react";
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
  Download,
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
import { Textarea } from "@/components/ui/textarea";
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
  useMyHomeroomClass,
  useHomeroomClassAttendance,
  useSubmitQuickAttendance,
  HomeroomStudent,
} from "@/hooks/use-homeroom";

// Types
interface StudentAttendance {
  studentId: string;
  nisn: string;
  name: string;
  gender: "MALE" | "FEMALE";
  status: AttendanceStatus;
  notes: string;
  arrivalTime?: string;
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
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [attendances, setAttendances] = useState<StudentAttendance[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Get homeroom class data
  const { data: homeroomClass, isLoading: isLoadingClass } =
    useMyHomeroomClass();

  // Get existing attendance data for the selected date
  const { data: existingAttendance, isLoading: isLoadingAttendance } =
    useHomeroomClassAttendance(homeroomClass?.id, selectedDate);

  // Submit mutation
  const submitAttendance = useSubmitQuickAttendance();

  // Initialize attendances from class students
  useEffect(() => {
    if (homeroomClass?.students && attendances.length === 0) {
      // Initialize all students with PRESENT status by default
      const initialAttendances: StudentAttendance[] =
        homeroomClass.students.map((student: HomeroomStudent) => ({
          studentId: student.id,
          nisn: student.nisn,
          name: student.name,
          gender: student.gender,
          status: AttendanceStatus.PRESENT,
          notes: "",
        }));
      setAttendances(initialAttendances);
    }
  }, [homeroomClass?.students, attendances.length]);

  // Update from existing attendance if available
  useEffect(() => {
    if (
      existingAttendance?.attendances &&
      existingAttendance.attendances.length > 0
    ) {
      const updatedAttendances: StudentAttendance[] =
        existingAttendance.attendances.map((att) => ({
          studentId: att.studentId,
          nisn: att.student?.nisn || "",
          name: att.student?.name || "",
          gender: att.student?.gender || "MALE",
          status: att.status,
          notes: att.notes || "",
          arrivalTime: undefined,
        }));
      setAttendances(updatedAttendances);
    }
  }, [existingAttendance]);

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

    setIsSubmitting(true);

    try {
      await submitAttendance.mutateAsync({
        classId: homeroomClass.id,
        data: {
          date: selectedDate,
          attendances: attendances.map((a) => ({
            studentId: a.studentId,
            status: a.status,
            notes: a.notes || undefined,
            arrivalTime: a.arrivalTime,
          })),
        },
      });

      toast.success("Absensi berhasil disimpan");
      router.push("/homeroom");
    } catch (error) {
      toast.error("Gagal menyimpan absensi");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    toast.success("Data absensi akan diunduh");
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
              Anda belum ditugaskan sebagai wali kelas
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
          <h1 className="text-2xl font-bold">Absensi Cepat</h1>
          <p className="text-muted-foreground">
            {homeroomClass.name} -{" "}
            {homeroomClass.unit?.name || "Pesantren Cipansor"}
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
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
              <div className="col-span-2">NISN</div>
              <div className="col-span-3">Nama</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-3">Keterangan</div>
            </div>

            {/* Student Rows */}
            {attendances.map((student, index) => (
              <div
                key={student.studentId}
                className="grid grid-cols-12 gap-2 py-2 px-3 items-center border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="col-span-1 text-sm text-muted-foreground">
                  {index + 1}
                </div>
                <div className="col-span-2 font-mono text-sm">
                  {student.nisn}
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
                    <SelectTrigger className="h-9">
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

      {/* Additional Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catatan Tambahan</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Tambahkan catatan untuk absensi hari ini (opsional)..."
            rows={3}
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Link href="/homeroom">
          <Button variant="outline">Batal</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
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
