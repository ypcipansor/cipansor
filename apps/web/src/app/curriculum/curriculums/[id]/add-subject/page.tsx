"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, BookOpen, GraduationCap } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useCurriculum,
  useSubjects,
  useAddSubjectToCurriculum,
  SUBJECT_TYPE_LABELS,
  SubjectType,
} from "@/hooks/use-curriculum";

function getTypeBadgeColor(type: SubjectType) {
  const colors: Record<SubjectType, string> = {
    REQUIRED: "bg-blue-100 text-blue-800",
    ELECTIVE: "bg-green-100 text-green-800",
    EXTRACURRICULAR: "bg-purple-100 text-purple-800",
  };
  return colors[type];
}

const addSubjectSchema = z.object({
  subjectId: z.string().min(1, "Mata pelajaran wajib dipilih"),
  semester: z.coerce
    .number()
    .min(1, "Semester minimal 1")
    .max(2, "Semester maksimal 2"),
  sequence: z.coerce.number().min(1, "Urutan minimal 1"),
  isRequired: z.boolean(),
});

type AddSubjectFormData = z.infer<typeof addSubjectSchema>;

function AddSubjectToCurriculumPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: curriculum, isLoading: loadingCurriculum } = useCurriculum(id);
  const { data: subjects, isLoading: loadingSubjects } = useSubjects({
    isActive: true,
  });
  const addSubjectMutation = useAddSubjectToCurriculum();

  // Filter out subjects already in the curriculum
  const availableSubjects = useMemo(() => {
    if (!subjects || !curriculum?.subjects) return subjects || [];
    const existingSubjectIds = new Set(
      curriculum.subjects.map((cs) => cs.subjectId),
    );
    return subjects.filter((s) => !existingSubjectIds.has(s.id));
  }, [subjects, curriculum]);

  const form = useForm<AddSubjectFormData>({
    resolver: zodResolver(addSubjectSchema),
    defaultValues: {
      subjectId: "",
      semester: 1,
      sequence: (curriculum?.subjects?.length || 0) + 1,
      isRequired: true,
    },
  });

  const selectedSubjectId = form.watch("subjectId");
  const selectedSubject = useMemo(() => {
    return subjects?.find((s) => s.id === selectedSubjectId);
  }, [subjects, selectedSubjectId]);

  const onSubmit = async (data: AddSubjectFormData) => {
    try {
      await addSubjectMutation.mutateAsync({
        curriculumId: id,
        subjectId: data.subjectId,
        semester: data.semester,
        sequence: data.sequence,
        isRequired: data.isRequired,
      });
      toast.success("Mata pelajaran berhasil ditambahkan ke kurikulum");
      router.push(`/curriculum/curriculums/${id}`);
    } catch {
      toast.error("Gagal menambahkan mata pelajaran");
    }
  };

  if (loadingCurriculum || loadingSubjects) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!curriculum) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <GraduationCap className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Kurikulum tidak ditemukan</p>
        <Button asChild className="mt-4">
          <Link href="/curriculum">Kembali ke Kurikulum</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/curriculum/curriculums/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Tambah Mata Pelajaran
          </h1>
          <p className="text-muted-foreground">ke {curriculum.name}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Form */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Pilih Mata Pelajaran</CardTitle>
                <CardDescription>
                  Pilih mata pelajaran yang akan ditambahkan ke kurikulum
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="subjectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mata Pelajaran *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih mata pelajaran" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableSubjects?.length === 0 ? (
                            <div className="py-4 text-center text-sm text-muted-foreground">
                              Semua mata pelajaran sudah ditambahkan
                            </div>
                          ) : (
                            availableSubjects?.map((subject) => (
                              <SelectItem key={subject.id} value={subject.id}>
                                <div className="flex items-center gap-2">
                                  <span>{subject.name}</span>
                                  <span className="text-muted-foreground">
                                    ({subject.code})
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedSubject && (
                  <div className="p-4 rounded-lg bg-muted">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 flex items-center justify-center rounded-lg bg-primary/10">
                        <BookOpen className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{selectedSubject.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedSubject.code}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge
                            className={getTypeBadgeColor(selectedSubject.type)}
                          >
                            {SUBJECT_TYPE_LABELS[selectedSubject.type]}
                          </Badge>
                          <Badge variant="outline">
                            {selectedSubject.credits} SKS
                          </Badge>
                          <Badge variant="outline">
                            {selectedSubject.hoursPerWeek} jam/minggu
                          </Badge>
                        </div>
                        {selectedSubject.description && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {selectedSubject.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="semester"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Semester *</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih semester" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">Semester 1</SelectItem>
                            <SelectItem value="2">Semester 2</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Semester mata pelajaran diajarkan
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sequence"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Urutan *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormDescription>
                          Urutan tampilan dalam kurikulum
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Side Panel */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Status dalam Kurikulum</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="isRequired"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Mata Pelajaran Wajib
                          </FormLabel>
                          <FormDescription>
                            Wajib diambil oleh semua siswa
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Info Kurikulum</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nama</span>
                    <span className="font-medium truncate max-w-[120px]">
                      {curriculum.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unit</span>
                    <span>{curriculum.unit?.name || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tingkat</span>
                    <span>Kelas {curriculum.gradeLevel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Mapel</span>
                    <span>{curriculum.subjects?.length || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href={`/curriculum/curriculums/${id}`}>Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={addSubjectMutation.isPending || !selectedSubject}
            >
              {addSubjectMutation.isPending ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Tambahkan ke Kurikulum
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function AddSubjectToCurriculumPage(props: Parameters<typeof AddSubjectToCurriculumPageContent>[0]) {
  return (
    <MainLayout>
      <AddSubjectToCurriculumPageContent {...props} />
    </MainLayout>
  );
}
