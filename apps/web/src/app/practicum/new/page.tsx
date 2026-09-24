"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreatePracticumLessonPlanSchema } from "@cipansor/shared";
import { useCreateLessonPlan } from "@/hooks/practicum/use-practicum";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { Plus, Trash } from "lucide-react";
import { MainLayout } from "@/components/layout";

function NewLessonPlanPageContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: academicYears } = useAcademicYears();
  const activeYear = academicYears?.data?.find((y) => y.isActive);

  const { mutate: createLessonPlan, isPending } = useCreateLessonPlan();

  const form = useForm({
    resolver: zodResolver(CreatePracticumLessonPlanSchema),
    defaultValues: {
      subject: "",
      topic: "",
      method: "",
      materials: "",
      objectives: "",
      steps: [
        { name: "Introduction", content: "" },
        { name: "Presentation", content: "" },
        { name: "Closing", content: "" },
      ],
      academicYearId: activeYear?.id || "",
      studentId: user?.student?.id || "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "steps" as any,
  });

  const onSubmit = (data: any) => {
    if (!data.academicYearId || !data.studentId) {
      toast.error("Session expired or academic year not set");
      return;
    }

    createLessonPlan(data, {
      onSuccess: () => {
        toast.success("Lesson plan created successfully");
        router.push("/practicum");
      },
      onError: (err: any) => {
        toast.error(err.message || "Failed to create lesson plan");
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h1 className="text-3xl font-bold">New Lesson Plan (I'dad)</h1>
      <Card>
        <CardHeader>
          <CardTitle>Lesson Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Arabic Grammar" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="topic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Topic</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Al-Mubtada wa Al-Khabar"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teaching Method</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Direct Method" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="objectives"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Learning Objectives</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">
                    Teaching Steps (Tahapan)
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: "", content: "" })}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Step
                  </Button>
                </div>

                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="border p-4 rounded-lg space-y-4 relative"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                    <div className="grid gap-2">
                      <FormLabel>Step Name</FormLabel>
                      <Input
                        {...form.register(`steps.${index}.name` as any)}
                        placeholder="e.g. Muqaddimah"
                      />
                    </div>
                    <div className="grid gap-2">
                      <FormLabel>Content/Activity</FormLabel>
                      <Textarea
                        {...form.register(`steps.${index}.content` as any)}
                        placeholder="What will you do in this step?"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Saving..." : "Submit for Review"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewLessonPlanPage() {
  return (
    <MainLayout>
      <NewLessonPlanPageContent />
    </MainLayout>
  );
}
