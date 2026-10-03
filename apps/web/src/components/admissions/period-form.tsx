"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  admissionPeriodFields,
  type AdmissionPeriodDTO,
  type CreateAdmissionPeriodInput,
} from "@cipansor/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calendarDay, requirementLines, wibDay } from "@/lib/admission-intake";

const optional = <T extends z.ZodTypeAny>(field: T) => field.or(z.literal(""));
const wholeNumber = (message: string) => z.string().regex(/^\d*$/, message);

const formSchema = z
  .object({
    unitId: z.string().min(1, "Unit wajib dipilih"),
    academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
    name: admissionPeriodFields.name,
    startDate: admissionPeriodFields.startDate,
    endDate: admissionPeriodFields.endDate,
    quota: wholeNumber("Kuota harus bilangan bulat"),
    registrationFee: wholeNumber("Biaya harus angka rupiah tanpa titik"),
    isActive: z.boolean(),
    requirements: z.string().max(9000),
    minAgeYears: wholeNumber("Usia harus bilangan bulat"),
    minAgeExtraMonths: wholeNumber("Bulan harus bilangan bulat"),
    ageReferenceDate: optional(admissionPeriodFields.startDate),
    contactName: z
      .string()
      .trim()
      .max(100, "Nama kontak maksimal 100 karakter"),
    contactPhone: optional(admissionPeriodFields.contactPhone.unwrap()),
  })
  .refine((v) => !v.endDate || !v.startDate || v.endDate >= v.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
    path: ["endDate"],
  })
  .refine((v) => Number(v.minAgeExtraMonths || 0) < 12, {
    message: "Bulan 0–11",
    path: ["minAgeExtraMonths"],
  });

export type PeriodFormValues = z.infer<typeof formSchema>;

/** What the API takes to create a period: empty text is "not given". */
export function periodPayload(
  values: PeriodFormValues,
): CreateAdmissionPeriodInput {
  return {
    unitId: values.unitId,
    academicYearId: values.academicYearId,
    ...periodChange(values),
  };
}

/** What the API takes to edit one: a period's unit and year do not move. */
export function periodChange(
  values: PeriodFormValues,
): Omit<CreateAdmissionPeriodInput, "unitId" | "academicYearId"> {
  const hasAge = values.minAgeYears !== "" || values.minAgeExtraMonths !== "";
  return {
    name: values.name,
    startDate: values.startDate,
    endDate: values.endDate,
    quota: Number(values.quota || 0),
    registrationFee: Number(values.registrationFee || 0),
    isActive: values.isActive,
    requirements: requirementLines(values.requirements),
    minAgeMonths: hasAge
      ? Number(values.minAgeYears || 0) * 12 +
        Number(values.minAgeExtraMonths || 0)
      : null,
    ageReferenceDate: values.ageReferenceDate || null,
    contactName: values.contactName || null,
    contactPhone: values.contactPhone || null,
  };
}

export function periodFormValues(
  period?: AdmissionPeriodDTO,
): PeriodFormValues {
  const months = period?.minAgeMonths ?? null;
  return {
    unitId: period?.unitId ?? "",
    academicYearId: period?.academicYearId ?? "",
    name: period?.name ?? "",
    startDate: wibDay(period?.startDate),
    endDate: wibDay(period?.endDate),
    quota: String(period?.quota ?? 0),
    registrationFee: String(Number(period?.registrationFee ?? 0)),
    isActive: period?.isActive ?? true,
    requirements: (period?.requirements ?? []).join("\n"),
    minAgeYears: months === null ? "" : String(Math.floor(months / 12)),
    minAgeExtraMonths: months === null ? "" : String(months % 12),
    ageReferenceDate: calendarDay(period?.ageReferenceDate),
    contactName: period?.contactName ?? "",
    contactPhone: period?.contactPhone ?? "",
  };
}

interface Option {
  id: string;
  name: string;
}

/**
 * The add and edit forms of a unit's SPMB intake for one year. What the
 * brochure prints per unit is asked for here: the registration window, the
 * requirements, the minimum age and the contact person. The waves are added
 * on the period's page.
 */
export function PeriodForm({
  defaultValues,
  units,
  academicYears,
  isEdit,
  isPending,
  cancelHref,
  onSubmit,
}: {
  defaultValues: PeriodFormValues;
  units: Option[];
  academicYears: Option[];
  isEdit: boolean;
  isPending: boolean;
  cancelHref: string;
  onSubmit: (values: PeriodFormValues) => void;
}) {
  const form = useForm<PeriodFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        data-testid="period-form"
      >
        <Card>
          <CardHeader>
            <CardTitle>Periode penerimaan</CardTitle>
            <CardDescription>
              Satu periode untuk satu unit dan satu tahun ajaran, dari hari
              pertama gelombang pertama sampai hari terakhir gelombang terakhir.
              Pendaftaran ditutup pukul 24.00 WIB pada tanggal selesai.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="period-unit">
                        <SelectValue placeholder="Pilih unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
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
              name="academicYearId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tahun ajaran</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="period-year">
                        <SelectValue placeholder="Pilih tahun ajaran" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {academicYears.map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name}
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
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Nama</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="SPMB 2027/2028 SMP IT"
                      data-testid="period-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pendaftaran dibuka</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="period-start" {...field} />
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
                  <FormLabel>Pendaftaran ditutup</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="period-end" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quota"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kuota</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" {...field} />
                  </FormControl>
                  <FormDescription>0 bila tidak dibatasi.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="registrationFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biaya pendaftaran (Rp)</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" {...field} />
                  </FormControl>
                  <FormDescription>
                    Yang dibayar saat mendaftar, tanpa titik.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 sm:col-span-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    Aktif (diumumkan di situs publik pada tanggalnya)
                  </FormLabel>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Persyaratan dan usia</CardTitle>
            <CardDescription>
              Seperti yang tercetak di brosur unit ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="requirements"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Persyaratan</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder={
                        "Fotokopi Akta Kelahiran\nFotokopi Kartu Keluarga"
                      }
                      data-testid="period-requirements"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Satu persyaratan per baris.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="minAgeYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usia minimal (tahun)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        data-testid="period-min-age"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minAgeExtraMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>dan bulan</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="ageReferenceDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usia dihitung pada tanggal</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>
                    Kosongkan bila dihitung pada hari mendaftar.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Narahubung</CardTitle>
            <CardDescription>
              Ditampilkan di halaman pendaftaran untuk unit ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="contactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama</FormLabel>
                  <FormControl>
                    <Input data-testid="period-contact-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor telepon/WhatsApp</FormLabel>
                  <FormControl>
                    <Input inputMode="tel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href={cancelHref}>Batal</Link>
          </Button>
          <Button type="submit" disabled={isPending} data-testid="period-save">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </div>
      </form>
    </Form>
  );
}
