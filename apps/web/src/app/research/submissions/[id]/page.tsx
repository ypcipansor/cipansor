"use client";

import {
  useResearchSubmission,
  useAddReference,
} from "@/hooks/research/use-research";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useParams } from "next/navigation";

import { MainLayout } from "@/components/layout";
function SubmissionDetailPageContent() {
  const { id } = useParams();
  const { data: submission, isLoading } = useResearchSubmission(id as string);
  const { mutate: addReference, isPending: isAddingRef } = useAddReference();
  const [showRefForm, setShowRefForm] = useState(false);

  const refForm = useForm({
    defaultValues: {
      bookTitle: "",
      author: "",
      volume: "",
      page: "",
      contentQuote: "",
    },
  });

  const onAddRef = (data: any) => {
    addReference(
      { ...data, submissionId: id as string },
      {
        onSuccess: () => {
          toast.success("Reference added");
          setShowRefForm(false);
          refForm.reset();
        },
      },
    );
  };

  if (isLoading) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Badge className="mb-2 uppercase">{submission?.status}</Badge>
          <h1 className="text-3xl font-bold">{submission?.title}</h1>
          <p className="text-muted-foreground">
            Theme: {submission?.theme.title}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Abstract</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">
                {submission?.abstract || "No abstract provided."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>References (Kutipan Kitab)</CardTitle>
              <Button size="sm" onClick={() => setShowRefForm(true)}>
                Add Reference
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kitab</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Vol/Page</TableHead>
                    <TableHead>Quote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submission?.references.map((ref: any) => (
                    <TableRow key={ref.id}>
                      <TableCell className="font-medium">
                        {ref.bookTitle}
                      </TableCell>
                      <TableCell>{ref.author}</TableCell>
                      <TableCell>
                        {ref.volume}/{ref.page}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs italic">
                        "{ref.contentQuote}"
                      </TableCell>
                    </TableRow>
                  ))}
                  {submission?.references.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No references added yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Student Info</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {submission?.student?.user?.name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Submitted:{" "}
                {submission?.createdAt
                  ? new Date(submission.createdAt).toLocaleDateString("id-ID")
                  : "-"}
              </p>
            </CardContent>
          </Card>

          {submission?.feedback && (
            <Card className="border-primary bg-primary/5">
              <CardHeader>
                <CardTitle className="text-sm">Reviewer Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm italic">"{submission.feedback}"</p>
                <p className="text-xs text-muted-foreground mt-2">
                  — {(submission as any).reviewer?.name}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {showRefForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Add Research Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={refForm.handleSubmit(onAddRef)}
                className="grid gap-4"
              >
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase">
                    Kitab Title
                  </label>
                  <Input
                    {...refForm.register("bookTitle")}
                    placeholder="e.g. Fathul Mu'in"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase">
                      Author
                    </label>
                    <Input
                      {...refForm.register("author")}
                      placeholder="e.g. Al-Malibari"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase">Vol</label>
                      <Input {...refForm.register("volume")} placeholder="1" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase">
                        Page
                      </label>
                      <Input {...refForm.register("page")} placeholder="42" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase">
                    Relevant Quote
                  </label>
                  <Textarea
                    {...refForm.register("contentQuote")}
                    placeholder="Copy the Arabic text or translation here..."
                    rows={4}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowRefForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isAddingRef}>
                    Save Reference
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function SubmissionDetailPage() {
  return (
    <MainLayout>
      <SubmissionDetailPageContent />
    </MainLayout>
  );
}
