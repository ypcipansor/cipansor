"use client";

import { useEffect, useState } from "react";
import { id } from "date-fns/locale";
import { safeFormat } from "@/lib/date";
import { LetterDispositionDetail } from "@cipansor/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CalendarClock, CheckCircle2, Clock, Loader2 } from "lucide-react";

/**
 * The disposition trail: who forwarded this letter to whom, with what
 * instruction, and what came of it.
 *
 * Two things were wrong here and both were invisible in review.
 *
 * The first crashed the page. This read `disposition.senderName[0]`, but the
 * API sends `sender: { name }` — it has never sent `senderName`. The shared DTO
 * declared the flat fields, so TypeScript was satisfied, `undefined[0]` threw at
 * runtime, and the entire letter page went blank for *every letter that had ever
 * been disposed* — which is the normal state of every incoming letter.
 *
 * The second was quieter: a disposition's status was not shown at all, so one
 * that had been completed looked exactly like one still waiting on someone. The
 * trail recorded that a letter was forwarded and never whether anything came
 * back.
 */

interface DispositionTimelineProps {
  dispositions: LetterDispositionDetail[];
}

const STATUS: Record<string, { label: string; tone: string; Icon: typeof Clock }> = {
  PENDING: {
    label: "Menunggu ditindaklanjuti",
    tone: "border-amber-600 bg-amber-50 text-amber-700",
    Icon: Clock,
  },
  IN_PROGRESS: {
    label: "Sedang ditindaklanjuti",
    tone: "border-blue-600 bg-blue-50 text-blue-700",
    Icon: Loader2,
  },
  COMPLETED: {
    label: "Selesai",
    tone: "border-emerald-600 bg-emerald-50 text-emerald-700",
    Icon: CheckCircle2,
  },
};

/** First letter of a name, or a neutral mark when the name did not arrive. */
function initial(name?: string | null): string {
  return name?.trim()?.[0]?.toUpperCase() ?? "?";
}

export function DispositionTimeline({ dispositions }: DispositionTimelineProps) {
  /**
   * "Terlambat" is decided by the browser's clock, after mount.
   *
   * `Date.now()` during render is impure: the component stops being idempotent,
   * so the badge can change on any incidental re-render, and on a
   * server-rendered page the server's clock writes the HTML while the client's
   * redraws it — a hydration mismatch by construction. Reading the clock once
   * after mount gives every render the same answer. The cost is only that the
   * overdue mark appears on the first client paint rather than in the server
   * HTML, which is the right trade for a value that is about *now*.
   */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  if (!dispositions || dispositions.length === 0) {
    return (
      <div className="text-center p-4 text-muted-foreground text-sm">
        Belum ada riwayat disposisi.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dispositions.map((disposition, index) => {
        const senderName = disposition.sender?.name ?? "Tidak diketahui";
        const recipientName = disposition.recipient?.name ?? "Tidak diketahui";
        const status = STATUS[disposition.status] ?? STATUS.PENDING;
        const deadline = disposition.deadline ? new Date(disposition.deadline) : null;
        // Only an outstanding disposition can be late; a finished one that ran
        // over is history, not a task.
        const overdue =
          now !== null &&
          !!deadline &&
          deadline.getTime() < now &&
          disposition.status !== "COMPLETED";

        return (
          <Card key={disposition.id} className="relative overflow-hidden">
            {/* Vertical line connector */}
            {index !== dispositions.length - 1 && (
              <div className="absolute left-8 top-16 bottom-0 w-0.5 bg-border -z-10" />
            )}

            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{initial(disposition.sender?.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{senderName}</span>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{initial(disposition.recipient?.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{recipientName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {safeFormat(new Date(disposition.createdAt), "dd MMM yyyy HH:mm", {
                    locale: id,
                  })}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Instruksi:</p>
                <p>{disposition.instruction}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`gap-1 ${status.tone}`}>
                  <status.Icon className="h-3 w-3" aria-hidden="true" />
                  {status.label}
                </Badge>

                {deadline && (
                  <Badge
                    variant="outline"
                    className={
                      overdue
                        ? "gap-1 border-red-600 bg-red-50 text-red-700"
                        : "gap-1 text-muted-foreground"
                    }
                  >
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    {overdue ? "Lewat batas waktu " : "Batas waktu "}
                    {safeFormat(deadline, "dd MMMM yyyy", { locale: id })}
                  </Badge>
                )}

                {disposition.completedAt && (
                  <span className="text-xs text-muted-foreground">
                    Diselesaikan{" "}
                    {safeFormat(new Date(disposition.completedAt), "dd MMM yyyy HH:mm", {
                      locale: id,
                    })}
                  </span>
                )}
              </div>

              {disposition.notes && (
                <div className="rounded-md border border-dashed p-3 text-sm">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Laporan tindak lanjut:
                  </p>
                  <p className="whitespace-pre-line">{disposition.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
