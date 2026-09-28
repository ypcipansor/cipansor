"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search } from "lucide-react";
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
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { PERMIT_TYPE_VALUES } from "@cipansor/shared";
import { useStudents } from "@/hooks/use-students";
import { PERMIT_TYPES, type PermitType } from "@/hooks/use-permits";

// The form's own shape: `datetime-local` strings, converted to ISO instants
// on submit. The API validates again with the shared createPermitSchema.
const formSchema = z
  .object({
    studentId: z.string().min(1, "Pilih dulu siapa yang diberi izin"),
    type: z.enum(PERMIT_TYPE_VALUES, { message: "Jenis izin wajib dipilih" }),
    reason: z.string().trim().min(10, "Alasan minimal 10 karakter"),
    startDate: z.string().min(1, "Waktu berangkat wajib diisi"),
    endDate: z.string().min(1, "Waktu kembali wajib diisi"),
    destination: z.string().optional(),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "Waktu kembali harus sesudah waktu berangkat",
    path: ["endDate"],
  });

export type PermitFormValues = z.infer<typeof formSchema>;

interface PickedStudent {
  id: string;
  name: string;
  nis: string;
}

export function PermitForm({
  defaultValues,
  student,
  lockStudent = false,
  cancelHref,
  submitLabel,
  isSubmitting,
  onSubmit,
}: {
  defaultValues?: Partial<PermitFormValues>;
  student?: PickedStudent | null;
  /** A permit's learner does not change once filed. */
  lockStudent?: boolean;
  cancelHref: string;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: PermitFormValues) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PickedStudent | null>(student ?? null);

  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    search: search || undefined,
    limit: 10,
  });

  const form = useForm<PermitFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      studentId: student?.id ?? "",
      reason: "",
      startDate: "",
      endDate: "",
      destination: "",
      ...defaultValues,
    },
  });

  const pick = (s: PickedStudent) => {
    setPicked(s);
    form.setValue("studentId", s.id, { shouldValidate: true });
    setSearch("");
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Yang diberi izin</CardTitle>
              <CardDescription>Cari nama atau NIS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {picked ? (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{picked.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {picked.nis}
                    </p>
                  </div>
                  {!lockStudent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPicked(null);
                        form.setValue("studentId", "");
                      }}
                    >
                      Ganti
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama atau NIS…"
                      aria-label="Cari nama atau NIS"
                      className="pl-10"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {search && (
                    <div className="max-h-[300px] overflow-auto rounded-md border">
                      {studentsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                      ) : studentsData?.data.length === 0 ? (
                        <div className="py-4 text-center text-muted-foreground">
                          Tidak ditemukan
                        </div>
                      ) : (
                        <Table>
                          <TableBody>
                            {studentsData?.data.map((s) => (
                              <TableRow
                                key={s.id}
                                className="cursor-pointer"
                                onClick={() =>
                                  pick({ id: s.id, name: s.name, nis: s.nis })
                                }
                              >
                                <TableCell>{s.nis}</TableCell>
                                <TableCell className="font-medium">
                                  {s.name}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </>
              )}
              {form.formState.errors.studentId && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.studentId.message}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detail izin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jenis izin</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v as PermitType)}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih jenis izin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PERMIT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Berangkat</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
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
                      <FormLabel>Kembali</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alasan</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Jelaskan alasan izin…"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tujuan (opsional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Alamat tujuan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4">
          <Button variant="outline" asChild>
            <Link href={cancelHref}>Batal</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Menyimpan…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
