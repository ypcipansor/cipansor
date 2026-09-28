"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createSubjectSchema, type CreateSubjectInput } from "@cipansor/shared";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUBJECT_TYPES,
  SUBJECT_TYPE_LABELS,
  passingScoreOf,
  type Subject,
} from "@/hooks/use-curriculum";
import { useUnits } from "@/hooks/use-units";

/**
 * The fields the API stores, checked by the rules it applies
 * (`createSubjectSchema` in @cipansor/shared). The form used to ask for a
 * "Jam/Minggu" no column holds and for types the API refused.
 */
const formSchema = createSubjectSchema
  .omit({ credits: true, passingScore: true })
  .extend({
    credits: z.coerce
      .number()
      .int("JP harus bilangan bulat")
      .min(1, "Minimal 1 JP per minggu")
      .max(40, "Maksimal 40 JP per minggu"),
    passingScore: z.coerce
      .number()
      .min(0, "KKM minimal 0")
      .max(100, "KKM maksimal 100"),
  });
type FormValues = z.infer<typeof formSchema>;

export function SubjectForm({
  subject,
  defaultUnitId,
  lockUnit,
  submitting,
  onSubmit,
  cancelHref,
}: {
  /** The subject being edited; absent when adding one. */
  subject?: Subject;
  /** The unit a new subject starts in: the signed-in manager's own. */
  defaultUnitId?: string;
  /** Everyone but the super admin writes in their own unit only. */
  lockUnit: boolean;
  submitting: boolean;
  onSubmit: (data: CreateSubjectInput) => void;
  cancelHref: string;
}) {
  const { data: units, isLoading: unitsLoading } = useUnits();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      unitId: subject?.unitId ?? defaultUnitId ?? "",
      code: subject?.code ?? "",
      name: subject?.name ?? "",
      type: subject?.type ?? "ACADEMIC",
      credits: subject?.credits ?? 2,
      level: subject?.level ?? "",
      passingScore: subject ? passingScoreOf(subject) : 70,
      description: subject?.description ?? "",
      isActive: subject?.isActive ?? true,
    },
  });

  const submit = form.handleSubmit((data) =>
    onSubmit({
      ...data,
      level: data.level || undefined,
      description: data.description || undefined,
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="unitId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Unit</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={unitsLoading || lockUnit || !!subject}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih unit" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {units?.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Mata pelajaran milik satu unit dan tidak bisa dipindah.
                </FormDescription>
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
                  <Input placeholder="MTK" {...field} />
                </FormControl>
                <FormDescription>
                  Unik di unit ini, 2–10 karakter
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Mata Pelajaran</FormLabel>
                <FormControl>
                  <Input placeholder="Matematika" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jenis</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih jenis" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SUBJECT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {SUBJECT_TYPE_LABELS[type]}
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
            name="credits"
            render={({ field }) => (
              <FormItem>
                <FormLabel>JP per Minggu</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={40} {...field} />
                </FormControl>
                <FormDescription>Jam pelajaran per minggu</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kelas (Opsional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="7, 8, 9"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>Kelas yang mempelajarinya</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="passingScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>KKM</FormLabel>
                <FormControl>
                  <Input type="number" min={0} max={100} {...field} />
                </FormControl>
                <FormDescription>Nilai ketuntasan minimal</FormDescription>
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
                <Textarea rows={3} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Aktif</FormLabel>
                <FormDescription>
                  Mata pelajaran nonaktif tidak ditawarkan untuk jadwal dan
                  penilaian baru.
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

/** What a role outside CURRICULUM_MANAGER_ROLE_CODES sees on a write page. */
export function NotASubjectManager({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-muted-foreground">
        Hanya admin unit, kepala sekolah, dan wakasek yang bisa menambah atau
        mengubah mata pelajaran.
      </p>
      <Button asChild variant="outline">
        <Link href={backHref}>Kembali</Link>
      </Button>
    </div>
  );
}
