"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  WAVE_STATUSES,
  admissionWaveDateIssues,
  admissionWaveFields,
  type AdmissionWaveDTO,
  type WaveStatusCode,
} from "@cipansor/shared";
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
import { calendarDay, wibDay } from "@/lib/admission-intake";

export const WAVE_STATUS_LABELS: Record<WaveStatusCode, string> = {
  UPCOMING: "Belum dibuka",
  OPEN: "Dibuka",
  CLOSED: "Ditutup",
  FULL: "Kuota penuh",
};

const day = admissionWaveFields.startDate.or(z.literal(""));
const wholeNumber = (message: string) => z.string().regex(/^\d*$/, message);

const SESSION_DAYS = [
  "testStartDate",
  "testEndDate",
  "resultsStartDate",
  "resultsEndDate",
  "reRegistrationStartDate",
  "reRegistrationEndDate",
] as const;

const formSchema = z
  .object({
    name: admissionWaveFields.name,
    waveNumber: z.string().regex(/^[1-9]\d?$/, "Nomor gelombang 1–20"),
    startDate: admissionWaveFields.startDate,
    endDate: admissionWaveFields.endDate,
    quota: z.string().regex(/^[1-9]\d*$/, "Kuota minimal 1"),
    status: z.enum(WAVE_STATUSES),
    testStartDate: day,
    testEndDate: day,
    resultsStartDate: day,
    resultsEndDate: day,
    reRegistrationStartDate: day,
    reRegistrationEndDate: day,
    fullPaymentDiscount: wholeNumber("Potongan harus angka rupiah tanpa titik"),
    notes: z.string().max(1000, "Catatan maksimal 1000 karakter"),
  })
  .superRefine((values, ctx) => {
    // The same rules the API keeps, so the admin sees them beside the field.
    for (const issue of admissionWaveDateIssues(values)) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: [issue.path],
      });
    }
  });

export type WaveFormValues = z.infer<typeof formSchema>;

/** What the API takes: an empty day or amount is "none". */
export function wavePayload(values: WaveFormValues) {
  return {
    name: values.name,
    waveNumber: Number(values.waveNumber),
    startDate: values.startDate,
    endDate: values.endDate,
    quota: Number(values.quota),
    status: values.status,
    ...Object.fromEntries(SESSION_DAYS.map((f) => [f, values[f] || null])),
    fullPaymentDiscount:
      values.fullPaymentDiscount === ""
        ? null
        : Number(values.fullPaymentDiscount),
    notes: values.notes.trim() || null,
  } as {
    name: string;
    waveNumber: number;
    startDate: string;
    endDate: string;
    quota: number;
    status: WaveStatusCode;
    fullPaymentDiscount: number | null;
    notes: string | null;
  } & Record<(typeof SESSION_DAYS)[number], string | null>;
}

export function waveFormValues(
  wave: AdmissionWaveDTO | undefined,
  nextNumber: number,
): WaveFormValues {
  return {
    name: wave?.name ?? `Gelombang ${nextNumber}`,
    waveNumber: String(wave?.waveNumber ?? nextNumber),
    startDate: wibDay(wave?.startDate),
    endDate: wibDay(wave?.endDate),
    quota: String(wave?.quota ?? ""),
    status: wave?.status ?? "UPCOMING",
    testStartDate: calendarDay(wave?.testStartDate),
    testEndDate: calendarDay(wave?.testEndDate),
    resultsStartDate: calendarDay(wave?.resultsStartDate),
    resultsEndDate: calendarDay(wave?.resultsEndDate),
    reRegistrationStartDate: calendarDay(wave?.reRegistrationStartDate),
    reRegistrationEndDate: calendarDay(wave?.reRegistrationEndDate),
    fullPaymentDiscount:
      wave?.fullPaymentDiscount === null ||
      wave?.fullPaymentDiscount === undefined
        ? ""
        : String(Number(wave.fullPaymentDiscount)),
    notes: wave?.notes ?? "",
  };
}

const SESSIONS: Array<{
  label: string;
  start: (typeof SESSION_DAYS)[number];
  end: (typeof SESSION_DAYS)[number];
}> = [
  { label: "Tes", start: "testStartDate", end: "testEndDate" },
  {
    label: "Pengumuman kelulusan",
    start: "resultsStartDate",
    end: "resultsEndDate",
  },
  {
    label: "Daftar ulang",
    start: "reRegistrationStartDate",
    end: "reRegistrationEndDate",
  },
];

/**
 * A wave of an intake: its registration window and quota, the sessions that
 * follow it, and the discount for paying in full, as the brochure prints them.
 */
export function WaveForm({
  defaultValues,
  isPending,
  onCancel,
  onSubmit,
}: {
  defaultValues: WaveFormValues;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: WaveFormValues) => void;
}) {
  const form = useForm<WaveFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const dayField = (
    name: (typeof SESSION_DAYS)[number] | "startDate" | "endDate",
    label: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="date" data-testid={`wave-${name}`} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        data-testid="wave-form"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nama</FormLabel>
                <FormControl>
                  <Input data-testid="wave-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="waveNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ke-</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Pendaftaran</legend>
          {dayField("startDate", "Dibuka")}
          {dayField("endDate", "Ditutup")}
          <FormField
            control={form.control}
            name="quota"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kuota</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    data-testid="wave-quota"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {WAVE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {WAVE_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Diperbarui otomatis menurut tanggal.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {SESSIONS.map((s) => (
          <fieldset key={s.start} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">
              {s.label}{" "}
              <span className="font-normal text-muted-foreground">
                (kosongkan tanggal selesai bila satu hari)
              </span>
            </legend>
            {dayField(s.start, "Mulai")}
            {dayField(s.end, "Selesai")}
          </fieldset>
        ))}

        <FormField
          control={form.control}
          name="fullPaymentDiscount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Potongan bila dibayar lunas (Rp)</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  data-testid="wave-discount"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Kosongkan bila gelombang ini, atau unit ini, tanpa potongan.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Catatan</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit" disabled={isPending} data-testid="wave-save">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </div>
      </form>
    </Form>
  );
}
