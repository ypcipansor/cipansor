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
import {
  useCreateSubject,
  SUBJECT_TYPES,
  SUBJECT_TYPE_LABELS,
  SubjectType,
} from "@/hooks/use-curriculum";
import { useUnits } from "@/hooks/use-units";

import { MainLayout } from "@/components/layout";
const subjectSchema = z.object({
  code: z.string().min(1, "Kode mata pelajaran wajib diisi"),
  name: z.string().min(1, "Nama mata pelajaran wajib diisi"),
  description: z.string().optional(),
  type: z.enum(["REQUIRED", "ELECTIVE", "EXTRACURRICULAR"] as const, {
    error: "Tipe mata pelajaran wajib dipilih",
  }),
  credits: z.coerce.number().min(1, "Minimal 1 SKS"),
  hoursPerWeek: z.coerce.number().min(1, "Minimal 1 jam per minggu"),
  passingScore: z.coerce.number().min(0).max(100).optional(),
  unitId: z.string().min(1, "Unit wajib dipilih"),
  isActive: z.boolean(),
});

type SubjectFormData = z.infer<typeof subjectSchema>;

function NewSubjectPageContent() {
  const router = useRouter();
  const createMutation = useCreateSubject();
  const { data: units } = useUnits();

  const form = useForm<SubjectFormData>({
    resolver: zodResolver(subjectSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      type: undefined,
      credits: 2,
      hoursPerWeek: 2,
      passingScore: 70,
      unitId: "",
      isActive: true,
    },
  });

  const onSubmit = async (data: SubjectFormData) => {
    try {
      await createMutation.mutateAsync({
        code: data.code,
        name: data.name,
        description: data.description || undefined,
        type: data.type as SubjectType,
        credits: data.credits,
        hoursPerWeek: data.hoursPerWeek,
        passingScore: data.passingScore,
        unitId: data.unitId,
        isActive: data.isActive,
      });
      toast.success("Mata pelajaran berhasil ditambahkan");
      router.push("/curriculum");
    } catch {
      toast.error("Gagal menambahkan mata pelajaran");
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
          <h1 className="text-3xl font-bold tracking-tight">
            Tambah Mata Pelajaran
          </h1>
          <p className="text-muted-foreground">Buat mata pelajaran baru</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Info */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Informasi Mata Pelajaran</CardTitle>
                <CardDescription>
                  Masukkan detail mata pelajaran
                </CardDescription>
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
                          <Input placeholder="MAT001" {...field} />
                        </FormControl>
                        <FormDescription>
                          Kode unik mata pelajaran
                        </FormDescription>
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
                          <Input placeholder="Matematika" {...field} />
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
                          placeholder="Deskripsi mata pelajaran..."
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
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipe *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tipe" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SUBJECT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {SUBJECT_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="credits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKS *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormDescription>
                          Satuan Kredit Semester
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="hoursPerWeek"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jam per Minggu *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormDescription>
                          Jumlah jam pelajaran per minggu
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="passingScore"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>KKM (Passing Score)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} max={100} {...field} />
                        </FormControl>
                        <FormDescription>
                          Nilai minimal kelulusan (default 70)
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
                            Mata pelajaran dapat digunakan dalam kurikulum
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
                    <span>{form.watch("name") || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipe</span>
                    <span>
                      {form.watch("type")
                        ? SUBJECT_TYPE_LABELS[form.watch("type")]
                        : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SKS</span>
                    <span>{form.watch("credits")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Jam/Minggu</span>
                    <span>{form.watch("hoursPerWeek")}</span>
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
                  Simpan
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function NewSubjectPage() {
  return (
    <MainLayout>
      <NewSubjectPageContent />
    </MainLayout>
  );
}
