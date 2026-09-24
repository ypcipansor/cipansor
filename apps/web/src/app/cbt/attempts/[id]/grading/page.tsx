"use client";

import { use, useState, useEffect } from "react";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAttemptGrading, useGradeAnswer } from "@/hooks/use-cbt";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

function GradeQuestionForm({
  attemptId,
  question,
  answerData,
  gradeAnswer,
  onSuccess,
}: {
  attemptId: string;
  question: any;
  answerData: any;
  gradeAnswer: any;
  onSuccess: () => void;
}) {
  const [score, setScore] = useState<string>(
    answerData?.score ? String(parseFloat(answerData.score)) : "0",
  );
  const [isCorrect, setIsCorrect] = useState<boolean>(
    answerData?.isCorrect === true,
  );
  const [isLoading, setIsLoading] = useState(false);

  // Sync state if answerData updates from refetch
  useEffect(() => {
    setScore(answerData?.score ? String(parseFloat(answerData.score)) : "0");
    setIsCorrect(answerData?.isCorrect === true);
  }, [answerData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      await gradeAnswer.mutateAsync({
        attemptId,
        questionId: question.id,
        score: Number(score),
        isCorrect,
      });
      toast.success("Nilai berhasil disimpan");
      onSuccess();
    } catch {
      // Error toast is already shown by the global Axios interceptor
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col md:flex-row items-end gap-4"
    >
      <div className="space-y-2 flex-1">
        <label className="text-sm font-medium">Nilai / Poin</label>
        <Input
          type="number"
          name="score"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          max={question.points}
          min={0}
          step={0.1}
          required
        />
      </div>
      <div className="flex items-center space-x-2 flex-1 pb-3">
        <Checkbox
          id={`correct-${question.id}`}
          checked={isCorrect}
          onCheckedChange={(c) => setIsCorrect(c === true)}
        />
        <label
          htmlFor={`correct-${question.id}`}
          className="text-sm font-medium leading-none"
        >
          Tandai Benar
        </label>
      </div>
      <Button type="submit" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Simpan Nilai
      </Button>
    </form>
  );
}

export default function AttemptGradingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: attempt, isLoading, refetch } = useAttemptGrading(id);
  const gradeAnswer = useGradeAnswer();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!attempt) {
    return (
      <MainLayout>
        <p>Data percobaan ujian tidak ditemukan</p>
      </MainLayout>
    );
  }

  const questions = attempt.exam.questionBank?.questions || [];
  const answers = attempt.answers || [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Penilaian Manual (Essay)
            </h1>
            <p className="text-muted-foreground">
              Siswa: {attempt.student?.user?.name || "Unknown"} | Total Skor
              Saat Ini:{" "}
              {attempt.score ? parseFloat(attempt.score).toFixed(2) : 0}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/cbt/exams/${attempt.examId}/monitoring`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Link>
          </Button>
        </div>

        <div className="space-y-4">
          {questions.map((question: any, idx: number) => {
            const answerData = answers.find(
              (a: any) => a.questionId === question.id,
            );

            // Filter out non-essay if desired, but we can allow override for all.
            const isEssay = question.type === "ESSAY";

            return (
              <Card key={question.id}>
                <CardHeader className="bg-muted/50 py-3">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-semibold">
                      Pertanyaan {idx + 1}
                    </CardTitle>
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline">{question.type}</Badge>
                      <Badge>Maks: {question.points} Poin</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="prose prose-sm max-w-none mb-4">
                    <p>{question.content}</p>
                  </div>

                  <div className="bg-muted/30 p-4 rounded-md border">
                    <p className="text-sm font-semibold mb-2">Jawaban Siswa:</p>
                    <p className="text-sm">
                      {answerData?.answer
                        ? String(answerData.answer)
                        : "Tidak dijawab"}
                    </p>
                  </div>

                  {isEssay && (
                    <div className="bg-primary/5 p-4 rounded-md border border-primary/20">
                      <h4 className="font-semibold text-sm mb-4">
                        Area Penilaian Guru
                      </h4>
                      <GradeQuestionForm
                        attemptId={attempt.id}
                        question={question}
                        answerData={answerData}
                        gradeAnswer={gradeAnswer}
                        onSuccess={() => refetch()}
                      />
                    </div>
                  )}

                  {!isEssay && (
                    <p className="text-sm text-muted-foreground italic">
                      Jawaban {question.type} dinilai otomatis oleh sistem. Skor
                      saat ini:{" "}
                      {answerData?.score ? parseFloat(answerData.score) : 0}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}
