"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useViolationType,
  useUpdateViolationType,
  VIOLATION_CATEGORIES,
  ViolationCategory,
} from "@/hooks/use-violations";

const formSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  description: z.string().optional(),
  category: z.string().min(1, "Kategori wajib dipilih"),
  points: z.coerce.number().min(1, "Poin minimal 1"),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

function EditViolationTypePageContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: violationType, isLoading } = useViolationType(id);
  const updateMutation = useUpdateViolationType();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      points: 1,
      isActive: true,
    },
  });

  useEffect(() => {
    if (violationType) {
      form.reset({
        name: violationType.name,
        description: violationType.description || "",
        category: violationType.category,
        points: violationType.points,
        isActive: violationType.isActive,
      });
    }
  }, [violationType, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          ...data,
          category: data.category as ViolationCategory,
          description: data.description || undefined,
        },
      });
      toast.success("Jenis pelanggaran berhasil diperbarui");
      router.push("/violations");
    } catch {
      toast.error("Gagal memperbarui jenis pelanggaran");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!violationType) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Jenis pelanggaran tidak ditemukan
        </p>
        <Button variant="link" asChild>
          <Link href="/violations">Kembali ke daftar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/violations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Edit Jenis Pelanggaran
          </h1>
          <p className="text-muted-foreground">Perbarui jenis pelanggaran</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Detail Jenis Pelanggaran</CardTitle>
          <CardDescription>Informasi jenis pelanggaran</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contoh: Tidak sholat berjamaah"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deskripsi (Opsional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Deskripsi lengkap pelanggaran..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategori</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih kategori" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {VIOLATION_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Tingkat keparahan pelanggaran
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="points"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Poin</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormDescription>Poin pelanggaran</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Status Aktif</FormLabel>
                      <FormDescription>
                        Jenis pelanggaran yang aktif dapat digunakan untuk
                        pencatatan
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

              <div className="flex justify-end gap-4">
                <Button variant="outline" asChild>
                  <Link href="/violations">Batal</Link>
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending
                    ? "Menyimpan..."
                    : "Simpan Perubahan"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EditViolationTypePage() {
  return (
    <MainLayout>
      <EditViolationTypePageContent />
    </MainLayout>
  );
}
