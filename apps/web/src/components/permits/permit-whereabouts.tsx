"use client";

import { PERMIT_OFF_CAMPUS_TYPES, type PermitType } from "@cipansor/shared";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  localInputToIso,
  usePermitDecider,
  whoDecides,
} from "@/hooks/use-permits";

/**
 * Where a santri mukim will be during the leave, and who will decide it —
 * shown on the form before it is sent (decisions/pemutus-izin-santri.md).
 *
 * A santri mukim off the pondok overnight, or going home, is the koordinator
 * asrama's to decide; a few hours out, or sick in the UKS, the kamar's
 * musyrif. PULANG, KELUAR and KELUARGA are off the pondok by what they are;
 * for SAKIT and OTHER the form asks. Day pupils are not asked.
 */

/** The form asks where the santri will be: a boarder, on leave that could be either. */
export const asksWhereabouts = (
  type: PermitType | undefined,
  boarder: boolean | undefined,
) => !!boarder && !!type && !PERMIT_OFF_CAMPUS_TYPES.includes(type);

export const WHEREABOUTS_MISSING = "Pilih di mana santri berada selama izin";

interface FormFacts {
  studentId?: string;
  type?: PermitType;
  /** `datetime-local` values. */
  startDate?: string;
  endDate?: string;
  offCampus?: boolean;
}

/** Who would decide the permit on the form, once its learner, type and dates are there. */
export function usePermitDeciderFor(f: FormFacts) {
  const ready =
    !!f.studentId &&
    !!f.type &&
    !!f.startDate &&
    !!f.endDate &&
    new Date(f.endDate) > new Date(f.startDate);
  return usePermitDecider(
    ready
      ? {
          studentId: f.studentId!,
          type: f.type!,
          startDate: localInputToIso(f.startDate!),
          endDate: localInputToIso(f.endDate!),
          ...(f.offCampus !== undefined && {
            offCampus: f.offCampus ? "true" : "false",
          }),
        }
      : null,
  );
}

/** On the pondok (UKS, asrama) or off it (home, clinic, hospital). */
export function WhereaboutsField({
  id = "whereabouts",
  value,
  onChange,
  error,
}: {
  id?: string;
  value: boolean | undefined;
  onChange: (offCampus: boolean) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label id={`${id}-label`}>Selama izin, santri berada di</Label>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        // No choice until one is made: "" matches neither item.
        value={value === undefined ? "" : value ? "out" : "in"}
        onValueChange={(v) => onChange(v === "out")}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="in" id={`${id}-in`} />
          <Label htmlFor={`${id}-in`} className="font-normal">
            Pondok — UKS atau asrama
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="out" id={`${id}-out`} />
          <Label htmlFor={`${id}-out`} className="font-normal">
            Luar pondok — rumah, klinik, atau rumah sakit
          </Label>
        </div>
      </RadioGroup>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Akan diputuskan oleh …", from the API's own rule. */
export function DeciderHint({
  preview,
}: {
  preview: ReturnType<typeof usePermitDeciderFor>["data"];
}) {
  if (!preview) return null;
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      Akan diputuskan oleh{" "}
      <span className="font-medium text-foreground">
        {whoDecides(preview.decision)}
      </span>
    </p>
  );
}
