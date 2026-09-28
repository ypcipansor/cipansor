"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, FileHeart, Upload } from "lucide-react";
import {
  PERMIT_NOTE_MAX_BYTES,
  PERMIT_NOTE_MIME_TYPES,
} from "@cipansor/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchDoctorNote,
  useAttachDoctorNote,
  type Permit,
} from "@/hooks/use-permits";

/**
 * A doctor's note on a permit (decided 2026-09-28,
 * decisions/pemutus-izin-santri.md): a child's health data. Whoever files the
 * permit may attach one; whoever decides it, the unit head and the santri's
 * wali open it; everyone else sees that there is one. It is erased when the
 * academic year of the leave ends.
 */

const ACCEPT = PERMIT_NOTE_MIME_TYPES.join(",");

/** Who reads it and how long it stays — said wherever a note is attached. */
export const DOCTOR_NOTE_PRIVACY =
  "Hanya dapat dibuka pemutus izin, wali santri, dan kepala unit; dihapus otomatis di akhir tahun ajaran.";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

/** Why a chosen file cannot be a note, or null when it can. */
export function doctorNoteProblem(file: File): string | null {
  if (!(PERMIT_NOTE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Surat dokter harus foto (JPG, PNG, WebP) atau PDF";
  }
  if (file.size > PERMIT_NOTE_MAX_BYTES)
    return "Surat dokter paling besar 5 MB";
  return null;
}

/** The optional file field on a permit form. */
export function DoctorNoteField({
  file,
  onChange,
  id = "doctor-note",
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  id?: string;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Surat dokter (bila ada)</Label>
      <Input
        id={id}
        type="file"
        accept={ACCEPT}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const chosen = e.target.files?.[0] ?? null;
          const why = chosen ? doctorNoteProblem(chosen) : null;
          setProblem(why);
          onChange(why ? null : chosen);
          if (why) e.target.value = "";
        }}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Foto atau PDF, paling besar 5 MB. {DOCTOR_NOTE_PRIVACY}
      </p>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {file && !problem && (
        <p className="text-xs text-muted-foreground">Dipilih: {file.name}</p>
      )}
    </div>
  );
}

const ATTACHABLE = ["PENDING", "APPROVED"];

/** The note's state on a permit, with open / attach / replace where allowed. */
export function DoctorNoteSection({
  permit,
  canAttach,
}: {
  permit: Permit;
  /** The caller may file for this learner (every page showing this can). */
  canAttach: boolean;
}) {
  const note = permit.doctorNote;
  const attach = useAttachDoctorNote();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(
    null,
  );
  const [opening, setOpening] = useState(false);
  // The first note is anyone's to attach who may file the permit; replacing
  // one is for those who may open it (the API holds the same line).
  const attachable =
    canAttach && ATTACHABLE.includes(permit.status) && (!note || note.canOpen);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const why = doctorNoteProblem(file);
    if (why) {
      toast.error(why);
      return;
    }
    try {
      await attach.mutateAsync({ id: permit.id, file });
      toast.success("Surat dokter dilampirkan");
    } catch {
      // The API client has already shown the server's message.
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const open = async () => {
    setOpening(true);
    try {
      const blob = await fetchDoctorNote(permit.id);
      setPreview({ url: URL.createObjectURL(blob), type: blob.type });
    } catch {
      // The API client has already shown the server's message.
    } finally {
      setOpening(false);
    }
  };

  if (!note && !attachable) return null;

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <FileHeart className="h-4 w-4 text-muted-foreground" aria-hidden />
          Surat dokter
        </p>
        <div className="flex flex-wrap gap-2">
          {note?.canOpen && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={open}
              disabled={opening}
            >
              <Eye className="mr-1 h-4 w-4" aria-hidden />
              {opening ? "Membuka…" : "Buka surat dokter"}
            </Button>
          )}
          {attachable && (
            <>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                aria-label={
                  note ? "Ganti surat dokter" : "Lampirkan surat dokter"
                }
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => input.current?.click()}
                disabled={attach.isPending}
              >
                <Upload className="mr-1 h-4 w-4" aria-hidden />
                {attach.isPending
                  ? "Mengunggah…"
                  : note
                    ? "Ganti"
                    : "Lampirkan"}
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="text-muted-foreground">
        {!note
          ? `Belum ada. ${DOCTOR_NOTE_PRIVACY}`
          : note.erasedAt
            ? `Dilampirkan ${shortDate(note.attachedAt)}; berkasnya dihapus ${shortDate(note.erasedAt)} di akhir tahun ajaran.`
            : `Dilampirkan ${shortDate(note.attachedAt)}; disimpan sampai ${shortDate(note.retainUntil)}.`}
        {note &&
          (note.firstViewedBy
            ? ` Dilihat oleh ${note.firstViewedBy.name}${note.firstViewedAt ? `, ${shortDate(note.firstViewedAt)}` : ""}.`
            : note.erasedAt
              ? ""
              : " Belum dilihat pemutus izin.")}
        {note && !note.canOpen && !note.erasedAt && ` ${DOCTOR_NOTE_PRIVACY}`}
      </p>

      <Dialog
        open={!!preview}
        onOpenChange={(isOpen) => !isOpen && setPreview(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Surat dokter</DialogTitle>
            <DialogDescription>
              {permit.student.user.name} · {permit.code ?? ""}. Pembukaan ini
              tercatat.
            </DialogDescription>
          </DialogHeader>
          {preview &&
            (preview.type === "application/pdf" ? (
              <iframe
                src={preview.url}
                title="Surat dokter"
                className="h-[70vh] w-full rounded border"
              />
            ) : (
              // A blob URL of the caller's own fetch: next/image cannot load it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt="Surat dokter"
                className="mx-auto max-h-[70vh] max-w-full rounded border object-contain"
              />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
