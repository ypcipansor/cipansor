"use client";

import { useState, useCallback, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Loader2,
  Save,
  Calendar as CalendarIcon,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useClasses } from "@/hooks/use-classes";
import { useAuthStore } from "@/stores/auth";
import { MainLayout } from "@/components/layout";
import {
  describeBulkResult,
  useBulkCreateDailyReports,
  type BulkCreateDailyReportsInput,
} from "@/hooks/use-daily-report";
import { getErrorMessage } from "@/lib/api-error";

// Types for the form state
interface StudentReportState {
  studentId: string;
  studentName: string;
  morningMood: "HAPPY" | "NEUTRAL" | "SAD" | "TIRED" | "EXCITED" | "SICK";
  lunchConsumption: "HABIS" | "SETENGAH" | "SEDIKIT" | "TIDAK_MAU";
  napDurationMinutes: number;
  notes: string;
  tahfidzActivity: string; // surahPractice
  sholatDhuha: boolean;
  sholatDzuhur: boolean;
  sholatAshar: boolean;
  sholatJamaah: boolean;
}

// Memoized Row Component
const StudentReportRow = memo(
  ({
    enrollment,
    report,
    onUpdate,
  }: {
    enrollment: any;
    report: StudentReportState;
    onUpdate: (
      studentId: string,
      field: keyof StudentReportState,
      value: any,
    ) => void;
  }) => {
    const studentId = enrollment.student.id;

    return (
      <TableRow>
        <TableCell className="font-medium">
          {enrollment.student.user.name}
        </TableCell>
        <TableCell>
          <Select
            value={report.morningMood}
            onValueChange={(val: any) =>
              onUpdate(studentId, "morningMood", val)
            }
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HAPPY">😊</SelectItem>
              <SelectItem value="NEUTRAL">😐</SelectItem>
              <SelectItem value="SAD">😢</SelectItem>
              <SelectItem value="TIRED">😴</SelectItem>
              <SelectItem value="EXCITED">🤩</SelectItem>
              <SelectItem value="SICK">🤒</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <Select
            value={report.lunchConsumption}
            onValueChange={(val: any) =>
              onUpdate(studentId, "lunchConsumption", val)
            }
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HABIS">Habis</SelectItem>
              <SelectItem value="SETENGAH">1/2</SelectItem>
              <SelectItem value="SEDIKIT">Sedikit</SelectItem>
              <SelectItem value="TIDAK_MAU">Tdk Mau</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="text-center">
          <Checkbox
            checked={report.sholatDhuha}
            onCheckedChange={(c) => onUpdate(studentId, "sholatDhuha", !!c)}
          />
        </TableCell>
        <TableCell className="text-center">
          <Checkbox
            checked={report.sholatDzuhur}
            onCheckedChange={(c) => onUpdate(studentId, "sholatDzuhur", !!c)}
          />
        </TableCell>
        <TableCell className="text-center">
          <Checkbox
            checked={report.sholatAshar}
            onCheckedChange={(c) => onUpdate(studentId, "sholatAshar", !!c)}
          />
        </TableCell>
        <TableCell className="text-center">
          <Checkbox
            checked={report.sholatJamaah}
            onCheckedChange={(c) => onUpdate(studentId, "sholatJamaah", !!c)}
          />
        </TableCell>
        <TableCell>
          <Input
            placeholder="Juz/Surat..."
            value={report.tahfidzActivity}
            onChange={(e) =>
              onUpdate(studentId, "tahfidzActivity", e.target.value)
            }
            className="w-[120px]"
          />
        </TableCell>
        <TableCell>
          <Input
            placeholder="Catatan..."
            value={report.notes}
            onChange={(e) => onUpdate(studentId, "notes", e.target.value)}
            className="w-[150px]"
          />
        </TableCell>
      </TableRow>
    );
  },
);

StudentReportRow.displayName = "StudentReportRow";

function BulkDailyReportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  const classId = searchParams.get("classId");
  const [date, setDate] = useState<Date>(new Date());
  const [reports, setReports] = useState<Record<string, StudentReportState>>(
    {},
  );

  // Fetch classes for selection
  const { data: classesData } = useClasses({
    unitId: user?.unitId,
  });

  // Fetch students when class is selected
  const { data: studentsData, isLoading: isLoadingStudents } = useQuery({
    queryKey: ["class-enrollments", classId],
    queryFn: async () => {
      if (!classId) return null;
      const res = await api.get(`/classes/${classId}/enrollments`);
      return res.data.data;
    },
    enabled: !!classId,
  });

  // Initialize form state when students are loaded
  if (
    studentsData &&
    Object.keys(reports).length === 0 &&
    studentsData.length > 0
  ) {
    const initialReports: Record<string, StudentReportState> = {};
    studentsData.forEach((enrollment: any) => {
      initialReports[enrollment.student.id] = {
        studentId: enrollment.student.id,
        studentName: enrollment.student.user.name, // Access flattened name
        morningMood: "HAPPY",
        lunchConsumption: "HABIS",
        napDurationMinutes: 0,
        notes: "",
        tahfidzActivity: "",
        sholatDhuha: true,
        sholatDzuhur: true,
        sholatAshar: true,
        sholatJamaah: true,
      };
    });
    setReports(initialReports);
  }

  const createMutation = useBulkCreateDailyReports();

  // Optimized update handler with useCallback
  const handleUpdate = useCallback(
    (studentId: string, field: keyof StudentReportState, value: any) => {
      setReports((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleCheckAll = (
    field: keyof StudentReportState,
    checked: boolean,
  ) => {
    setReports((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((studentId) => {
        next[studentId] = {
          ...next[studentId],
          [field]: checked,
        };
      });
      return next;
    });
  };

  const handleSubmit = () => {
    if (!classId) return;

    // Only what the teacher entered in this view; a column the view does not
    // show stays empty rather than filled with a stock sentence. The unit and
    // the academic year follow from each pupil and the date.
    const payload: BulkCreateDailyReportsInput = {
      reportDate: format(date, "yyyy-MM-dd"),
      reports: Object.values(reports).map((r) => ({
        studentId: r.studentId,
        morningMood: r.morningMood,
        lunchConsumption: r.lunchConsumption,
        napDurationMinutes: r.napDurationMinutes,
        parentNotes: r.notes || undefined,
        surahPractice: r.tahfidzActivity || undefined,
        sholatDhuha: r.sholatDhuha,
        sholatDzuhur: r.sholatDzuhur,
        sholatAshar: r.sholatAshar,
        sholatJamaah: r.sholatJamaah,
      })),
    };

    createMutation.mutate(payload, {
      onSuccess: (result) => {
        const message = describeBulkResult(result);
        toast.success(message.created);
        if (message.skipped) toast.warning(message.skipped);
        router.push("/daily-report");
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

  const handleClassChange = (newClassId: string) => {
    router.push(`/daily-report/bulk?classId=${newClassId}`);
    setReports({}); // Reset state
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Input Laporan Harian Massal
          </h1>
          <p className="text-muted-foreground">
            Isi laporan harian untuk satu kelas sekaligus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !date && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? (
                  format(date, "PPP", { locale: id })
                ) : (
                  <span>Pilih tanggal</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                autoFocus
              />
            </PopoverContent>
          </Popover>

          <Select value={classId || ""} onValueChange={handleClassChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Pilih Kelas" />
            </SelectTrigger>
            <SelectContent>
              {classesData?.data?.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Siswa</CardTitle>
          <CardDescription>
            Silakan lengkapi data mood, makan, sholat, dan tahfidz untuk setiap
            siswa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!classId ? (
            <div className="text-center py-10 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Silakan pilih kelas terlebih dahulu.</p>
            </div>
          ) : isLoadingStudents ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : studentsData?.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p>Tidak ada siswa di kelas ini.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Nama Siswa</TableHead>
                    <TableHead>Mood</TableHead>
                    <TableHead>Makan Siang</TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>Dhuha</span>
                        <Checkbox
                          onCheckedChange={(c) =>
                            handleCheckAll("sholatDhuha", !!c)
                          }
                        />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>Dzuhur</span>
                        <Checkbox
                          onCheckedChange={(c) =>
                            handleCheckAll("sholatDzuhur", !!c)
                          }
                        />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>Ashar</span>
                        <Checkbox
                          onCheckedChange={(c) =>
                            handleCheckAll("sholatAshar", !!c)
                          }
                        />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>Jamaah</span>
                        <Checkbox
                          onCheckedChange={(c) =>
                            handleCheckAll("sholatJamaah", !!c)
                          }
                        />
                      </div>
                    </TableHead>
                    <TableHead>Tahfidz/Ibadah</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentsData?.map((enrollment: any) => {
                    const studentId = enrollment.student.id;
                    const report = reports[studentId];
                    if (!report) return null;

                    return (
                      <StudentReportRow
                        key={studentId}
                        enrollment={enrollment}
                        report={report}
                        onUpdate={handleUpdate}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!classId || isLoadingStudents || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Simpan Laporan ({studentsData?.length || 0})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function BulkDailyReportPage() {
  return (
    <MainLayout>
      <BulkDailyReportPageContent />
    </MainLayout>
  );
}
