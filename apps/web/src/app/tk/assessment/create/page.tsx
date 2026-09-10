"use client";
import { useState, useEffect } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { useClasses } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import { useActiveAcademicYear } from "@/hooks/use-academic-years";
import {
  useTKIndicators,
  useCreateClassAssessment,
  ASPECT_LABELS,
  TKAspect,
  TKAchievementLevel,
} from "@/hooks/use-tk-assessment";

const ACHIEVEMENT_LEVELS = [
  {
    value: "BB",
    label: "BB",
    desc: "Belum Berkembang",
    color: "bg-red-100 text-red-800",
  },
  {
    value: "MB",
    label: "MB",
    desc: "Mulai Berkembang",
    color: "bg-yellow-100 text-yellow-800",
  },
  {
    value: "BSH",
    label: "BSH",
    desc: "Berkembang Sesuai Harapan",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: "BSB",
    label: "BSB",
    desc: "Berkembang Sangat Baik",
    color: "bg-green-100 text-green-800",
  },
];

export default function TKAssessmentCreatePage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedAspect, setSelectedAspect] = useState<TKAspect>("NAM");
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string>("");
  const [assessmentDate, setAssessmentDate] = useState<string>(
    safeFormat(new Date(), "yyyy-MM-dd"),
  );

  // Local state: studentId -> { achievementLevel, notes }
  const [assessments, setAssessments] = useState<
    Record<string, { level: string; notes: string }>
  >({});

  // Data Fetching
  const { data: classes } = useClasses({ unitId: user?.unitId });
  const { data: students, isLoading: isLoadingStudents } = useStudents({
    classId: selectedClassId || undefined,
    unitId: user?.unitId,
    limit: 100,
    status: "active",
  });

  const { data: activeYear } = useActiveAcademicYear();

  const { data: indicators, isLoading: isLoadingIndicators } = useTKIndicators({
    aspect: selectedAspect,
    isActive: true,
  });

  const createMutation = useCreateClassAssessment();

  // Reset assessments when context changes
  useEffect(() => {
    setTimeout(() => setAssessments({}), 0);
  }, [selectedClassId, selectedAspect, selectedIndicatorId]);

  const updateAssessment = (
    studentId: string,
    field: "level" | "notes",
    value: string,
  ) => {
    setAssessments((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  const handleLevelSelect = (studentId: string, level: string) => {
    updateAssessment(studentId, "level", level);
  };

  const handleSave = async () => {
    if (!selectedClassId || !selectedIndicatorId) {
      toast.error("Mohon pilih kelas dan indikator");
      return;
    }

    const validEntries = Object.entries(assessments).filter(
      ([_, val]) => val.level,
    );
    if (validEntries.length === 0) {
      toast.error("Belum ada penilaian yang diisi");
      return;
    }

    try {
      await createMutation.mutateAsync({
        classId: selectedClassId,
        unitId: user?.unitId || "",
        academicYearId: user?.academicYearId || activeYear?.id || "",
        semester: "GANJIL", // Default to GANJIL as AcademicYear doesn't have semester
        periodType: "HARIAN",
        periodDate: assessmentDate,
        aspect: selectedAspect,
        indicatorId: selectedIndicatorId,
        assessments: validEntries.map(([studentId, data]) => ({
          studentId,
          achievementLevel: data.level as TKAchievementLevel,
          teacherNotes: data.notes,
        })),
      });

      toast.success(`Berhasil menyimpan ${validEntries.length} penilaian`);

      setAssessments({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error("Gagal menyimpan penilaian");
      console.error(error);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-20">
        <PageHeader
          title="Input Penilaian TK"
          description="Penilaian indikator perkembangan (NAM, FM, KOG, dll)"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        {/* Controls */}
        <Card>
          <CardContent className="pt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Kelas</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Kelas" />
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
              <Label>Tanggal</Label>
              <Input
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Aspects Tabs */}
        <Tabs
          value={selectedAspect}
          onValueChange={(v) => {
            setSelectedAspect(v as TKAspect);
            setSelectedIndicatorId("");
          }}
        >
          <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 flex-wrap">
            {Object.entries(ASPECT_LABELS).map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="mb-1">
                {key}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Indicator Selection */}
        {selectedAspect && (
          <div className="space-y-2">
            <Label>Indikator Penilaian</Label>
            <Select
              value={selectedIndicatorId}
              onValueChange={setSelectedIndicatorId}
            >
              <SelectTrigger className="w-full h-auto py-2">
                <SelectValue
                  placeholder={
                    isLoadingIndicators
                      ? "Memuat indikator..."
                      : "Pilih Indikator"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {indicators?.map((ind) => (
                  <SelectItem
                    key={ind.id}
                    value={ind.id}
                    className="whitespace-normal"
                  >
                    <span className="font-semibold mr-2">{ind.code}:</span>
                    {ind.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedIndicatorId && (
              <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                {
                  indicators?.find((i) => i.id === selectedIndicatorId)
                    ?.description
                }
              </p>
            )}
          </div>
        )}

        {/* Students List */}
        {selectedClassId && selectedIndicatorId && students?.data && (
          <div className="grid gap-4">
            {students.data.map((student) => {
              const assessment = assessments[student.id] || {
                level: "",
                notes: "",
              };

              return (
                <Card
                  key={student.id}
                  className={
                    assessment.level ? "border-primary/50 bg-accent/5" : ""
                  }
                >
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                      <div className="min-w-[200px]">
                        <h4 className="font-semibold">{student.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {student.nisn}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 w-full md:w-auto">
                        <RadioGroup
                          value={assessment.level}
                          onValueChange={(val) =>
                            handleLevelSelect(student.id, val)
                          }
                          className="flex flex-wrap gap-2"
                        >
                          {ACHIEVEMENT_LEVELS.map((lvl) => (
                            <div
                              key={lvl.value}
                              className="flex items-center space-x-2"
                            >
                              <RadioGroupItem
                                value={lvl.value}
                                id={`${student.id}-${lvl.value}`}
                                className="peer sr-only"
                              />
                              <Label
                                htmlFor={`${student.id}-${lvl.value}`}
                                className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer w-16 text-center ${assessment.level === lvl.value ? lvl.color + " border-current" : ""}`}
                              >
                                <span className="font-bold">{lvl.label}</span>
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>

                        <Input
                          placeholder="Catatan (opsional)"
                          value={assessment.notes}
                          onChange={(e) =>
                            updateAssessment(
                              student.id,
                              "notes",
                              e.target.value,
                            )
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Submit Button */}
        <div className="fixed bottom-6 right-6">
          <Button
            size="lg"
            className="shadow-xl"
            onClick={handleSave}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Save className="mr-2 h-5 w-5" />
            )}
            Simpan Penilaian (
            {Object.values(assessments).filter((a) => a.level).length})
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
