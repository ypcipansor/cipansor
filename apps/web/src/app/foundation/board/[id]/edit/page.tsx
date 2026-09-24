"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useFoundationBoardMember,
  useUpdateFoundationBoardMember,
} from "@/hooks";

const formSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  position: z.string().min(1, "Jabatan wajib diisi"),
  phone: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  address: z.string().optional(),
  startDate: z.string().min(1, "Tanggal mulai jabatan wajib diisi"),
  endDate: z.string().optional(),
  isActive: z.boolean(),
  bio: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PageProps {
  params: Promise<{ id: string }>;
}

function EditBoardMemberPageContent({ params }: PageProps) {
  const { id: memberId } = use(params);
  const router = useRouter();

  const { data: member, isLoading } = useFoundationBoardMember(memberId);
  const updateMember = useUpdateFoundationBoardMember();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      position: "",
      phone: "",
      email: "",
      address: "",
      startDate: "",
      endDate: "",
      isActive: true,
      bio: "",
    },
  });

  useEffect(() => {
    if (member) {
      form.reset({
        name: member.name,
        position: member.position,
        phone: member.phone || "",
        email: member.email || "",
        address: member.address || "",
        startDate: member.startDate
          ? new Date(member.startDate).toISOString().split("T")[0]
          : "",
        endDate: member.endDate
          ? new Date(member.endDate).toISOString().split("T")[0]
          : "",
        isActive: member.isActive,
        bio: member.bio || "",
      });
    }
  }, [member, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMember.mutateAsync({
        id: memberId,
        data: {
          ...data,
          email: data.email || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined,
          endDate: data.endDate || undefined,
          bio: data.bio || undefined,
        },
      });
      toast.success("Pengurus berhasil diperbarui");
      router.push("/foundation?tab=board");
    } catch {
      toast.error("Gagal memperbarui pengurus");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Pengurus tidak ditemukan</h2>
        <Button className="mt-4" onClick={() => router.back()}>
          Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Pengurus</h1>
          <p className="text-muted-foreground">{member.name}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Personal Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informasi Pribadi</CardTitle>
                <CardDescription>Data pribadi pengurus</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Lengkap</FormLabel>
                      <FormControl>
                        <Input placeholder="Dr. H. Ahmad, M.A." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jabatan</FormLabel>
                      <FormControl>
                        <Input placeholder="Ketua Yayasan" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Telepon</FormLabel>
                      <FormControl>
                        <Input placeholder="08123456789" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alamat</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Alamat lengkap..."
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Position Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informasi Jabatan</CardTitle>
                <CardDescription>Masa jabatan dan status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Mulai</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Berakhir</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription>
                          Kosongkan jika masih aktif
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="mt-0!">Status Aktif</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Biografi Singkat</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Riwayat singkat pengurus..."
                          rows={5}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              Batal
            </Button>
            <Button type="submit" disabled={updateMember.isPending}>
              {updateMember.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function EditBoardMemberPage(
  props: Parameters<typeof EditBoardMemberPageContent>[0],
) {
  return (
    <MainLayout>
      <EditBoardMemberPageContent {...props} />
    </MainLayout>
  );
}
