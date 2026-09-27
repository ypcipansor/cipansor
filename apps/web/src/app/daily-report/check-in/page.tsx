"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  describeBulkResult,
  useBulkCreateDailyReports,
  DailyMood,
  BulkCreateDailyReportsInput,
} from "@/hooks/use-daily-report";
import { useClasses } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  CalendarIcon,
  CheckCircle,
  Loader2,
  Users,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { getErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { MOOD_OPTIONS, HEALTH_OPTIONS, ATTENDANCE_OPTIONS } from "../constants";

interface StudentCheckIn {
  studentId: string;
  studentName: string;
  photoUrl?: string;
  selected: boolean;
  checkInTime: string; // mapped to arrivalTime
  moodStatus: DailyMood; // mapped to morningMood
  healthStatus: string; // mapped to healthNotes
}

export default function BulkCheckInPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [classId, setClassId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [defaultCheckInTime, setDefaultCheckInTime] = useState("07:30");
  const [students, setStudents] = useState<StudentCheckIn[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  const { data: classes } = useClasses({ unitId: user?.unitId });

  const { data: studentData, isLoading: studentsLoading } = useStudents({
    classId: classId || undefined,
    unitId: user?.unitId,
    limit: 100,
  });

  const bulkCreateMutation = useBulkCreateDailyReports();

  // Update students list when class changes
  const handleClassChange = (newClassId: string) => {
    setClassId(newClassId);
    setStudents([]);
    setSelectAll(false);
  };

  // Initialize students when data loads
  const initializeStudents = () => {
    if (studentData?.data) {
      setStudents(
        studentData.data.map((student) => ({
          studentId: student.id,
          studentName: student.name || "",
          photoUrl: student.photoUrl,
          selected: true,
          checkInTime: defaultCheckInTime,
          moodStatus: "HAPPY",
          healthStatus: "Sehat",
        })),
      );
      setSelectAll(true);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setStudents((prev) =>
      prev.map((s) => ({
        ...s,
        selected: checked,
      })),
    );
  };

  const handleStudentChange = (
    studentId: string,
    field: keyof StudentCheckIn,
    value: string | boolean,
  ) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.studentId === studentId) {
          return { ...s, [field]: value } as StudentCheckIn;
        }
        return s;
      }),
    );
  };

  const handleApplyDefaultTime = () => {
    setStudents((prev) =>
      prev.map((s) => ({
        ...s,
        checkInTime: s.selected ? defaultCheckInTime : s.checkInTime,
      })),
    );
  };

  const handleSubmit = async () => {
    const selectedStudents = students.filter((s) => s.selected);

    if (selectedStudents.length === 0) {
      toast.error("Pilih minimal 1 santri untuk check-in");
      return;
    }

    try {
      // A calendar day and a time of day in WIB; the unit and the academic
      // year follow from each pupil and the date.
      const payload: BulkCreateDailyReportsInput = {
        reportDate: format(date, "yyyy-MM-dd"),
        reports: selectedStudents.map((s) => ({
          studentId: s.studentId,
          arrivalTime: s.checkInTime || undefined,
          morningMood: s.moodStatus,
          healthNotes: s.healthStatus,
        })),
      };

      const result = await bulkCreateMutation.mutateAsync(payload);
      const message = describeBulkResult(result);
      toast.success(message.created);
      if (message.skipped) toast.warning(message.skipped);
      router.push("/daily-report");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const selectedCount = students.filter((s) => s.selected).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Check-in Kelas"
          description="Check-in kehadiran santri satu kelas sekaligus"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Konfigurasi Check-in</CardTitle>
            <CardDescription>
              Pilih kelas dan tanggal untuk check-in
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Kelas *</Label>
                <Select value={classId} onValueChange={handleClassChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.data?.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tanggal *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(date, "EEEE, dd MMMM yyyy", { locale: idLocale })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => d && setDate(d)}
                      locale={idLocale}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Jam Default</Label>
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={defaultCheckInTime}
                    onChange={(e) => setDefaultCheckInTime(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleApplyDefaultTime}
                    disabled={!students.length}
                  >
                    Terapkan
                  </Button>
                </div>
              </div>
            </div>

            {classId && (
              <div className="mt-4">
                <Button
                  onClick={initializeStudents}
                  disabled={studentsLoading || !studentData?.data?.length}
                >
                  {studentsLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="mr-2 h-4 w-4" />
                  )}
                  Muat Daftar Santri ({studentData?.data?.length || 0} santri)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Students List */}
        {students.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Daftar Santri</CardTitle>
                  <CardDescription>
                    {selectedCount} dari {students.length} santri dipilih
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label htmlFor="select-all">Pilih Semua</Label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {students.map((student, index) => (
                    <div key={student.studentId}>
                      <div
                        className={cn(
                          "p-4 rounded-lg border transition-colors",
                          student.selected
                            ? "bg-primary/5 border-primary"
                            : "bg-muted/30",
                        )}
                      >
                        <div className="flex items-start gap-4">
                          {/* Checkbox & Photo */}
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={student.selected}
                              onCheckedChange={(checked) =>
                                handleStudentChange(
                                  student.studentId,
                                  "selected",
                                  !!checked,
                                )
                              }
                            />
                            {student.photoUrl ? (
                              <img
                                src={student.photoUrl}
                                alt=""
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                <span className="text-lg font-medium">
                                  {student.studentName[0] || "?"}
                                </span>
                              </div>
                            )}
                            <div>
                              <p className="font-medium">
                                {student.studentName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                No. {index + 1}
                              </p>
                            </div>
                          </div>

                          {/* Status Inputs */}
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 ml-4">
                            {student.selected && (
                              <>
                                <div className="space-y-2">
                                  <Label className="text-xs">Jam Masuk</Label>
                                  <Input
                                    type="time"
                                    value={student.checkInTime}
                                    onChange={(e) =>
                                      handleStudentChange(
                                        student.studentId,
                                        "checkInTime",
                                        e.target.value,
                                      )
                                    }
                                    className="h-9"
                                  />
                                </div>

                                {/* Mood */}
                                <div className="space-y-2">
                                  <Label className="text-xs">Mood</Label>
                                  <Select
                                    value={student.moodStatus}
                                    onValueChange={(v) =>
                                      handleStudentChange(
                                        student.studentId,
                                        "moodStatus",
                                        v as DailyMood,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MOOD_OPTIONS.map((opt) => (
                                        <SelectItem
                                          key={opt.value}
                                          value={opt.value}
                                        >
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Health */}
                                <div className="space-y-2">
                                  <Label className="text-xs">Kesehatan</Label>
                                  <Select
                                    value={student.healthStatus}
                                    onValueChange={(v) =>
                                      handleStudentChange(
                                        student.studentId,
                                        "healthStatus",
                                        v,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {HEALTH_OPTIONS.map((opt) => (
                                        <SelectItem
                                          key={opt.value}
                                          value={opt.value}
                                        >
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {index < students.length - 1 && (
                        <Separator className="my-2" />
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Summary & Submit */}
              <div className="mt-6 flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  <Info className="inline h-4 w-4 mr-1" />
                  Santri yang tidak dipilih tidak dibuatkan laporan hariannya
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={selectedCount === 0 || bulkCreateMutation.isPending}
                  size="lg"
                >
                  {bulkCreateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Check-in {selectedCount} Santri
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
