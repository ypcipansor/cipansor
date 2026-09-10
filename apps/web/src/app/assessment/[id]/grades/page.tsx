"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAssessment, useGrades, useSubmitGrades } from "@/hooks";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

interface GradeEntry {
  studentId: string;
  score: number | null;
  notes: string;
}

export default function AssessmentGradesPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;

  const { data: assessment, isLoading: loadingAssessment } =
    useAssessment(assessmentId);
  const { data: grades, isLoading: loadingGrades } = useGrades({
    examId: assessmentId,
  });
  const submitGrades = useSubmitGrades();

  const [gradeEntries, setGradeEntries] = useState<Map<string, GradeEntry>>(
    new Map(),
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Track initialization to prevent re-setting entries
  const initializedRef = useRef(false);
  const lastGradesLengthRef = useRef(0);

  // Initialize grade entries from fetched grades
  useEffect(() => {
    if (!grades || grades.length === 0) return;

    // Only initialize if grades data changed
    if (grades.length === lastGradesLengthRef.current && initializedRef.current)
      return;

    lastGradesLengthRef.current = grades.length;
    initializedRef.current = true;

    const entries = new Map<string, GradeEntry>();
    grades.forEach((grade) => {
      entries.set(grade.studentId, {
        studentId: grade.studentId,
        score: grade.score,
        notes: grade.notes ?? "",
      });
    });
    setTimeout(() => setGradeEntries(entries), 0);
  }, [grades]);

  const handleScoreChange = useCallback((studentId: string, value: string) => {
    const numValue = value === "" ? null : parseFloat(value);
    setGradeEntries((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(studentId);
      newMap.set(studentId, {
        studentId,
        score: numValue,
        notes: existing?.notes ?? "",
      });
      return newMap;
    });
    setHasChanges(true);
  }, []);

  const handleNotesChange = useCallback((studentId: string, notes: string) => {
    setGradeEntries((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(studentId);
      newMap.set(studentId, {
        studentId,
        score: existing?.score ?? null,
        notes,
      });
      return newMap;
    });
    setHasChanges(true);
  }, []);

  const handleSubmit = async () => {
    if (!assessment) return;

    const gradesToSubmit = Array.from(gradeEntries.values())
      .filter((entry) => entry.score !== null)
      .map((entry) => ({
        studentId: entry.studentId,
        score: entry.score as number,
        notes: entry.notes || undefined,
      }));

    try {
      await submitGrades.mutateAsync({
        examId: assessmentId,
        subjectId: assessment.subjectId,
        academicYearId: assessment.academicYearId,
        type: "EXAM",
        gradedById: assessment.teacherId,
        grades: gradesToSubmit,
      });
      toast.success("Nilai berhasil disimpan");
      setHasChanges(false);
    } catch (error) {
      toast.error("Gagal menyimpan nilai");
    }
  };

  if (loadingAssessment || loadingGrades) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!assessment) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Penilaian tidak ditemukan</p>
          <Button onClick={() => router.push("/assessment")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  // Calculate statistics
  const gradedCount = Array.from(gradeEntries.values()).filter(
    (e) => e.score !== null,
  ).length;
  const totalStudents = grades?.length ?? 0;
  const scores = Array.from(gradeEntries.values())
    .filter((e) => e.score !== null)
    .map((e) => e.score!);
  const average =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const passedCount = scores.filter(
    (s) => s >= (assessment.passingScore ?? 70),
  ).length;

  const getScoreColor = (score: number | null) => {
    if (score === null) return "";
    const passingScore = assessment.passingScore ?? 70;
    if (score >= 90) return "border-green-500 bg-green-50";
    if (score >= passingScore) return "border-blue-500 bg-blue-50";
    return "border-red-500 bg-red-50";
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {assessment.title}
              </h1>
              <p className="text-muted-foreground">
                {assessment.title} • {assessment.class?.name} •{" "}
                {assessment.subject?.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasChanges && (
              <Badge variant="secondary" className="mr-2">
                Perubahan belum disimpan
              </Badge>
            )}
            <Button
              onClick={handleSubmit}
              disabled={submitGrades.isPending || !hasChanges}
            >
              {submitGrades.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Simpan Nilai
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Santri
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStudents}</div>
              <p className="text-xs text-muted-foreground">
                Terdaftar di kelas
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Sudah Dinilai
              </CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {gradedCount} / {totalStudents}
              </div>
              <p className="text-xs text-muted-foreground">
                {totalStudents > 0
                  ? ((gradedCount / totalStudents) * 100).toFixed(0)
                  : 0}
                % selesai
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rata-rata</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {scores.length > 0 ? average.toFixed(1) : "-"}
              </div>
              <p className="text-xs text-muted-foreground">
                Dari {scores.length} nilai
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Lulus</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {passedCount}
              </div>
              <p className="text-xs text-muted-foreground">
                KKM: {assessment.passingScore ?? 70}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Petunjuk Input Nilai</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc list-inside space-y-1">
              <li>Masukkan nilai dalam rentang 0 - {assessment.maxScore}</li>
              <li>
                KKM (Kriteria Ketuntasan Minimal):{" "}
                {assessment.passingScore ?? 70}
              </li>
              <li>Kosongkan nilai jika santri belum mengikuti ujian</li>
              <li>Catatan opsional dapat diisi untuk keterangan tambahan</li>
            </ul>
          </CardContent>
        </Card>

        {/* Grades Table */}
        <Card>
          <CardHeader>
            <CardTitle>Daftar Nilai Santri</CardTitle>
            <CardDescription>
              Masukkan nilai untuk setiap santri
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">No</TableHead>
                  <TableHead className="w-[100px]">NISN</TableHead>
                  <TableHead>Nama Santri</TableHead>
                  <TableHead className="w-[120px]">Nilai</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades?.length ? (
                  grades.map((grade, index) => {
                    const entry = gradeEntries.get(grade.studentId);
                    const score = entry?.score ?? null;
                    const notes = entry?.notes ?? "";

                    return (
                      <TableRow key={grade.id}>
                        <TableCell className="text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {grade.student?.nisn}
                        </TableCell>
                        <TableCell className="font-medium">
                          {grade.student?.user?.name}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={assessment.maxScore}
                            step={0.5}
                            value={score ?? ""}
                            onChange={(e) =>
                              handleScoreChange(grade.studentId, e.target.value)
                            }
                            className={`w-20 ${getScoreColor(score)}`}
                            placeholder="-"
                          />
                        </TableCell>
                        <TableCell>
                          {score !== null ? (
                            score >= (assessment.passingScore ?? 70) ? (
                              <Badge variant="default" className="bg-green-500">
                                Lulus
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Tidak Lulus</Badge>
                            )
                          ) : (
                            <Badge variant="secondary">Belum</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={notes}
                            onChange={(e) =>
                              handleNotesChange(grade.studentId, e.target.value)
                            }
                            placeholder="Catatan..."
                            className="w-full"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Belum ada data santri
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Bottom Actions */}
        <div className="flex justify-end gap-4 sticky bottom-4 p-4 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border rounded-lg">
          <Button variant="outline" onClick={() => router.back()}>
            Kembali
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitGrades.isPending || !hasChanges}
          >
            {submitGrades.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Simpan Nilai ({gradedCount}/{totalStudents})
              </>
            )}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
