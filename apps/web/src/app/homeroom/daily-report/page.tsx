"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useCreateDailyReport,
  useBulkCreateDailyReports,
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CalendarIcon,
  Save,
  Loader2,
  Users,
  Check,
  BookOpen,
  Bell,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

// SD/SMP/SMA Daily Report Schema
const dailyReportSchema = z.object({
  classId: z.string().min(1, "Kelas wajib dipilih"),
  reportDate: z.date({ error: "Tanggal wajib diisi" }),
});

// Individual student report schema
const studentReportSchema = z.object({
  present: z.boolean(),
  sholatDhuha: z.boolean().optional(),
  tahfidzProgress: z.string().optional(),
  subjects: z.string().optional(),
  homework: z.string().optional(),
  behaviorNotes: z.string().optional(),
  achievements: z.string().optional(),
  teacherNotes: z.string().optional(),
});

type DailyReportFormData = z.infer<typeof dailyReportSchema>;
type StudentReportData = z.infer<typeof studentReportSchema>;

interface StudentReport {
  studentId: string;
  studentName: string;
  nis: string;
  data: StudentReportData;
}

export default function HomeroomDailyReportPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [studentReports, setStudentReports] = useState<
    Map<string, StudentReportData>
  >(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: classes } = useClasses({ unitId: user?.unitId });
  const { data: studentsData, isLoading: loadingStudents } = useStudents({
    classId: selectedClassId || undefined,
    unitId: user?.unitId,
    limit: 100,
  });

  const students = studentsData?.data || [];
  const bulkCreateMutation = useBulkCreateDailyReports();

  // Initialize student reports when students load
  useEffect(() => {
    if (students.length > 0 && studentReports.size === 0) {
      const initial = new Map<string, StudentReportData>();
      students.forEach((s) => {
        initial.set(s.id, {
          present: true,
          sholatDhuha: false,
          tahfidzProgress: "",
          subjects: "",
          homework: "",
          behaviorNotes: "",
          achievements: "",
          teacherNotes: "",
        });
      });
      setStudentReports(initial);
    }
  }, [students, studentReports.size]);

  const form = useForm<DailyReportFormData>({
    resolver: zodResolver(dailyReportSchema),
    defaultValues: {
      classId: "",
      reportDate: new Date(),
    },
  });

  const updateStudentReport = (
    studentId: string,
    field: keyof StudentReportData,
    value: any,
  ) => {
    setStudentReports((prev) => {
      const updated = new Map(prev);
      const current = updated.get(studentId) || {
        present: true,
        sholatDhuha: false,
        tahfidzProgress: "",
        subjects: "",
        homework: "",
        behaviorNotes: "",
        achievements: "",
        teacherNotes: "",
      };
      updated.set(studentId, { ...current, [field]: value });
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!selectedClassId) {
      toast.error("Pilih kelas terlebih dahulu");
      return;
    }

    setIsSubmitting(true);
    try {
      const reports = Array.from(studentReports.entries())
        .filter(([_, data]) => data.present) // Only create reports for present students
        .map(([studentId, data]) => ({
          studentId,
          classId: selectedClassId,
          reportDate: format(selectedDate, "yyyy-MM-dd"),
          unitId: user?.unitId || "",
          academicYearId: user?.academicYearId || "",
          attendanceStatus: "PRESENT" as const,
          activitiesSummary: data.subjects,
          learningAchievements: data.achievements,
          behaviorNotes: data.behaviorNotes,
          surahPractice: data.tahfidzProgress,
          parentNotes: data.teacherNotes,
          homeworkSuggestion: data.homework,
          sholatDhuhaCompleted: data.sholatDhuha,
        }));

      await bulkCreateMutation.mutateAsync({
        unitId: user?.unitId || "",
        academicYearId: user?.academicYearId || "",
        reportDate: format(selectedDate, "yyyy-MM-dd"),
        reports: reports.map((r) => ({
          studentId: r.studentId,
          attendanceStatus: r.attendanceStatus,
          activitiesSummary: r.activitiesSummary,
          learningAchievements: r.learningAchievements,
          behaviorNotes: r.behaviorNotes,
          surahPractice: r.surahPractice,
          parentNotes: r.parentNotes,
          homeworkSuggestion: r.homeworkSuggestion,
          sholatDhuhaCompleted: r.sholatDhuhaCompleted,
        })),
      } as any);
      toast.success(`${reports.length} laporan harian berhasil dibuat`);
      router.push("/homeroom");
    } catch (error) {
      toast.error("Gagal membuat laporan harian");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Count statistics
  const presentCount = Array.from(studentReports.values()).filter(
    (r) => r.present,
  ).length;
  const absentCount = students.length - presentCount;
  const sholatCount = Array.from(studentReports.values()).filter(
    (r) => r.sholatDhuha,
  ).length;

  return (
    <MainLayout allowedRoles={["TEACHER", "UNIT_ADMIN", "SUPER_ADMIN"]}>
      <div className="space-y-6">
        <PageHeader
          title="Laporan Harian Kelas"
          description="Input laporan harian untuk SD IT / SMP IT / SMA Al-Qur'an"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Kelas</label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-[200px]">
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
            <label className="text-sm font-medium">Tanggal</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[200px] justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "dd MMMM yyyy", { locale: idLocale })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  locale={idLocale}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {selectedClassId && (
          <>
            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{students.length}</p>
                      <p className="text-xs text-muted-foreground">
                        Total Siswa
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Check className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{presentCount}</p>
                      <p className="text-xs text-muted-foreground">Hadir</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <Users className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{absentCount}</p>
                      <p className="text-xs text-muted-foreground">
                        Tidak Hadir
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <BookOpen className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{sholatCount}</p>
                      <p className="text-xs text-muted-foreground">
                        Sholat Dhuha
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Student List */}
            <Card>
              <CardHeader>
                <CardTitle>Input Laporan per Siswa</CardTitle>
                <CardDescription>
                  Centang kehadiran dan isi informasi aktivitas masing-masing
                  siswa
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingStudents ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : students.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Tidak ada siswa di kelas ini
                  </div>
                ) : (
                  <div className="space-y-4">
                    {students.map((student, idx) => {
                      const report = studentReports.get(student.id);
                      return (
                        <Card
                          key={student.id}
                          className={cn(
                            "transition-all",
                            report?.present
                              ? "border-green-200"
                              : "border-red-200 bg-red-50/50",
                          )}
                        >
                          <CardContent className="py-4">
                            <div className="flex items-start gap-4">
                              {/* Checkbox & Name */}
                              <div className="flex items-center gap-3 min-w-[200px]">
                                <Checkbox
                                  checked={report?.present || false}
                                  onCheckedChange={(checked) =>
                                    updateStudentReport(
                                      student.id,
                                      "present",
                                      checked,
                                    )
                                  }
                                />
                                <div>
                                  <p className="font-medium">{student.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {student.nis}
                                  </p>
                                </div>
                              </div>

                              {/* Quick inputs when present */}
                              {report?.present && (
                                <div className="flex-1 grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={report?.sholatDhuha || false}
                                      onCheckedChange={(checked) =>
                                        updateStudentReport(
                                          student.id,
                                          "sholatDhuha",
                                          checked,
                                        )
                                      }
                                    />
                                    <span className="text-sm">
                                      Sholat Dhuha
                                    </span>
                                  </div>

                                  <Input
                                    placeholder="Tahfidz (surah/ayat)"
                                    className="h-8 text-sm"
                                    value={report?.tahfidzProgress || ""}
                                    onChange={(e) =>
                                      updateStudentReport(
                                        student.id,
                                        "tahfidzProgress",
                                        e.target.value,
                                      )
                                    }
                                  />

                                  <Input
                                    placeholder="PR hari ini"
                                    className="h-8 text-sm"
                                    value={report?.homework || ""}
                                    onChange={(e) =>
                                      updateStudentReport(
                                        student.id,
                                        "homework",
                                        e.target.value,
                                      )
                                    }
                                  />

                                  <Input
                                    placeholder="Catatan"
                                    className="h-8 text-sm"
                                    value={report?.teacherNotes || ""}
                                    onChange={(e) =>
                                      updateStudentReport(
                                        student.id,
                                        "teacherNotes",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>
                              )}

                              {!report?.present && (
                                <Badge
                                  variant="destructive"
                                  className="ml-auto"
                                >
                                  Tidak Hadir
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {presentCount} siswa hadir akan mendapat laporan
              </p>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => router.back()}>
                  Batal
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || presentCount === 0}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Simpan {presentCount} Laporan
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
