"use client";

import { useState } from "react";
import {
  admissionFeeTotals,
  type PublicIntakeDTO,
  type PublicWaveWindow,
} from "@cipansor/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { spmbContentFor, type SpmbContent } from "@/config/spmb.i18n";
import { formatRupiah } from "@/lib/admission-intake";
import { dateFormatterFor } from "@/lib/locale-format";
import { dirFor, type Locale } from "@/locales";

/** A day, or a range of days, in the reader's locale on the WIB calendar. */
function daysIn(locale: Locale, start: string | null, end?: string | null) {
  if (!start) return "—";
  const format = dateFormatterFor(locale);
  const a = new Date(start);
  if (!end) return format.format(a);
  const b = new Date(end);
  if (format.format(a) === format.format(b)) return format.format(a);
  return format.formatRange(a, b);
}

const WINDOW_VARIANT: Record<
  PublicWaveWindow,
  "default" | "secondary" | "outline"
> = {
  open: "default",
  upcoming: "outline",
  closed: "secondary",
  full: "secondary",
};

function FeeTable({
  intake,
  copy,
}: {
  intake: PublicIntakeDTO;
  copy: SpmbContent;
}) {
  if (!intake.fees.length) {
    const fee = Number(intake.period.registrationFee);
    return (
      <p className="text-sm text-muted-foreground">
        {fee > 0 ? copy.registrationFee(formatRupiah(fee)) : copy.noFees}
      </p>
    );
  }
  const totalLabel = {
    ALL: copy.total,
    BOARDING: copy.totalBoarding,
    NON_BOARDING: copy.totalNonBoarding,
  };
  const residencyTag = {
    ALL: "",
    BOARDING: copy.boarding,
    NON_BOARDING: copy.nonBoarding,
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="public-fee-table">
        <caption className="mb-2 text-start text-muted-foreground">
          {copy.feesNote}
        </caption>
        <thead>
          <tr className="border-b text-start">
            <th className="py-2 pe-3 text-start font-medium">{copy.item}</th>
            <th className="py-2 px-3 text-end font-medium">{copy.male}</th>
            <th className="py-2 ps-3 text-end font-medium">{copy.female}</th>
          </tr>
        </thead>
        <tbody>
          {intake.fees.map((fee, i) => {
            const tags = [
              residencyTag[fee.residency],
              fee.isMonthly ? copy.perMonth : "",
            ].filter(Boolean);
            return (
              <tr key={i} className="border-b">
                <td className="py-2 pe-3">
                  <bdi>{fee.label}</bdi>
                  {tags.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({tags.join(", ")})
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-end tabular-nums" dir="ltr">
                  {formatRupiah(fee.maleAmount)}
                </td>
                <td className="py-2 ps-3 text-end tabular-nums" dir="ltr">
                  {formatRupiah(fee.femaleAmount)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {admissionFeeTotals(intake.fees).map((t) => (
            <tr key={t.residency} data-testid="public-fee-total">
              <th scope="row" className="py-2 pe-3 text-start font-semibold">
                {totalLabel[t.residency]}
                {t.monthlyMale || t.monthlyFemale ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    ({copy.firstMonthIncluded})
                  </span>
                ) : null}
              </th>
              <td
                className="py-2 px-3 text-end font-semibold tabular-nums"
                dir="ltr"
              >
                {formatRupiah(t.male)}
              </td>
              <td
                className="py-2 ps-3 text-end font-semibold tabular-nums"
                dir="ltr"
              >
                {formatRupiah(t.female)}
              </td>
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

function IntakeDetails({
  intake,
  locale,
  copy,
  onRegister,
}: {
  intake: PublicIntakeDTO;
  locale: Locale;
  copy: SpmbContent;
  onRegister?: (unitId: string) => void;
}) {
  const { unit, period } = intake;
  const hasDiscount = intake.waves.some(
    (w) => Number(w.fullPaymentDiscount) > 0,
  );
  return (
    <div className="space-y-6" data-testid="public-intake">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">
            <bdi>{unit.officialName ?? unit.name}</bdi>
          </h3>
          <p className="text-sm text-muted-foreground">
            {period.academicYear
              ? `${copy.academicYear(period.academicYear)} · `
              : ""}
            {copy.registrationWindow(
              daysIn(locale, period.startDate, period.endDate),
            )}
            {/* Before the first wave, or between two: the day it opens. */}
            {period.window === "upcoming" && period.opensAt
              ? ` · ${copy.opensOn(daysIn(locale, period.opensAt))}`
              : ""}
          </p>
        </div>
        <Badge variant={WINDOW_VARIANT[period.window]}>
          {copy.window[period.window]}
        </Badge>
      </div>

      {intake.waves.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">{copy.wavesHeading}</h4>
          {/* On a phone — where a parent opens the link — one card per wave:
              five columns of dates do not fit, and a sideways-scrolling
              table hides the test and re-registration days. */}
          <ol className="space-y-3 sm:hidden" data-testid="public-wave-list">
            {intake.waves.map((w) => {
              const rows: Array<[string, string]> = [
                [copy.registration, daysIn(locale, w.startDate, w.endDate)],
                ...(w.testStartDate
                  ? [
                      [
                        copy.test,
                        daysIn(locale, w.testStartDate, w.testEndDate),
                      ] as [string, string],
                    ]
                  : []),
                ...(w.resultsStartDate
                  ? [
                      [
                        copy.results,
                        daysIn(locale, w.resultsStartDate, w.resultsEndDate),
                      ] as [string, string],
                    ]
                  : []),
                ...(w.reRegistrationStartDate
                  ? [
                      [
                        copy.reRegistration,
                        daysIn(
                          locale,
                          w.reRegistrationStartDate,
                          w.reRegistrationEndDate,
                        ),
                      ] as [string, string],
                    ]
                  : []),
              ];
              return (
                <li key={w.waveNumber} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      <bdi>{w.name}</bdi>
                    </span>
                    <Badge variant={WINDOW_VARIANT[w.window]}>
                      {copy.window[w.window]}
                    </Badge>
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {rows.map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                    {Number(w.fullPaymentDiscount) > 0 && (
                      <div className="contents">
                        <dt className="text-muted-foreground">
                          {copy.discount}
                        </dt>
                        <dd className="tabular-nums" dir="ltr">
                          {formatRupiah(w.fullPaymentDiscount)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ol>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm" data-testid="public-wave-table">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pe-3 text-start font-medium">
                    {copy.wave}
                  </th>
                  <th className="py-2 px-3 text-start font-medium">
                    {copy.registration}
                  </th>
                  <th className="py-2 px-3 text-start font-medium">
                    {copy.test}
                  </th>
                  <th className="py-2 px-3 text-start font-medium">
                    {copy.results}
                  </th>
                  <th className="py-2 px-3 text-start font-medium">
                    {copy.reRegistration}
                  </th>
                  {hasDiscount && (
                    <th className="py-2 ps-3 text-end font-medium">
                      {copy.discount}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {intake.waves.map((w) => (
                  <tr key={w.waveNumber} className="border-b align-top">
                    <td className="py-2 pe-3">
                      <div className="whitespace-nowrap font-medium">
                        <bdi>{w.name}</bdi>
                      </div>
                      <Badge
                        variant={WINDOW_VARIANT[w.window]}
                        className="mt-1"
                      >
                        {copy.window[w.window]}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      {daysIn(locale, w.startDate, w.endDate)}
                    </td>
                    <td className="py-2 px-3">
                      {daysIn(locale, w.testStartDate, w.testEndDate)}
                    </td>
                    <td className="py-2 px-3">
                      {daysIn(locale, w.resultsStartDate, w.resultsEndDate)}
                    </td>
                    <td className="py-2 px-3">
                      {daysIn(
                        locale,
                        w.reRegistrationStartDate,
                        w.reRegistrationEndDate,
                      )}
                    </td>
                    {hasDiscount && (
                      <td className="py-2 ps-3 text-end tabular-nums" dir="ltr">
                        {formatRupiah(w.fullPaymentDiscount) || "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasDiscount && (
            <p className="text-xs text-muted-foreground">{copy.discountNote}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="font-medium">{copy.feesHeading}</h4>
        <FeeTable intake={intake} copy={copy} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <h4 className="font-medium">{copy.requirementsHeading}</h4>
          {period.requirements.length ? (
            <ol className="list-decimal space-y-1 ps-5 text-sm">
              {period.requirements.map((r, i) => (
                <li key={i}>
                  <bdi>{r}</bdi>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              {copy.noRequirements}
            </p>
          )}
          {period.minAgeMonths !== null && (
            <p className="text-sm" data-testid="public-min-age">
              {copy.minAge(
                Math.floor(period.minAgeMonths / 12),
                period.minAgeMonths % 12,
              )}
              {period.ageReferenceDate
                ? copy.onDate(daysIn(locale, period.ageReferenceDate))
                : ""}
              .
            </p>
          )}
        </div>
        {(period.contactName || period.contactPhone) && (
          <div className="space-y-2">
            <h4 className="font-medium">{copy.contactHeading}</h4>
            <p className="text-sm">
              {period.contactName && <bdi>{period.contactName}</bdi>}
              {period.contactPhone && (
                <>
                  {period.contactName ? " · " : ""}
                  <a
                    href={`tel:${period.contactPhone.replace(/[^\d+]/g, "")}`}
                    className="font-medium text-primary underline underline-offset-4"
                    dir="ltr"
                  >
                    {period.contactPhone}
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {onRegister && period.window === "open" && (
        <Button
          onClick={() => onRegister(unit.id)}
          data-testid="public-intake-register"
        >
          {copy.register}
        </Button>
      )}
    </div>
  );
}

/**
 * Each unit's intake on the public SPMB page, one tab per unit, as the
 * brochure prints it: the wave schedule, the fee table with its totals, the
 * requirements and the contact. The first unit open now is shown first.
 */
export function PublicIntakes({
  locale,
  intakes,
  onRegister,
}: {
  locale: Locale;
  intakes: PublicIntakeDTO[];
  onRegister?: (unitId: string) => void;
}) {
  const copy = spmbContentFor(locale);
  // Radix Tabs sets `dir="ltr"` unless told otherwise, and the form's own
  // tabs wrap this section — so Arabic would read left to right here.
  const dir = dirFor(locale);
  const firstOpen =
    intakes.find((i) => i.period.window === "open") ?? intakes[0];
  const [unit, setUnit] = useState(firstOpen?.unit.id ?? "");

  return (
    <section
      aria-labelledby="spmb-intakes-heading"
      className="space-y-4"
      data-testid="public-intakes"
      dir={dir}
    >
      <div>
        <h2 id="spmb-intakes-heading" className="text-2xl font-bold">
          {copy.heading}
        </h2>
        <p className="mt-1 text-muted-foreground">{copy.intro}</p>
      </div>
      {intakes.length === 0 ? (
        <p className="text-muted-foreground">{copy.noIntakes}</p>
      ) : (
        <Tabs
          value={unit || firstOpen?.unit.id}
          onValueChange={setUnit}
          dir={dir}
        >
          <TabsList className="flex h-auto flex-wrap justify-start">
            {intakes.map((i) => (
              <TabsTrigger key={i.unit.id} value={i.unit.id}>
                {i.unit.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {intakes.map((i) => (
            <TabsContent
              key={i.unit.id}
              value={i.unit.id}
              className="rounded-lg border bg-white p-4 sm:p-6"
            >
              <IntakeDetails
                intake={i}
                locale={locale}
                copy={copy}
                onRegister={onRegister}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
