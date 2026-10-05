"use client";

import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  FEE_RESIDENCIES,
  FEE_RESIDENCY_LABELS,
  admissionFeeItemSchema,
  admissionFeeTotals,
  type AdmissionFeeItemDTO,
  type AdmissionFeeItemInput,
  type AdmissionFeeTotal,
} from "@cipansor/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/admission-intake";

const TOTAL_LABELS: Record<AdmissionFeeTotal["residency"], string> = {
  ALL: "Jumlah",
  BOARDING: "Jumlah mukim",
  NON_BOARDING: "Jumlah tidak mukim",
};

/** "SPP Bulanan" for both, "… (mukim)" for one residency, "per bulan" for a monthly fee. */
function lineNote(item: Pick<AdmissionFeeItemDTO, "residency" | "isMonthly">) {
  const notes = [
    item.residency === "ALL"
      ? ""
      : FEE_RESIDENCY_LABELS[item.residency].toLowerCase(),
    item.isMonthly ? "per bulan" : "",
  ].filter(Boolean);
  return notes.length ? ` (${notes.join(", ")})` : "";
}

/**
 * An intake's fee table as the brochure prints it: the lines, then a "Jumlah"
 * row for each residency the unit offers, each with the first month of the
 * monthly fees included.
 */
export function FeeTableView({ items }: { items: AdmissionFeeItemDTO[] }) {
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Rincian biaya belum diisi.
      </p>
    );
  }
  const totals = admissionFeeTotals(items);
  return (
    <div className="overflow-x-auto">
      <Table data-testid="fee-table">
        <TableHeader>
          <TableRow>
            <TableHead>Uraian</TableHead>
            <TableHead className="text-right">Ikhwan</TableHead>
            <TableHead className="text-right">Akhwat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-normal">
                {item.label}
                <span className="text-muted-foreground">{lineNote(item)}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRupiah(item.maleAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRupiah(item.femaleAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          {totals.map((t) => (
            <TableRow key={t.residency} data-testid="fee-total">
              <TableCell className="whitespace-normal font-medium">
                {TOTAL_LABELS[t.residency]}
                {t.monthlyMale || t.monthlyFemale ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    (termasuk biaya bulanan pertama)
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatRupiah(t.male)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatRupiah(t.female)}
              </TableCell>
            </TableRow>
          ))}
        </TableFooter>
      </Table>
    </div>
  );
}

const amount = z.string().regex(/^\d+$/, "Angka rupiah tanpa titik");

const formSchema = z.object({
  items: z
    .array(
      z.object({
        label: admissionFeeItemSchema.shape.label,
        maleAmount: amount,
        femaleAmount: amount,
        residency: admissionFeeItemSchema.shape.residency,
        isMonthly: z.boolean(),
      }),
    )
    .max(40, "Maksimal 40 baris"),
});

export type FeeTableFormValues = z.infer<typeof formSchema>;

export function feeTableFormValues(
  items: AdmissionFeeItemDTO[],
): FeeTableFormValues {
  return {
    items: items.map((i) => ({
      label: i.label,
      maleAmount: String(Number(i.maleAmount)),
      femaleAmount: String(Number(i.femaleAmount)),
      residency: i.residency,
      isMonthly: i.isMonthly,
    })),
  };
}

export function feeTablePayload(values: FeeTableFormValues): {
  items: AdmissionFeeItemInput[];
} {
  return {
    items: values.items.map((i) => ({
      label: i.label,
      maleAmount: Number(i.maleAmount),
      femaleAmount: Number(i.femaleAmount),
      residency: i.residency,
      isMonthly: i.isMonthly,
    })),
  };
}

const EMPTY_LINE: FeeTableFormValues["items"][number] = {
  label: "",
  maleAmount: "0",
  femaleAmount: "0",
  residency: "ALL",
  isMonthly: false,
};

/**
 * Edit an intake's fee table line by line, the totals following as you type.
 * An amount the same for ikhwan and akhwat is typed twice, as the brochure
 * prints it twice.
 */
export function FeeTableForm({
  defaultValues,
  isPending,
  onCancel,
  onSubmit,
}: {
  defaultValues: FeeTableFormValues;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: FeeTableFormValues) => void;
}) {
  const form = useForm<FeeTableFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const watched = useWatch({ control: form.control, name: "items" }) ?? [];
  const totals = admissionFeeTotals(
    watched.map((i) => ({
      maleAmount: Number(i?.maleAmount) || 0,
      femaleAmount: Number(i?.femaleAmount) || 0,
      residency: i?.residency ?? "ALL",
      isMonthly: !!i?.isMonthly,
    })),
  );
  const errors = form.formState.errors.items;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      data-testid="fee-form"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Uraian</TableHead>
              <TableHead className="w-36">Ikhwan (Rp)</TableHead>
              <TableHead className="w-36">Akhwat (Rp)</TableHead>
              <TableHead className="w-44">Berlaku untuk</TableHead>
              <TableHead>Bulanan</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id} data-testid="fee-line">
                <TableCell className="align-top">
                  <Input
                    aria-label={`Uraian baris ${index + 1}`}
                    {...form.register(`items.${index}.label`)}
                  />
                  {errors?.[index]?.label && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors[index]?.label?.message}
                    </p>
                  )}
                </TableCell>
                {(["maleAmount", "femaleAmount"] as const).map((key) => (
                  <TableCell key={key} className="align-top">
                    <Input
                      inputMode="numeric"
                      className="text-right tabular-nums"
                      aria-label={`${key === "maleAmount" ? "Ikhwan" : "Akhwat"} baris ${index + 1}`}
                      {...form.register(`items.${index}.${key}`)}
                    />
                    {errors?.[index]?.[key] && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors[index]?.[key]?.message}
                      </p>
                    )}
                  </TableCell>
                ))}
                <TableCell className="align-top">
                  <Select
                    value={watched[index]?.residency ?? "ALL"}
                    onValueChange={(v) =>
                      form.setValue(
                        `items.${index}.residency`,
                        v as (typeof FEE_RESIDENCIES)[number],
                        { shouldDirty: true },
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label={`Berlaku untuk baris ${index + 1}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FEE_RESIDENCIES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {FEE_RESIDENCY_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="align-top">
                  <Checkbox
                    className="mt-2.5"
                    aria-label={`Bulanan baris ${index + 1}`}
                    checked={!!watched[index]?.isMonthly}
                    onCheckedChange={(v) =>
                      form.setValue(`items.${index}.isMonthly`, v === true, {
                        shouldDirty: true,
                      })
                    }
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Naikkan baris ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Turunkan baris ${index + 1}`}
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus baris ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            {totals.map((t) => (
              <TableRow key={t.residency}>
                <TableCell className="font-medium">
                  {TOTAL_LABELS[t.residency]}
                </TableCell>
                <TableCell
                  className="text-right font-medium tabular-nums"
                  data-testid={`fee-form-total-${t.residency}-male`}
                >
                  {formatRupiah(t.male)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRupiah(t.female)}
                </TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            ))}
          </TableFooter>
        </Table>
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ ...EMPTY_LINE })}
          data-testid="fee-add-line"
        >
          <Plus className="mr-2 h-4 w-4" /> Tambah baris
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit" disabled={isPending} data-testid="fee-save">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan rincian biaya
          </Button>
        </div>
      </div>
    </form>
  );
}
