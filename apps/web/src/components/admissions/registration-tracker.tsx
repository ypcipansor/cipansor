"use client";

import React, { useState } from "react";
import { useTrackRegistrant } from "@/hooks/use-admissions";
import { spmbFormContentFor } from "@/config/spmb-form.i18n";
import { dateFormatterFor, formatNumber } from "@/lib/locale-format";
import type { Locale } from "@/locales";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Search,
  CheckCircle2,
  Clock,
  FileText,
  User,
  GraduationCap,
} from "lucide-react";
const STEPS = [
  { key: "REGISTERED", icon: User },
  { key: "DOCUMENT_CHECK", icon: FileText },
  { key: "TEST_COMPLETED", icon: GraduationCap },
  { key: "ACCEPTED", icon: CheckCircle2 },
] as const;

// Map every backend status onto the closest completed step above so the
// stepper renders sensibly for intermediate statuses too.
const STATUS_STEP_INDEX: Record<string, number> = {
  REGISTERED: 0,
  DOCUMENT_CHECK: 1,
  TEST_SCHEDULED: 1,
  TEST_COMPLETED: 2,
  ACCEPTED: 3,
  ENROLLED: 3,
  REJECTED: 2,
  CANCELLED: 0,
};

/**
 * Registration lookup: form, error state, and result stepper.
 *
 * This lived only inside `/public/spmb/track`, a page nothing linked to — it
 * was reachable through the sitemap alone. Meanwhile the "Cek Status" tab on
 * the SPMB page, which that page's own instructions tell parents to use, was a
 * dead stub: an unbound <Input> and a <Button> with no onClick, so typing a
 * registration number and pressing the button did nothing at all. The stub
 * also asked only for the registration number, while the endpoint requires the
 * birth date too (a two-factor lookup — see `getRegistrantTrackingInfo`).
 *
 * Extracted here so the tab and the standalone page run the same code, rather
 * than one working copy and one imitation of it.
 */
export function RegistrationTracker({ locale }: { locale: Locale }) {
  const t = spmbFormContentFor(locale).tracker;
  const formatDay = (moment: string) =>
    dateFormatterFor(locale).format(new Date(moment));
  const score = (value: number | string) => formatNumber(locale, Number(value));
  const [regNo, setRegNo] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [searchParams, setSearchParams] = useState({ no: "", dob: "" });

  const {
    data: registrant,
    isLoading,
    isError,
  } = useTrackRegistrant(searchParams.no, searchParams.dob);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ no: regNo.trim(), dob: birthDate });
  };

  const currentStatusIndex = registrant
    ? (STATUS_STEP_INDEX[registrant.status] ?? 0)
    : -1;
  const isEnrolled = registrant?.status === "ENROLLED";
  const isRejected =
    registrant?.status === "REJECTED" || registrant?.status === "CANCELLED";

  return (
    <>
      <Card className="mb-8 border-2">
        <CardContent className="pt-6">
          <form
            onSubmit={handleSearch}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <div className="space-y-2">
              <label
                htmlFor="track-reg-no"
                className="text-xs font-bold uppercase text-muted-foreground"
              >
                {t.registrationNo}
              </label>
              {/*
                The placeholder used to read "PSB-2026...", a year no record
                contains, and later "REG-2026-00001", a shape no number has.
                Numbers read REG-<year>-<period>-<count>
                (`generateRegistrationNo`); the example follows that shape.
              */}
              <Input
                id="track-reg-no"
                placeholder={t.example("REG-2027-A1B2-00001")}
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="track-birth-date"
                className="text-xs font-bold uppercase text-muted-foreground"
              >
                {t.birthDate}
              </label>
              <Input
                id="track-birth-date"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Search className="me-2 h-4 w-4" aria-hidden="true" />
                )}
                {t.search}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isError && (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="py-6 text-center text-rose-600 font-medium">
            {t.notFound}
          </CardContent>
        </Card>
      )}

      {registrant && (
        <Card className="border-t-4 border-t-primary shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">
                {registrant.fullName}
              </CardTitle>
              <CardDescription>
                {registrant.registrationNo} • {registrant.admissionPeriod?.name}
              </CardDescription>
            </div>
            <Badge
              variant={isRejected ? "destructive" : "default"}
              className="text-sm py-1 px-4"
            >
              {t.status[registrant.status as keyof typeof t.status] ??
                registrant.status}
            </Badge>
          </CardHeader>
          <CardContent>
            {/* Stepper */}
            <div className="relative flex justify-between mt-6 mb-10">
              <div className="absolute top-5 start-0 w-full h-0.5 bg-slate-100 -z-0" />
              <div
                className="absolute top-5 start-0 h-0.5 bg-primary transition-all duration-500 -z-0"
                style={{
                  width: `${Math.max(0, currentStatusIndex) * (100 / (STEPS.length - 1))}%`,
                }}
              />
              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isCompleted = idx <= currentStatusIndex || isEnrolled;
                return (
                  <div
                    key={step.key}
                    className="relative z-10 flex flex-col items-center gap-2"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompleted
                          ? "bg-primary border-primary text-white shadow-lg"
                          : "bg-white border-slate-200 text-slate-300"
                      }`}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <span
                      className={`text-[10px] md:text-xs font-bold uppercase text-center w-16 md:w-24 ${
                        isCompleted ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {t.steps[step.key]}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 rounded-2xl">
              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" aria-hidden="true" />{" "}
                  {t.history}
                </h3>
                <div className="space-y-3">
                  <div className="flex gap-3 items-start">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                    <div>
                      <p className="text-sm font-bold">{t.received}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDay(registrant.createdAt)}
                      </p>
                    </div>
                  </div>
                  {registrant.acceptedAt && (
                    <div className="flex gap-3 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5" />
                      <div>
                        <p className="text-sm font-bold text-emerald-600">
                          {t.accepted}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDay(registrant.acceptedAt)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {(registrant.testScore != null ||
                  registrant.interviewScore != null ||
                  registrant.tahfidzScore != null) && (
                  <div className="pt-2 border-t space-y-1 text-xs">
                    <p className="font-bold text-slate-700">{t.scores}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {registrant.testScore != null && (
                        <div className="bg-white p-1.5 rounded border text-center">
                          <span className="block text-[9px] text-muted-foreground">
                            {t.academic}
                          </span>
                          <span className="font-bold text-sm text-primary">
                            {score(registrant.testScore)}
                          </span>
                        </div>
                      )}
                      {registrant.interviewScore != null && (
                        <div className="bg-white p-1.5 rounded border text-center">
                          <span className="block text-[9px] text-muted-foreground">
                            {t.interview}
                          </span>
                          <span className="font-bold text-sm text-primary">
                            {score(registrant.interviewScore)}
                          </span>
                        </div>
                      )}
                      {registrant.tahfidzScore != null && (
                        <div className="bg-white p-1.5 rounded border text-center">
                          <span className="block text-[9px] text-muted-foreground">
                            {t.quran}
                          </span>
                          <span className="font-bold text-sm text-primary">
                            {score(registrant.tahfidzScore)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2">
                  <FileText
                    className="w-4 h-4 text-primary"
                    aria-hidden="true"
                  />{" "}
                  {t.documents}
                </h3>
                <div className="space-y-2">
                  {registrant.documents?.length > 0 ? (
                    registrant.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between text-xs p-2 bg-white rounded border"
                      >
                        <span>{doc.name}</span>
                        <Badge
                          variant={doc.isVerified ? "default" : "outline"}
                          className="text-[9px] h-4"
                        >
                          {doc.isVerified ? t.verified : t.waiting}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      {t.noDocuments}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {isEnrolled && (
              <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
                  <GraduationCap className="w-6 h-6" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold text-emerald-900">
                    {t.enrolledTitle}
                  </p>
                  <p className="text-sm text-emerald-700">
                    {t.enrolledBody(
                      registrant.admissionPeriod?.unit?.name ?? "Cipansor",
                    )}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
