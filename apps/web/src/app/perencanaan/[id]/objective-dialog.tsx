"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import * as z from "zod";
import { useCreateObjective } from "@/hooks/use-perencanaan";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Penyusunan Sasaran Strategis.
 *
 * Sebelum ini tombol "+ Tambah Sasaran" adalah tombol mati — tanpa penangan
 * klik, tanpa dialog, tanpa hook — meskipun rute POST /perencanaan/objectives
 * sudah ada. Akibatnya Sasaran, yang berada satu tingkat DI ATAS Kegiatan
 * dalam kaskade RPJP → Renstra → RKA, hanya bisa lahir dari seed.
 */
const schema = z.object({
  title: z.string().min(3, "Judul sasaran minimal 3 karakter"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  perspective: z.enum(["FINANCIAL", "CUSTOMER", "PROCESS", "LEARNING"]),
  weight: z.coerce.number().min(0).max(100),
});

type FormValues = z.infer<typeof schema>;

const PERSPEKTIF: Array<{ value: FormValues["perspective"]; label: string }> = [
  { value: "LEARNING", label: "Pembelajaran & Pertumbuhan" },
  { value: "PROCESS", label: "Proses Internal" },
  { value: "CUSTOMER", label: "Pemangku Kepentingan" },
  { value: "FINANCIAL", label: "Keuangan" },
];

const PRIORITAS: Array<{ value: FormValues["priority"]; label: string }> = [
  { value: "CRITICAL", label: "Sangat Penting" },
  { value: "HIGH", label: "Tinggi" },
  { value: "MEDIUM", label: "Sedang" },
  { value: "LOW", label: "Rendah" },
];

export function ObjectiveDialog({
  open,
  onOpenChange,
  planId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
}) {
  const createObjective = useCreateObjective();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      priority: "HIGH",
      perspective: "PROCESS",
      weight: 0,
    },
  });

  const onSubmit = async (values: FormValues) => {
    await createObjective.mutateAsync({ planId, ...values });
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Tambah Sasaran Strategis</DialogTitle>
          <DialogDescription>
            Sasaran adalah tingkat di atas Kegiatan. Setiap Kegiatan nantinya
            digantungkan pada salah satu sasaran ini.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Judul Sasaran</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="cth: SS1 — Meningkatnya mutu & akses pendidikan formal"
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
                      placeholder="Uraian singkat sasaran…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="perspective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perspektif</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PERSPEKTIF.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Menentukan letaknya pada Peta Strategi.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioritas</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITAS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
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
              name="weight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bobot (%)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step={1} {...field} />
                  </FormControl>
                  <FormDescription>
                    Porsi sasaran ini terhadap keseluruhan dokumen.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={createObjective.isPending}>
                {createObjective.isPending ? "Menyimpan…" : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
