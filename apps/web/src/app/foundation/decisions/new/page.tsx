"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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

const schema = z.object({
  organType: z.string().min(1, "Organ wajib"),
  kind: z.string().min(1, "Cara keputusan wajib"),
  subject: z.string().min(3, "Perihal minimal 3 karakter").max(255),
  decisionType: z.string().min(2, "Jenis keputusan wajib").max(100),
  body: z.string().min(10, "Isi keputusan minimal 10 karakter"),
});
type FormValues = z.infer<typeof schema>;

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
    resolver: zodResolver(schema),
    defaultValues: {
      organType: "",
      kind: "",
      subject: "",
      decisionType: "",
      body: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const res = await create.mutateAsync(values as never);
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
                  onValueChange={(v) => setValue("organType", v)}
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
                  onValueChange={(v) => setValue("kind", v)}
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
              <Input
                placeholder="mis. pengesahan-rencana-kerja"
                {...register("decisionType")}
              />
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
