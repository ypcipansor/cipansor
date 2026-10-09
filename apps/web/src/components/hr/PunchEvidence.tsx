"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePunchPhoto, type AttendanceEvidence } from "@/hooks";
import { objectUrlForBlob, releaseObjectUrl } from "@/lib/files";
import { safeFormat } from "@/lib/date";
import { AlertTriangle, Camera, FileImage, Loader2 } from "lucide-react";

const KIND_LABEL = { CHECK_IN: "Masuk", CHECK_OUT: "Pulang" } as const;

/**
 * What a punch carried, for the unit admin: whether it was outside the site,
 * whether its photo came from a file rather than the camera (both are review
 * prompts, not verdicts — a browser cannot tell a faked position from a real
 * one), and the selfie itself, fetched only when opened because every opening
 * is recorded.
 */
export function PunchEvidence({
  name,
  records,
}: {
  name: string;
  records: AttendanceEvidence[];
}) {
  const [open, setOpen] = useState<AttendanceEvidence | null>(null);

  if (!records.length) return <span className="text-muted-foreground">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {records.map((record) => {
        const outside = record.isWithinRadius === false;
        const fromFile = record.photoSource === "FILE";
        return (
          <Button
            key={record.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!record.hasPhoto}
            onClick={() => setOpen(record)}
            aria-label={`Bukti ${KIND_LABEL[record.kind]} ${name}`}
          >
            {KIND_LABEL[record.kind]}
            {record.hasPhoto && <Camera className="h-3 w-3" aria-hidden />}
            {outside && (
              <AlertTriangle
                className="h-3 w-3 text-amber-600"
                aria-label="di luar lokasi absen"
              />
            )}
            {fromFile && (
              <FileImage
                className="h-3 w-3 text-amber-600"
                aria-label="foto dari berkas"
              />
            )}
          </Button>
        );
      })}
      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md">
          {open && <PhotoView name={name} record={open} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhotoView({
  name,
  record,
}: {
  name: string;
  record: AttendanceEvidence;
}) {
  const { data, isLoading, isError } = usePunchPhoto(record.id);
  const url = useMemo(() => (data ? objectUrlForBlob(data) : null), [data]);
  useEffect(() => () => releaseObjectUrl(url), [url]);

  const notes: string[] = [];
  if (record.isWithinRadius === false) {
    notes.push(
      record.distanceMeters != null
        ? `Di luar lokasi absen (${record.distanceMeters} m dari lokasi terdekat)`
        : "Di luar lokasi absen",
    );
  }
  if (record.photoSource === "FILE") {
    notes.push("Foto dipilih dari berkas karena kamera tidak dapat dibuka");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Swafoto {KIND_LABEL[record.kind]} — {name}
        </DialogTitle>
        <DialogDescription>
          {safeFormat(new Date(record.capturedAt), "dd MMM yyyy, HH:mm")}.
          Pembukaan swafoto ini dicatat.
        </DialogDescription>
      </DialogHeader>
      <div className="overflow-hidden rounded-md border bg-muted">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError || !url ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Swafoto tidak dapat dibuka.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Swafoto ${name}`}
            className="max-h-96 w-full object-contain"
          />
        )}
      </div>
      {notes.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
          {notes.map((n) => (
            <li key={n} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
