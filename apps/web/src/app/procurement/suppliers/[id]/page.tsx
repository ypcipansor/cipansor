"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import * as z from "zod";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
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
import { useSupplier, useSupplierMutation } from "@/hooks/use-suppliers";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useParams } from "next/navigation";
import { useEffect } from "react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  contactPerson: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  rating: z.coerce.number().min(0).max(5).optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
});

export default function EditSupplierPage() {
  const { id } = useParams();
  const { data: supplier, isLoading } = useSupplier(id as string);
  const { update } = useSupplierMutation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      contactPerson: "",
      category: "GENERAL",
      rating: 0,
      bankName: "",
      bankAccount: "",
    },
  });

  useEffect(() => {
    if (supplier) {
      form.reset({
        name: supplier.name,
        address: supplier.address,
        phone: supplier.phone,
        email: supplier.email,
        contactPerson: supplier.contactPerson,
        category: supplier.category || "GENERAL",
        rating: supplier.rating,
        bankName: supplier.bankName,
        bankAccount: supplier.bankAccount,
      });
    }
  }, [supplier, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Clean up null/undefined values to strings or remove them
    const cleanedValues = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v === null ? undefined : v]),
    );
    // TypeScript trickery for the UpdateInput
    update.mutate({ id: id as string, data: cleanedValues as any });
  };

  if (isLoading)
    return (
      <MainLayout>
        <div>Loading...</div>
      </MainLayout>
    );

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/procurement/suppliers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Supplier</h1>
            <p className="text-muted-foreground">Ubah data supplier.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Form Edit Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Perusahaan / Supplier</FormLabel>
                      <FormControl>
                        <Input placeholder="PT. Maju Mundur" {...field} />
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
                          value={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih Kategori" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="GENERAL">Umum</SelectItem>
                            <SelectItem value="STATIONERY">
                              ATK (Alat Tulis Kantor)
                            </SelectItem>
                            <SelectItem value="IT">Elektronik & IT</SelectItem>
                            <SelectItem value="CATERING">
                              Katering / Makanan
                            </SelectItem>
                            <SelectItem value="CONSTRUCTION">
                              Konstruksi / Bangunan
                            </SelectItem>
                            <SelectItem value="SERVICES">Jasa</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kontak Person (PIC)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nama PIC"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telepon / WA</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="0812..."
                            {...field}
                            value={field.value || ""}
                          />
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
                            placeholder="email@example.com"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alamat Lengkap</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Jl. ..."
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nama Bank</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="BCA / Mandiri / dll"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bankAccount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nomor Rekening</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="1234567890"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={update.isPending}
                  className="w-full"
                >
                  {update.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Simpan Perubahan
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
