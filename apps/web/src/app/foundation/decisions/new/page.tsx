"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createFoundationDecisionSchema,
  decisionTypesForOrgan,
  type FoundationOrganType,
  type CreateFoundationDecisionInput,
} from "@cipansor/shared";
import { MainLayout } from "@/components/layout";
import { useCreateFoundationDecision } from "@/hooks/use-foundation-decisions";
import { PageHeader } from "@/components/shared/page-header";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Skema create adalah milik bersama: validasi di edge (API) dan tipe di web
 * harus berasal dari SATU definisi. Sebelumnya halaman ini mendeklarasikan
 * ulang skema lokal dan melempar payload ke `never`, sehingga aturan validasi
 * dapat menyimpang dari kontrak — longgar di klien, ketat di peladen (atau
 * sebaliknya), tanpa ada yang menangkapnya.
 */
type FormValues = CreateFoundationDecisionInput;

export default function NewFoundationDecisionPage() {
  const router = useRouter();
  const create = useCreateFoundationDecision();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createFoundationDecisionSchema),
    defaultValues: {
      organType: "PEMBINA",
      kind: "CIRCULAR",
      subject: "",
      decisionType: "pengesahan-rencana-kerja",
      body: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    // Guard klien: matriks kewenangan yang SAMA dengan API. Server tetap
    // memeriksanya lagi (jangan pernah mempercayai UI), tetapi kombinasi yang
    // salah tidak boleh pernah dikirim dan baru ditolak setelah submit.
    if (!decisionTypesForOrgan(values.organType).includes(values.decisionType)) {
      setError(
        `Organ yang dipilih tidak berwenang memutus "${values.decisionType}". Pilih organ lain atau jenis keputusan yang sesuai.`,
      );
      return;
    }
    try {
      const res = await create.mutateAsync(values);
      const decisionId = res.data?.data?.decisionId;
      router.push(
        decisionId
          ? `/foundation/decisions/${decisionId}`
          : "/foundation/decisions",
      );
    } catch {
      setError("Gagal menyimpan keputusan. Periksa kembali isian Anda.");
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="Buat Keputusan Baru"
        description="Buka sirkuler/rapat organ; anggota akan diberi kesempatan memberi suara."
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            Batal
          </Button>
        }
      />
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Rincian Keputusan</CardTitle>
            <CardDescription>
              Setelah dibuka, perihal dan isi tidak dapat diubah — semua suara
              diikat ke isi ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Organ</Label>
                <Select
                  value={watch("organType")}
                  onValueChange={(v) => {
                    const organ = v as FoundationOrganType;
                    setValue("organType", organ);
                    // Jenis keputusan yang berlaku bisa berbeda antar-organ.
                    // Bila pilihan saat ini tidak lagi berwenang, ganti ke
                    // yang pertama sah supaya tidak ada kombinasi salah yang
                    // tertinggal di form.
                    const valid = decisionTypesForOrgan(organ);
                    const current = watch("decisionType");
                    if (!valid.includes(current)) {
                      setValue("decisionType", valid[0], {
                        shouldValidate: true,
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih organ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PEMBINA">Dewan Pembina</SelectItem>
                    <SelectItem value="PENGURUS">Pengurus Yayasan</SelectItem>
                    <SelectItem value="PENGAWAS">Dewan Pengawas</SelectItem>
                    <SelectItem value="GABUNGAN">Rapat Gabungan</SelectItem>
                  </SelectContent>
                </Select>
                {errors.organType && (
                  <p className="text-xs text-destructive">
                    {errors.organType.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Cara Keputusan</Label>
                <Select
                  value={watch("kind")}
                  onValueChange={(v) =>
                    setValue("kind", v as FormValues["kind"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cara" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CIRCULAR">
                      Sirkuler (mufakat / mayoritas)
                    </SelectItem>
                    <SelectItem value="MEETING">Rapat (mayoritas)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.kind && (
                  <p className="text-xs text-destructive">
                    {errors.kind.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Jenis Keputusan</Label>
              {/* Kosakata terkendali dari @cipansor/shared: jenis tak dikenal
                  dulu jatuh diam-diam ke kewenangan Pembina, sehingga satu
                  salah ketik memindahkan keputusan ke organ yang salah.
                  Daftar di sini disaring oleh matriks kewenangan yang SAMA
                  dengan API, jadi kombinasi organ×jenis yang salah tidak
                  pernah dapat dipilih. */}
              <Select
                value={watch("decisionType") || undefined}
                onValueChange={(v) =>
                  setValue("decisionType", v as FormValues["decisionType"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jenis keputusan" />
                </SelectTrigger>
                <SelectContent>
                  {decisionTypesForOrgan(watch("organType")).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.decisionType && (
                <p className="text-xs text-destructive">
                  {errors.decisionType.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Perihal</Label>
              <Input
                placeholder="mis. Pengesahan Rencana Kerja Yayasan 2026"
                {...register("subject")}
              />
              {errors.subject && (
                <p className="text-xs text-destructive">
                  {errors.subject.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Isi Keputusan / Notulen</Label>
              <Textarea
                rows={8}
                placeholder="Uraian keputusan yang akan menjadi risalah PDF…"
                {...register("body")}
              />
              {errors.body && (
                <p className="text-xs text-destructive">
                  {errors.body.message}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Menyimpan…" : "Buka Voting"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </MainLayout>
  );
}
