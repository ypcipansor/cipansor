"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  useGenerateTKReport,
  useBulkGenerateTKReports,
} from "@/hooks/use-tk-report";
import { useAcademicYears } from "@/hooks/use-academic-years";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Sparkles,
  Users,
  User,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

interface GenerationResult {
  success: boolean;
  studentId: string;
  studentName: string;
  reportId?: string;
  error?: string;
}

export default function GenerateTKReportPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [generateMode, setGenerateMode] = useState<"single" | "bulk">("single");
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [semester, setSemester] = useState<"GANJIL" | "GENAP">("GANJIL");
  const [classId, setClassId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResults, setGenerationResults] = useState<
    GenerationResult[]
  >([]);
  const [generationProgress, setGenerationProgress] = useState(0);

  const { data: academicYears } = useAcademicYears();
  const { data: classes } = useClasses({ unitId: user?.unitId });
  const { data: students } = useStudents({
    classId: classId || undefined,
    unitId: user?.unitId,
    limit: 100,
  });

  const generateMutation = useGenerateTKReport();
  const bulkGenerateMutation = useBulkGenerateTKReports();

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  const handleSelectAll = () => {
    if (students?.data) {
      if (selectedStudentIds.length === students.data.length) {
        setSelectedStudentIds([]);
      } else {
        setSelectedStudentIds(students.data.map((s) => s.id));
      }
    }
  };

  const handleGenerateSingle = async () => {
    if (!academicYearId || !selectedStudentId) {
      toast.error("Lengkapi semua field yang diperlukan");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        studentId: selectedStudentId,
        unitId: user?.unitId || "",
        academicYearId,
        semester,
      });
      toast.success("Raport berhasil digenerate");
      router.push(`/paud/reports/${result.id}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Gagal generate raport";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateBulk = async () => {
    if (!academicYearId || !classId) {
      toast.error("Lengkapi semua field");
      return;
    }

    setIsGenerating(true);
    setGenerationResults([]);
    setGenerationProgress(0);

    try {
      const result = await bulkGenerateMutation.mutateAsync({
        academicYearId,
        semester,
        classId,
        unitId: user?.unitId || "",
      });

      // Map errors to GenerationResult format for display
      const results: GenerationResult[] = result.errors.map((e) => ({
        success: false,
        studentId: e.studentId,
        studentName: e.studentName,
        error: e.error,
      }));

      // Add dummy success results for the count if needed, or just change UI
      setGenerationResults(results);
      setGenerationProgress(100);

      toast.success(
        `${result.success} raport berhasil digenerate, ${result.failed} gagal, ${result.skipped} dilewati`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Gagal bulk generate raport";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const successResults = generationResults.filter((r) => r.success);
  const failedResults = generationResults.filter((r) => !r.success);

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Generate Raport TK Qur'an"
          description="Generate raport narasi dari data assessment yang sudah tercatat"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Proses Generate Raport</AlertTitle>
          <AlertDescription>
            Sistem akan mengumpulkan semua data assessment siswa pada periode
            yang dipilih, kemudian menghasilkan narasi deskriptif untuk setiap
            aspek perkembangan.
          </AlertDescription>
        </Alert>

        <Tabs
          value={generateMode}
          onValueChange={(v) => setGenerateMode(v as "single" | "bulk")}
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="single" className="gap-2">
              <User className="h-4 w-4" />
              Satu Siswa
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2">
              <Users className="h-4 w-4" />
              Bulk (Per Kelas)
            </TabsTrigger>
          </TabsList>

          {/* Common Period Selection */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Periode Raport</CardTitle>
              <CardDescription>Pilih tahun ajaran dan semester</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tahun Ajaran *</Label>
                <Select
                  value={academicYearId}
                  onValueChange={setAcademicYearId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tahun ajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears?.data?.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Semester *</Label>
                <RadioGroup
                  value={semester}
                  onValueChange={(v) => setSemester(v as "GANJIL" | "GENAP")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="GANJIL" id="ganjil" />
                    <Label htmlFor="ganjil">Ganjil</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="GENAP" id="genap" />
                    <Label htmlFor="genap">Genap</Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          {/* Single Student Mode */}
          <TabsContent value="single" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Pilih Siswa</CardTitle>
                <CardDescription>
                  Generate raport untuk satu siswa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Kelas</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kelas (opsional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Semua Kelas</SelectItem>
                      {classes?.data?.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Siswa *</Label>
                  <Select
                    value={selectedStudentId}
                    onValueChange={setSelectedStudentId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih siswa" />
                    </SelectTrigger>
                    <SelectContent>
                      {students?.data?.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name} ({student.nis})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleGenerateSingle}
                  disabled={
                    isGenerating || !academicYearId || !selectedStudentId
                  }
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Raport
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bulk Mode */}
          <TabsContent value="bulk" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Pilih Kelas & Siswa</CardTitle>
                <CardDescription>
                  Generate raport untuk beberapa siswa sekaligus
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Kelas *</Label>
                  <Select
                    value={classId}
                    onValueChange={(v) => {
                      setClassId(v);
                      setSelectedStudentIds([]);
                    }}
                  >
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

                {classId && students?.data && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label>
                        Siswa ({selectedStudentIds.length}/
                        {students.data.length} dipilih)
                      </Label>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleSelectAll}
                      >
                        {selectedStudentIds.length === students.data.length
                          ? "Batal Pilih Semua"
                          : "Pilih Semua"}
                      </Button>
                    </div>

                    <ScrollArea className="h-[300px] rounded-md border">
                      <div className="space-y-2 p-4">
                        {students.data.map((student) => (
                          <div
                            key={student.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                              selectedStudentIds.includes(student.id)
                                ? "bg-primary/5 border-primary"
                                : "hover:bg-muted/50",
                            )}
                            onClick={() => handleToggleStudent(student.id)}
                          >
                            <Checkbox
                              checked={selectedStudentIds.includes(student.id)}
                              onCheckedChange={() =>
                                handleToggleStudent(student.id)
                              }
                            />
                            {student.photoUrl ? (
                              <img
                                src={student.photoUrl}
                                alt=""
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <span className="text-sm font-medium">
                                  {student.name?.[0] || "?"}
                                </span>
                              </div>
                            )}
                            <div>
                              <p className="font-medium">{student.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {student.nis}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <Button
                  onClick={handleGenerateBulk}
                  disabled={
                    isGenerating ||
                    !academicYearId ||
                    !classId ||
                    selectedStudentIds.length === 0
                  }
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating {selectedStudentIds.length} raport...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate {selectedStudentIds.length} Raport
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Generation Results */}
            {generationResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Hasil Generate</CardTitle>
                  <CardDescription>
                    {successResults.length} berhasil, {failedResults.length}{" "}
                    gagal
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Progress value={generationProgress} />

                  {successResults.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-green-700 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Berhasil ({successResults.length})
                      </h4>
                      <div className="grid gap-2">
                        {successResults.map((result) => (
                          <div
                            key={result.studentId}
                            className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200"
                          >
                            <span>{result.studentName}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(`/paud/reports/${result.reportId}`)
                              }
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Lihat
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {failedResults.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-red-700 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Gagal ({failedResults.length})
                      </h4>
                      <div className="grid gap-2">
                        {failedResults.map((result) => (
                          <div
                            key={result.studentId}
                            className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200"
                          >
                            <div>
                              <span className="font-medium">
                                {result.studentName}
                              </span>
                              <p className="text-sm text-red-600">
                                {result.error}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
