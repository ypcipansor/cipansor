"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, ShieldCheck, Info } from "lucide-react";

export interface SuccessionScoreComponent {
  key: string;
  label: string;
  points: number;
  max: number;
  basis: string;
  available: boolean;
}

export interface SuccessionCandidate {
  talentProfileId: string;
  name: string;
  currentRole: string;
  category: string;
  readiness: string;
  readinessBasis?: string;
  matchScore: number;
  shariaMatch: boolean;
  competencyMatch: number | null;
  /** True when the category base was the only thing that moved the number. */
  scoreReflectsOnlyCategory?: boolean;
  components?: SuccessionScoreComponent[];
  missingInputs?: string[];
}

interface SuccessionPlanningListProps {
  candidates: SuccessionCandidate[];
  positionTitle: string;
}

export function SuccessionPlanningList({
  candidates,
  positionTitle,
}: SuccessionPlanningListProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Kandidat Suksesi: {positionTitle}</h3>

      <div className="grid gap-4">
        {candidates.map((candidate) => {
          const categoryOnly = candidate.scoreReflectsOnlyCategory ?? false;
          return (
            <Card key={candidate.talentProfileId} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row sm:items-stretch">
                  <div className="flex shrink-0 flex-row items-center gap-4 border-b bg-slate-50 p-4 sm:w-36 sm:flex-col sm:justify-center sm:gap-2 sm:border-b-0 sm:border-r dark:bg-slate-900/40">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {candidate.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-center">
                      {/*
                        A score built only from the talent category is the
                        category with a percent sign on it — it does not
                        answer "how well does this person fit THIS position".
                        Showing it as a headline number invited a succession
                        decision to rest on it, so when nothing else
                        contributed the number is withheld rather than dressed
                        up.
                      */}
                      {categoryOnly ? (
                        <div className="text-xs font-semibold text-muted-foreground">
                          Belum bisa
                          <br />
                          dinilai
                        </div>
                      ) : (
                        <>
                          <div className="text-2xl font-bold text-primary">
                            {candidate.matchScore}
                          </div>
                          <div className="text-[10px] font-bold uppercase text-muted-foreground">
                            dari 100
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-base font-bold">
                          {candidate.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {candidate.currentRole ||
                            "Peran saat ini belum dicatat"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={
                            candidate.category === "HIGH_POTENTIAL"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {candidate.category.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {candidate.readiness.replace(/_/g, " ")}
                          {candidate.readinessBasis
                            ? ` · dari ${candidate.readinessBasis}`
                            : ""}
                        </Badge>
                      </div>
                    </div>

                    {candidate.components &&
                      candidate.components.length > 0 && (
                        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Rincian penilaian
                          </p>
                          {candidate.components.map((c) => (
                            <div
                              key={c.key}
                              className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"
                            >
                              <span
                                className={
                                  c.available
                                    ? ""
                                    : "text-muted-foreground italic"
                                }
                              >
                                {c.label}
                              </span>
                              <span className="tabular-nums">
                                {c.available ? (
                                  <>
                                    <span className="font-semibold">
                                      {c.points}
                                    </span>
                                    <span className="text-muted-foreground">
                                      /{c.max}
                                    </span>
                                    <span className="ml-2 text-muted-foreground">
                                      {c.basis}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground italic">
                                    {c.basis}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Kesesuaian kompetensi
                          </span>
                          {/*
                            null means "not assessed", which is not the same
                            as zero. Rendering `?? 0` drew a 0% bar that read
                            as a measurement of a poor fit.
                          */}
                          <span className="font-medium">
                            {candidate.competencyMatch === null
                              ? "belum dinilai"
                              : `${candidate.competencyMatch}%`}
                          </span>
                        </div>
                        {candidate.competencyMatch === null ? (
                          <div className="h-1.5 rounded-full border border-dashed" />
                        ) : (
                          <Progress
                            value={candidate.competencyMatch}
                            className="h-1.5"
                          />
                        )}
                      </div>

                      {candidate.shariaMatch && (
                        <div
                          className="flex items-center gap-1 text-emerald-600"
                          title="Pelatihan syariah tercatat selesai"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          <span className="text-[10px] font-bold">
                            PELATIHAN SYARIAH
                          </span>
                        </div>
                      )}
                    </div>

                    {candidate.missingInputs &&
                      candidate.missingInputs.length > 0 && (
                        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Belum ada data untuk:{" "}
                            {candidate.missingInputs.join(", ").toLowerCase()}.
                          </span>
                        </p>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {candidates.length === 0 && (
          <div className="rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
            <User className="mx-auto mb-2 h-12 w-12 opacity-20" />
            <p>Tidak ada kandidat potensial yang ditemukan untuk posisi ini.</p>
          </div>
        )}
      </div>
    </div>
  );
}
