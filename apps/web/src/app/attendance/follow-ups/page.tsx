"use client";

import { useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MessageCircle, Phone } from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  FOLLOW_UP_CHANNEL_LABELS,
  FOLLOW_UP_OUTCOME_LABELS,
  useAttendanceFollowUps,
  useRecordFollowUp,
} from "@/hooks/use-attendance";
import { getErrorMessage } from "@/lib/api-error";
import {
  ATTENDANCE_FOLLOW_UP_CHANNELS,
  ATTENDANCE_FOLLOW_UP_OUTCOMES,
  ATTENDANCE_FOLLOW_UP_WINDOW_DAYS,
  type AttendanceFollowUpChannel,
  type AttendanceFollowUpItem,
  type AttendanceFollowUpOutcome,
} from "@cipansor/shared";

/**
 * Tindak Lanjut Absensi — the second tier of the attendance follow-up
 * (decisions/absensi-harian.md). The wali kelas of a day pupil and the musyrif
 * of a santri mukim see the Alpa marks that are theirs, contact the wali, and
 * record what came of it. A reason puts it on the register; "no reason"
 * closes it; "could not reach" keeps it here for another try.
 */

const RELATION_LABELS: Record<string, string> = {
  father: "Ayah",
  mother: "Ibu",
  guardian: "Wali",
  contact: "Kontak pendaftaran",
};

const dayLabel = (day: string) =>
  format(new Date(`${day}T00:00:00`), "EEEE, d MMMM yyyy", {
    locale: localeId,
  });

/** An Indonesian number as wa.me wants it: digits, country code first. */
const whatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
};

function RecordDialog({
  item,
  onClose,
}: {
  item: AttendanceFollowUpItem;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<AttendanceFollowUpChannel>("PHONE");
  const [outcome, setOutcome] = useState<AttendanceFollowUpOutcome | null>(
    null,
  );
  const [note, setNote] = useState("");
  const record = useRecordFollowUp();

  const submit = () => {
    if (!outcome) return;
    record.mutate(
      {
        attendanceId: item.attendanceId,
        data: { channel, outcome, ...(note.trim() ? { note } : {}) },
      },
      {
        onSuccess: () => {
          toast.success(
            `${item.student.name}: ${FOLLOW_UP_OUTCOME_LABELS[outcome].effect}`,
          );
          onClose();
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat hasil tindak lanjut</DialogTitle>
          <DialogDescription>
            {item.student.name} · {item.class.name} · Alpa {dayLabel(item.date)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Cara menghubungi</legend>
            <RadioGroup
              value={channel}
              onValueChange={(v) => setChannel(v as AttendanceFollowUpChannel)}
              className="grid-cols-2"
            >
              {ATTENDANCE_FOLLOW_UP_CHANNELS.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <RadioGroupItem value={c} id={`channel-${c}`} />
                  <Label htmlFor={`channel-${c}`} className="font-normal">
                    {FOLLOW_UP_CHANNEL_LABELS[c]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Hasilnya</legend>
            <RadioGroup
              value={outcome ?? ""}
              onValueChange={(v) => setOutcome(v as AttendanceFollowUpOutcome)}
            >
              {ATTENDANCE_FOLLOW_UP_OUTCOMES.map((o) => (
                <div key={o} className="flex items-start gap-2">
                  <RadioGroupItem
                    value={o}
                    id={`outcome-${o}`}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`outcome-${o}`} className="font-normal">
                    <span className="font-medium">
                      {FOLLOW_UP_OUTCOME_LABELS[o].label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {FOLLOW_UP_OUTCOME_LABELS[o].effect}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="follow-up-note">Catatan (opsional)</Label>
            <Textarea
              id="follow-up-note"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. demam sejak semalam, surat dokter menyusul"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} disabled={!outcome || record.isPending}>
            {record.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpCard({
  item,
  onRecord,
}: {
  item: AttendanceFollowUpItem;
  onRecord: () => void;
}) {
  return (
    <li data-testid={`follow-up-${item.attendanceId}`}>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold">{item.student.name}</p>
              <p className="text-sm text-muted-foreground">
                {item.class.name}
                {item.student.nis ? ` · NIS ${item.student.nis}` : ""}
              </p>
              <p className="text-sm">
                Alpa <span className="font-medium">{dayLabel(item.date)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {item.as === "MUSYRIF" ? "Santri mukim binaan" : "Perwalian"}
              </Badge>
              <Button size="sm" onClick={onRecord}>
                Catat hasil
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              Hubungi
            </p>
            {item.walis.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada kontak wali tercatat
              </p>
            ) : (
              <ul className="space-y-1">
                {item.walis.map((w, i) => (
                  <li
                    key={`${w.name}-${i}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  >
                    <span>
                      {w.name}{" "}
                      <span className="text-muted-foreground">
                        ({RELATION_LABELS[w.relation] ?? w.relation})
                      </span>
                    </span>
                    {w.phone ? (
                      <>
                        <a
                          href={`tel:${w.phone}`}
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          {w.phone}
                        </a>
                        <a
                          href={`https://wa.me/${whatsAppNumber(w.phone)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                          aria-label={`WhatsApp ${w.name}`}
                        >
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                          WhatsApp
                        </a>
                      </>
                    ) : (
                      <span className="text-muted-foreground">tanpa nomor</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {item.followUps.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Sudah dicoba
              </p>
              <ul className="space-y-1 text-sm">
                {item.followUps.map((f) => (
                  <li key={f.id}>
                    {FOLLOW_UP_OUTCOME_LABELS[f.outcome].label} lewat{" "}
                    {FOLLOW_UP_CHANNEL_LABELS[f.channel].toLowerCase()} —{" "}
                    {format(new Date(f.at), "d MMM HH:mm", {
                      locale: localeId,
                    })}
                    , {f.by.name}
                    {f.note ? (
                      <span className="text-muted-foreground"> · {f.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

export default function AttendanceFollowUpsPage() {
  const { data: items = [], isLoading } = useAttendanceFollowUps();
  const [recording, setRecording] = useState<AttendanceFollowUpItem | null>(
    null,
  );

  return (
    <MainLayout>
      <PageHeader
        title="Tindak Lanjut Absensi"
        description={`Alpa tanpa keterangan dalam ${ATTENDANCE_FOLLOW_UP_WINDOW_DAYS} hari terakhir, untuk santri kelas perwalian dan santri mukim binaan Anda. Hubungi walinya, lalu catat hasilnya.`}
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8" />
            <p>Tidak ada Alpa yang perlu Anda tindak lanjuti</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Alpa yang perlu ditindaklanjuti">
          {items.map((item) => (
            <FollowUpCard
              key={item.attendanceId}
              item={item}
              onRecord={() => setRecording(item)}
            />
          ))}
        </ul>
      )}

      {recording && (
        <RecordDialog item={recording} onClose={() => setRecording(null)} />
      )}
    </MainLayout>
  );
}
