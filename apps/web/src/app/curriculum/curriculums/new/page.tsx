"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { useCreateCurriculum } from "@/hooks/use-curriculum";
import { useUnits } from "@/hooks/use-units";
import { useAcademicYears } from "@/hooks/use-academic-years";

import { MainLayout } from "@/components/layout";
const curriculumSchema = z.object({
  code: z.string().min(1, "Kode kurikulum wajib diisi"),
  name: z.string().min(1, "Nama kurikulum wajib diisi"),
  description: z.string().optional(),
  unitId: z.string().min(1, "Unit wajib dipilih"),
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
  gradeLevel: z.coerce
    .number()
    .min(1, "Tingkat kelas wajib diisi")
    .max(12, "Maksimal kelas 12"),
  isActive: z.boolean(),
});

type CurriculumFormData = z.infer<typeof curriculumSchema>;

function NewCurriculumPageContent() {
  const router = useRouter();
  const createMutation = useCreateCurriculum();
  const { data: units } = useUnits();
  const { data: academicYearsData } = useAcademicYears();

  const academicYears = academicYearsData?.data || [];
  const activeAcademicYear = academicYears.find((ay) => ay.isActive);

  const form = useForm<CurriculumFormData>({
    resolver: zodResolver(curriculumSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      unitId: "",
      academicYearId: activeAcademicYear?.id || "",
      gradeLevel: 1,
      isActive: true,
    },
  });

  const onSubmit = async (data: CurriculumFormData) => {
    try {
      const result = await createMutation.mutateAsync({
        code: data.code,
        name: data.name,
        description: data.description || undefined,
        unitId: data.unitId,
        academicYearId: data.academicYearId,
        gradeLevel: data.gradeLevel,
        isActive: data.isActive,
      });
      toast.success("Kurikulum berhasil dibuat");
      router.push(`/curriculum/curriculums/${result.id}`);
    } catch {
      toast.error("Gagal membuat kurikulum");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/curriculum">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Buat Kurikulum</h1>
          <p className="text-muted-foreground">
            Buat kurikulum baru untuk unit pendidikan
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Info */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Informasi Kurikulum</CardTitle>
                <CardDescription>Masukkan detail kurikulum</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kode *</FormLabel>
                        <FormControl>
                          <Input placeholder="KUR-2024-SD-1" {...field} />
                        </FormControl>
                        <FormDescription>Kode unik kurikulum</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nama *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Kurikulum Merdeka SD Kelas 1"
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deskripsi</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Deskripsi kurikulum..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="unitId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {units?.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gradeLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tingkat Kelas *</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tingkat" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(
                              (level) => (
                                <SelectItem
                                  key={level}
                                  value={level.toString()}
                                >
                                  Kelas {level}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
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
                  <CardTitle>Tahun Ajaran</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="academicYearId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tahun Ajaran *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tahun ajaran" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {academicYears.map((ay) => (
                              <SelectItem key={ay.id} value={ay.id}>
                                {ay.name} {ay.isActive && "(Aktif)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Aktif</FormLabel>
                          <FormDescription>
                            Kurikulum dapat digunakan
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
                  <CardTitle>Ringkasan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kode</span>
                    <span className="font-mono">
                      {form.watch("code") || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nama</span>
                    <span className="truncate max-w-[120px]">
                      {form.watch("name") || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tingkat</span>
                    <span>Kelas {form.watch("gradeLevel") || "-"}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/curriculum">Batal</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Buat Kurikulum
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function NewCurriculumPage() {
  return (
    <MainLayout>
      <NewCurriculumPageContent />
    </MainLayout>
  );
}
