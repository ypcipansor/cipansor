"use client";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ComplaintCategory } from "@cipansor/shared";
import { useCreateComplaint } from "@/hooks/use-complaints";
import { useBuildings, useRooms } from "@/hooks/use-facilities";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const complaintSchema = z.object({
  category: z.nativeEnum(ComplaintCategory),
  subject: z.string().min(5, "Subjek minimal 5 karakter"),
  description: z.string().min(20, "Deskripsi minimal 20 karakter"),
  location: z.string().optional(),
  // Si-Peka: precise facility location for FACILITY damage reports
  buildingId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  isAnonymous: z.boolean().optional(),
});

export default function CreateComplaintPage() {
  const router = useRouter();
  const { mutate: createComplaint, isPending } = useCreateComplaint();
  const { data: buildings } = useBuildings({ limit: 100 });

  const form = useForm<z.infer<typeof complaintSchema>>({
    resolver: zodResolver(complaintSchema),
    defaultValues: {
      isAnonymous: false,
    },
  });

  // Si-Peka: room options depend on the chosen building.
  const watchedBuildingId = form.watch("buildingId");
  const { data: rooms } = useRooms(
    watchedBuildingId
      ? { buildingId: watchedBuildingId, limit: 100 }
      : undefined,
  );

  const onSubmit = (values: z.infer<typeof complaintSchema>) => {
    createComplaint(values, {
      onSuccess: () => {
        router.push("/quality/complaints");
      },
    });
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Link href="/quality/complaints">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Buat Aduan</h1>
            <p className="text-muted-foreground">
              Sampaikan aspirasi atau keluhan Anda untuk peningkatan kualitas
              layanan.
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-6 bg-card">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih kategori aduan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ComplaintCategory).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
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
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subjek</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contoh: AC di kelas 7A rusak"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lokasi (Opsional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contoh: Gedung A Lantai 2"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Si-Peka: precise facility location (optional) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="buildingId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gedung (Opsional)</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue("roomId", undefined);
                        }}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih gedung" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(buildings || []).map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Untuk laporan kerusakan fasilitas
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ruang (Opsional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                        disabled={!watchedBuildingId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                watchedBuildingId
                                  ? "Pilih ruang"
                                  : "Pilih gedung dulu"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(rooms || []).map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
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
                    <FormLabel>Deskripsi</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Jelaskan detail permasalahan..."
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isAnonymous"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Kirim Secara Anonim</FormLabel>
                      <FormDescription>
                        Identitas Anda akan disembunyikan dari petugas (kecuali
                        Super Admin jika diperlukan investigasi).
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Link href="/quality/complaints">
                  <Button type="button" variant="outline">
                    Batal
                  </Button>
                </Link>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Mengirim..." : "Kirim Aduan"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </MainLayout>
  );
}
