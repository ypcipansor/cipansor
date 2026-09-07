"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useHealthRecord,
  useUpdateHealthRecord,
  HEALTH_RECORD_TYPES,
  HEALTH_STATUSES,
  HealthRecordType,
  HealthStatus,
} from "@/hooks/use-health";

const formSchema = z.object({
  recordType: z.string().min(1, "Jenis rekam wajib dipilih"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  treatment: z.string().optional(),
  medication: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().min(1, "Status wajib dipilih"),
  followUpDate: z.string().optional(),
  referredTo: z.string().optional(),
  temperature: z.string().optional(),
  bloodPressure: z.string().optional(),
  heartRate: z.string().optional(),
  weight: z.string().optional(),
  height: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PageProps {
  params: Promise<{ id: string }>;
}

function EditHealthRecordPageContent({ params }: PageProps) {
  const { id: recordId } = use(params);
  const router = useRouter();

  const { data: record, isLoading } = useHealthRecord(recordId);
  const updateMutation = useUpdateHealthRecord();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      recordType: "",
      date: "",
      symptoms: "",
      diagnosis: "",
      treatment: "",
      medication: "",
      notes: "",
      status: "",
      followUpDate: "",
      referredTo: "",
      temperature: "",
      bloodPressure: "",
      heartRate: "",
      weight: "",
      height: "",
    },
  });

  useEffect(() => {
    if (record) {
      form.reset({
        recordType: record.type,
        date: record.visitDate
          ? new Date(record.visitDate).toISOString().split("T")[0]
          : "",
        symptoms: record.complaint || "",
        diagnosis: record.diagnosis || "",
        treatment: record.treatment || "",
        medication: record.prescription || "",
        notes: record.notes || "",
        status: record.status || "",
        followUpDate: record.followUpDate
          ? new Date(record.followUpDate).toISOString().split("T")[0]
          : "",
        referredTo: record.referredTo || "",
        temperature: record.temperature?.toString() || "",
        bloodPressure: record.bloodPressure || "",
        heartRate: record.heartRate?.toString() || "",
        weight: record.weight?.toString() || "",
        height: record.height?.toString() || "",
      });
    }
  }, [record, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        id: recordId,
        data: {
          type: data.recordType as HealthRecordType,
          visitDate: data.date,
          complaint: data.symptoms || undefined,
          diagnosis: data.diagnosis || undefined,
          treatment: data.treatment || undefined,
          prescription: data.medication || undefined,
          notes: data.notes || undefined,
          status: data.status as HealthStatus,
          followUpDate: data.followUpDate || undefined,
          referredTo: data.referredTo || undefined,
          temperature: data.temperature
            ? parseFloat(data.temperature)
            : undefined,
          bloodPressure: data.bloodPressure || undefined,
          heartRate: data.heartRate ? parseInt(data.heartRate) : undefined,
          weight: data.weight ? parseFloat(data.weight) : undefined,
          height: data.height ? parseFloat(data.height) : undefined,
        },
      });
      toast.success("Rekam kesehatan berhasil diperbarui");
      router.push(`/health/${recordId}`);
    } catch {
      toast.error("Gagal memperbarui rekam kesehatan");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Rekam kesehatan tidak ditemukan</h2>
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
          <h1 className="text-3xl font-bold tracking-tight">
            Edit Rekam Kesehatan
          </h1>
          <p className="text-muted-foreground">
            Santri: {record.student?.name} ({record.student?.nisn || record.student?.nik || "-"})
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Record Details */}
            <Card>
              <CardHeader>
                <CardTitle>Detail Rekam</CardTitle>
                <CardDescription>Informasi kesehatan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="recordType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jenis Rekam</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih jenis" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {HEALTH_RECORD_TYPES.map((type) => (
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
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status Kesehatan</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {HEALTH_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
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
                  name="symptoms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Keluhan/Gejala</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Keluhan atau gejala yang dialami..."
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="diagnosis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diagnosis</FormLabel>
                      <FormControl>
                        <Input placeholder="Hasil diagnosis" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="treatment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tindakan/Perawatan</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tindakan atau perawatan yang dilakukan..."
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="medication"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Obat</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Obat yang diberikan..."
                          rows={2}
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
                    name="followUpDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Follow-Up</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription>
                          Tanggal untuk pemeriksaan ulang
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="referredTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dirujuk ke</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nama rumah sakit/klinik"
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
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catatan</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Catatan tambahan..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Vital Signs */}
            <Card>
              <CardHeader>
                <CardTitle>Tanda Vital</CardTitle>
                <CardDescription>Data tanda vital (opsional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="temperature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suhu Tubuh (°C)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="36.5"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bloodPressure"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tekanan Darah</FormLabel>
                        <FormControl>
                          <Input placeholder="120/80" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="heartRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Detak Jantung (bpm)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="80" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="weight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Berat Badan (kg)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="50"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="height"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tinggi Badan (cm)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="160"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              Batal
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Simpan Perubahan"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function EditHealthRecordPage(props: Parameters<typeof EditHealthRecordPageContent>[0]) {
  return (
    <MainLayout>
      <EditHealthRecordPageContent {...props} />
    </MainLayout>
  );
}
