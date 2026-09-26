"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  createDormitorySchema,
  type CreateDormitoryInput,
} from "@cipansor/shared";
import { zodResolver } from "@/lib/zod-resolver";
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
import { DORMITORY_TYPES, type Dormitory } from "@/hooks/use-dormitory";
import { useUnits } from "@/hooks/use-units";

/** Sentinel for "no single unit runs this asrama" — sent to the API as null. */
const FOUNDATION_RUN = "__yayasan__";

/**
 * The fields the API stores, checked by the same rules it applies
 * (`createDormitorySchema` in @cipansor/shared). The form used to offer a
 * pengasuh, facilities and an active switch that no column held — saved,
 * toasted as saved, and gone. Who looks after an asrama is on its Musyrif tab.
 */
const formSchema = createDormitorySchema
  .omit({ unitId: true, capacity: true })
  .extend({
    unitId: z.string(),
    capacity: z.coerce
      .number()
      .int("Kapasitas harus bilangan bulat")
      .min(1, "Kapasitas minimal 1"),
  });
type FormValues = z.infer<typeof formSchema>;

export function DormitoryForm({
  dormitory,
  submitting,
  onSubmit,
  cancelHref,
}: {
  /** The asrama being edited; absent when adding one. */
  dormitory?: Dormitory;
  submitting: boolean;
  onSubmit: (data: CreateDormitoryInput) => void;
  cancelHref: string;
}) {
  const { data: units, isLoading: unitsLoading } = useUnits();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: dormitory?.name ?? "",
      code: dormitory?.code ?? "",
      gender: dormitory?.type ?? "MALE",
      capacity: dormitory?.capacity ?? 50,
      unitId: dormitory?.unitId ?? FOUNDATION_RUN,
      address: dormitory?.address ?? "",
      description: dormitory?.description ?? "",
    },
  });

  const submit = form.handleSubmit((data) =>
    onSubmit({
      ...data,
      unitId: data.unitId === FOUNDATION_RUN ? null : data.unitId,
      address: data.address || undefined,
      description: data.description || undefined,
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Asrama</FormLabel>
                <FormControl>
                  <Input placeholder="Asrama Putra Al-Fatih" {...field} />
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
                  <Input placeholder="AP-01" {...field} />
                </FormControl>
                <FormDescription>Unik di seluruh yayasan</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jenis Asrama</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis" />
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
                <FormDescription>
                  Tidak bisa diubah selama masih ada penghuni
                </FormDescription>
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
                  Jumlah santri yang bisa ditampung
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="unitId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
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
                    {units?.map((unit) => (
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
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alamat / Lokasi (Opsional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Gedung B, kompleks putra"
                  {...field}
                  value={field.value ?? ""}
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
                  placeholder="Deskripsi singkat, termasuk fasilitasnya"
                  rows={3}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button variant="outline" asChild>
            <Link href={cancelHref}>Batal</Link>
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** What a role outside DORMITORY_MANAGER_ROLE_CODES sees on a write page. */
export function NotADormitoryManager({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-muted-foreground">
        Hanya pengelola asrama yang bisa menambah atau mengubah asrama.
      </p>
      <Button asChild variant="outline">
        <Link href={backHref}>Kembali</Link>
      </Button>
    </div>
  );
}
