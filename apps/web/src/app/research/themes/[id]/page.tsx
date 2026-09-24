"use client";

import { useCreateResearchSubmission } from "@/hooks/research/use-research";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";

// Mock hook for fetching single theme if not already in use-research.ts
function useResearchTheme(id: string) {
  const { data: themes } = useResearchThemes();
  return { data: themes?.find((t) => t.id === id) };
}

import { useResearchThemes } from "@/hooks/research/use-research";

import { MainLayout } from "@/components/layout";
function ThemeDetailPageContent() {
  const { id } = useParams();
  const router = useRouter();
  const { data: theme } = useResearchTheme(id as string);
  const { mutate: createSubmission, isPending } = useCreateResearchSubmission();

  const form = useForm({
    defaultValues: {
      title: "",
      abstract: "",
    },
  });

  const onSubmit = (data: any) => {
    createSubmission(
      { ...data, themeId: id as string },
      {
        onSuccess: (res) => {
          toast.success("Research submission created");
          router.push(`/research/submissions/${res.id}`);
        },
      },
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{theme?.title}</h1>
        <p className="text-muted-foreground mt-2">{theme?.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start Your Research</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Research Title</label>
              <Input
                {...form.register("title")}
                placeholder="Enter your specific research title"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Abstract / Introduction
              </label>
              <Textarea
                {...form.register("abstract")}
                placeholder="Briefly describe your research objective"
                rows={5}
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Submission"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ThemeDetailPage() {
  return (
    <MainLayout>
      <ThemeDetailPageContent />
    </MainLayout>
  );
}
