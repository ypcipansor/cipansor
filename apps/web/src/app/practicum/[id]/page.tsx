"use client";

import {
  useLessonPlan,
  useReviewLessonPlan,
} from "@/hooks/practicum/use-practicum";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout";
function LessonPlanDetailPageContent() {
  const { id } = useParams();
  const { data: lp, isLoading } = useLessonPlan(id as string);
  const { mutate: reviewLp, isPending } = useReviewLessonPlan();

  const handleReview = (status: "APPROVED" | "REVISION_REQUIRED") => {
    const notes = prompt(`Enter review notes for ${status.replace("_", " ")}:`);
    if (notes === null) return;

    reviewLp(
      { id: id as string, status, reviewNotes: notes },
      {
        onSuccess: () => toast.success(`Lesson plan ${status.toLowerCase()}`),
      },
    );
  };

  if (isLoading) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Badge className="mb-2 uppercase">{lp?.status}</Badge>
          <h1 className="text-3xl font-bold">{lp?.topic}</h1>
          <p className="text-muted-foreground">
            {lp?.subject} — Prepared by {lp?.student.user.name}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleReview("REVISION_REQUIRED")}
            disabled={isPending}
          >
            Request Revision
          </Button>
          <Button onClick={() => handleReview("APPROVED")} disabled={isPending}>
            Approve I'dad
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Teaching Strategy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-bold text-sm uppercase text-muted-foreground">
                Method
              </h4>
              <p>{lp?.method}</p>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase text-muted-foreground">
                Learning Objectives
              </h4>
              <p className="whitespace-pre-wrap">{lp?.objectives}</p>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase text-muted-foreground">
                Materials & Props
              </h4>
              <p>{lp?.materials}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Practicum Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {lp?.schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No schedule assigned yet.
              </p>
            ) : (
              <div className="space-y-4">
                {lp?.schedules.map((sch: any) => (
                  <div key={sch.id} className="border-b pb-2 last:border-0">
                    <p className="font-bold">
                      {new Date(sch.date).toLocaleDateString("id-ID", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {sch.startTime} - {sch.endTime}
                    </p>
                    <p className="text-sm mt-1">
                      Class:{" "}
                      <span className="font-medium">
                        {sch.targetClass.name}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evaluations (Naqd)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evaluator</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Methods</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Attitude</TableHead>
                <TableHead>Overall</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lp?.evaluations.map((ev: any) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-medium">
                    {ev.evaluator.name}
                  </TableCell>
                  <TableCell>
                    {ev.isPeer ? "Peer (Naqid)" : "Teacher"}
                  </TableCell>
                  <TableCell>{ev.methodScore}</TableCell>
                  <TableCell>{ev.contentScore}</TableCell>
                  <TableCell>{ev.languageScore}</TableCell>
                  <TableCell>{ev.performanceScore}</TableCell>
                  <TableCell className="font-bold">
                    {ev.totalScore.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
              {lp?.evaluations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground italic"
                  >
                    No evaluations recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LessonPlanDetailPage() {
  return (
    <MainLayout>
      <LessonPlanDetailPageContent />
    </MainLayout>
  );
}
