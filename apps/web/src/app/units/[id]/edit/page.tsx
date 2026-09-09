"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUnit, useUpdateUnit, UNIT_TYPES, UNIT_TYPE_VALUES } from "@/hooks/use-units";

const unitSchema = z.object({
  name: z.string().min(1, "Nama unit wajib diisi"),
  // Derived from UNIT_TYPES so the form can never accept a narrower set than
  // the database holds — this literal list had fallen two values behind.
  type: z.enum(UNIT_TYPE_VALUES, {
    error: "Tipe unit wajib dipilih",
  }),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  headName: z.string().optional(),
});

type UnitFormData = z.infer<typeof unitSchema>;

export default function EditUnitPage() {
  const router = useRouter();
  const params = useParams();
  const unitId = params.id as string;

  const { data: unit, isLoading: unitLoading } = useUnit(unitId);
  const updateUnit = useUpdateUnit();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormData>({
    resolver: zodResolver(unitSchema),
  });

  // Populate form with existing data
  useEffect(() => {
    if (unit) {
      reset({
        name: unit.name,
        type: unit.type,
        address: unit.address || "",
        phone: unit.phone || "",
        email: unit.email || "",
        headName: unit.headName || "",
      });
    }
  }, [unit, reset]);

  const onSubmit = async (data: UnitFormData) => {
    try {
      await updateUnit.mutateAsync({
        id: unitId,
        data: {
          ...data,
          address: data.address || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          headName: data.headName || undefined,
        },
      });
      toast.success("Unit berhasil diperbarui");
      router.push(`/units/${unitId}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal memperbarui unit";
      toast.error(errorMessage);
    }
  };

  if (unitLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!unit) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <p className="text-muted-foreground">Unit tidak ditemukan</p>
          <Button asChild>
            <Link href="/units">Kembali ke Daftar Unit</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/units/${unitId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Unit</h1>
            <p className="text-muted-foreground">
              Perbarui data unit {unit.name}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Dasar</CardTitle>
                <CardDescription>Data utama unit pendidikan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Unit *</Label>
                  <Input
                    id="name"
                    placeholder="Contoh: SMP IT Al-Hikmah"
                    {...register("name")}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Tipe Unit *</Label>
                  <Select
                    value={watch("type")}
                    onValueChange={(value) =>
                      setValue("type", value as UnitFormData["type"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih tipe unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.type && (
                    <p className="text-sm text-destructive">
                      {errors.type.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="headName">Kepala Unit</Label>
                  <Input
                    id="headName"
                    placeholder="Nama kepala sekolah/pimpinan"
                    {...register("headName")}
                  />
                  {errors.headName && (
                    <p className="text-sm text-destructive">
                      {errors.headName.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kontak & Lokasi</CardTitle>
                <CardDescription>Informasi kontak unit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Alamat</Label>
                  <Textarea
                    id="address"
                    placeholder="Alamat lengkap unit"
                    rows={3}
                    {...register("address")}
                  />
                  {errors.address && (
                    <p className="text-sm text-destructive">
                      {errors.address.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telepon</Label>
                  <Input
                    id="phone"
                    placeholder="021-12345678"
                    {...register("phone")}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">
                      {errors.phone.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="unit@pesantren.sch.id"
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" asChild>
              <Link href={`/units/${unitId}`}>Batal</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || updateUnit.isPending}
            >
              {isSubmitting || updateUnit.isPending
                ? "Menyimpan..."
                : "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
