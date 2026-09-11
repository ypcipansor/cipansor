"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { ArrowLeft, Building2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useDormitory,
  useUpdateDormitory,
  DORMITORY_TYPES,
} from "@/hooks/use-dormitory";
import { useUnits } from "@/hooks/use-units";
import { useTeachers } from "@/hooks/use-teachers";

import { MainLayout } from "@/components/layout";
/** Sentinel for "no single unit runs this asrama" — sent to the API as null. */
const FOUNDATION_RUN = "__yayasan__";

const formSchema = z.object({
  name: z.string().min(1, "Nama asrama wajib diisi"),
  code: z
    .string()
    .min(1, "Kode asrama wajib diisi")
    .max(10, "Kode maksimal 10 karakter"),
  type: z.enum(["MALE", "FEMALE"], {
    error: "Tipe asrama wajib dipilih",
  }),
  capacity: z.coerce.number().min(1, "Kapasitas minimal 1"),
  // Optional: an asrama run by the yayasan across units has no single unit.
  // Radix rejects an empty SelectItem value, hence the sentinel rather than "".
  unitId: z.string().optional(),
  supervisorId: z.string().optional(),
  description: z.string().optional(),
  facilities: z.string().optional(),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

function EditDormitoryPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: dormitory, isLoading } = useDormitory(id);
  const updateMutation = useUpdateDormitory();

  const { data: unitsData, isLoading: unitsLoading } = useUnits();
  const { data: teachersData, isLoading: teachersLoading } = useTeachers();
  const teachers = (teachersData as any)?.data || [];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      code: "",
      type: "MALE",
      capacity: 50,
      unitId: FOUNDATION_RUN,
      supervisorId: "",
      description: "",
      facilities: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (dormitory) {
      form.reset({
        name: dormitory.name,
        code: dormitory.code,
        type: dormitory.type,
        capacity: dormitory.capacity,
        unitId: dormitory.unitId ?? FOUNDATION_RUN,
        supervisorId: dormitory.supervisorId || "",
        description: dormitory.description || "",
        facilities: dormitory.facilities || "",
        isActive: dormitory.isActive,
      });
    }
  }, [dormitory, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          ...data,
          unitId:
            !data.unitId || data.unitId === FOUNDATION_RUN
              ? null
              : data.unitId,
          supervisorId: data.supervisorId || undefined,
          description: data.description || undefined,
          facilities: data.facilities || undefined,
        },
      });
      toast.success("Asrama berhasil diperbarui");
      router.push(`/dormitories/${id}`);
    } catch {
      toast.error("Gagal memperbarui asrama");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dormitory) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Asrama tidak ditemukan</h3>
        <Button asChild className="mt-4">
          <Link href="/dormitories">Kembali ke Daftar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dormitories/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Asrama</h1>
          <p className="text-muted-foreground">
            Perbarui data asrama {dormitory.name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi Asrama</CardTitle>
          <CardDescription>Perbarui data asrama</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Asrama</FormLabel>
                      <FormControl>
                        <Input placeholder="Asrama Al-Fatih" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kode</FormLabel>
                      <FormControl>
                        <Input placeholder="ASR-001" {...field} />
                      </FormControl>
                      <FormDescription>
                        Kode unik untuk identifikasi asrama
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipe Asrama</FormLabel>
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
                          {DORMITORY_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kapasitas</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormDescription>
                        Jumlah maksimal penghuni
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Pengelola</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={unitsLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih unit pengelola" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={FOUNDATION_RUN}>
                            Yayasan (lintas unit)
                          </SelectItem>
                          {unitsData?.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Siapa yang mengelola asrama, bukan siapa yang boleh
                        mengaksesnya. Santri dari unit mana pun tetap dapat
                        ditempatkan di sini.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="supervisorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pengasuh (Opsional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={teachersLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih pengasuh" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Tidak ada</SelectItem>
                          {teachers.map((teacher: any) => (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {teacher.user?.name ||
                                teacher.nip ||
                                "Unknown Teacher"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <FormLabel>Deskripsi (Opsional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Deskripsi singkat tentang asrama..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="facilities"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fasilitas (Opsional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Kamar mandi dalam, AC, WiFi, dll..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Status Aktif</FormLabel>
                      <FormDescription>
                        Asrama yang tidak aktif tidak dapat menerima penghuni
                        baru
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
                  <Link href={`/dormitories/${id}`}>Batal</Link>
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

export default function EditDormitoryPage(props: Parameters<typeof EditDormitoryPageContent>[0]) {
  return (
    <MainLayout>
      <EditDormitoryPageContent {...props} />
    </MainLayout>
  );
}
