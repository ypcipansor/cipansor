"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Award,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  downloadAccreditationCertificate,
  useCorrectAccreditation,
  useDeleteAccreditation,
  useRecordAccreditation,
  useUnitAccreditations,
} from "@/hooks/use-unit-accreditation";
import { getErrorMessage } from "@/lib/api-error";
import {
  ACCREDITATION_PDF_MAX_BYTES,
  ACCREDITATION_RATINGS,
  BAN_PDM_LOOKUP_URL,
  type AccreditationRating,
  type UnitAccreditation,
} from "@cipansor/shared";

/**
 * Akreditasi on a unit's page (decisions/akreditasi-unit.md): the certificate
 * in force, the ones before it, and — for the unit's admin and the Super
 * Admin — recording a new one with its PDF. The public site, the EMIS and
 * Dapodik exports and the SKHUN read what is recorded here, so a unit that is
 * accredited later (TK Qur'an, newly founded, has none yet) only needs its
 * certificate entered here.
 */

const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const todayWib = () =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

type FormState = {
  rating: AccreditationRating | "";
  certificateNumber: string;
  decreeNumber: string;
  decreedAt: string;
  validUntil: string;
};

const EMPTY: FormState = {
  rating: "",
  certificateNumber: "",
  decreeNumber: "",
  decreedAt: "",
  validUntil: "",
};

function problemsOf(form: FormState, file: File | null, creating: boolean) {
  const problems: Partial<Record<keyof FormState | "certificate", string>> = {};
  if (!form.rating) problems.rating = "Pilih peringkat";
  if (form.certificateNumber.trim().length < 3)
    problems.certificateNumber = "Nomor sertifikat wajib diisi";
  if (form.decreeNumber.trim().length < 3)
    problems.decreeNumber = "Nomor SK wajib diisi";
  if (!form.decreedAt) problems.decreedAt = "Tanggal SK wajib diisi";
  if (!form.validUntil) problems.validUntil = "Tanggal berlaku wajib diisi";
  else if (form.decreedAt && form.validUntil <= form.decreedAt)
    problems.validUntil = "Tanggal berlaku harus sesudah tanggal SK";
  if (creating && !file) problems.certificate = "Unggah PDF sertifikatnya";
  if (file && file.size > ACCREDITATION_PDF_MAX_BYTES)
    problems.certificate = "PDF paling besar 5 MB";
  return problems;
}

function AccreditationDialog({
  unitId,
  editing,
  onClose,
}: {
  unitId: string;
  editing: UnitAccreditation | null;
  onClose: () => void;
}) {
  const creating = !editing;
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          rating: editing.rating,
          certificateNumber: editing.certificateNumber,
          decreeNumber: editing.decreeNumber,
          decreedAt: editing.decreedAt,
          validUntil: editing.validUntil,
        }
      : EMPTY,
  );
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const record = useRecordAccreditation(unitId);
  const correct = useCorrectAccreditation(unitId);
  const saving = record.isPending || correct.isPending;
  const problems = problemsOf(form, file, creating);
  const shown = tried ? problems : {};

  const set = (name: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [name]: value }));

  const submit = () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    const data = { ...form, rating: form.rating as AccreditationRating };
    const done = {
      onSuccess: () => {
        toast.success(
          creating ? "Akreditasi dicatat" : "Catatan akreditasi diperbarui",
        );
        onClose();
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (editing) {
      correct.mutate({ id: editing.id, data, certificate: file }, done);
    } else {
      record.mutate({ data, certificate: file! }, done);
    }
  };

  const field = (
    name: keyof FormState,
    label: string,
    type: "text" | "date" = "text",
    placeholder?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`acc-${name}`}>{label}</Label>
      <Input
        id={`acc-${name}`}
        type={type}
        value={form[name]}
        placeholder={placeholder}
        onChange={(e) => set(name)(e.target.value)}
        aria-invalid={!!shown[name]}
      />
      {shown[name] && <p className="text-sm text-destructive">{shown[name]}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {creating ? "Catat Akreditasi" : "Ubah Catatan Akreditasi"}
          </DialogTitle>
          <DialogDescription>
            Salin dari sertifikat BAN-PDM, lalu unggah PDF-nya sebagai bukti.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Peringkat</legend>
            <RadioGroup
              value={form.rating}
              onValueChange={set("rating")}
              className="flex gap-6"
            >
              {ACCREDITATION_RATINGS.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`acc-rating-${r}`} />
                  <Label htmlFor={`acc-rating-${r}`} className="font-normal">
                    {r}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {shown.rating && (
              <p className="text-sm text-destructive">{shown.rating}</p>
            )}
          </fieldset>
          {field(
            "certificateNumber",
            "Nomor sertifikat",
            "text",
            "01758/32/SMP/2023",
          )}
          {field("decreeNumber", "Nomor SK", "text", "036/BAN-PDM/SK/2023")}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("decreedAt", "Tanggal SK", "date")}
            {field("validUntil", "Berlaku sampai", "date")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-certificate">
              {creating ? "PDF sertifikat" : "Ganti PDF sertifikat (opsional)"}
            </Label>
            <Input
              id="acc-certificate"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-invalid={!!shown.certificate}
            />
            {shown.certificate && (
              <p className="text-sm text-destructive">{shown.certificate}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnitAccreditationCard({ unitId }: { unitId: string }) {
  const { data, isLoading } = useUnitAccreditations(unitId);
  const remove = useDeleteAccreditation(unitId);
  const [dialog, setDialog] = useState<{
    editing: UnitAccreditation | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<UnitAccreditation | null>(null);

  const records = data?.accreditations ?? [];
  const current = records.find((a) => a.current);
  const canWrite = !!data?.canWrite;
  const today = todayWib();

  const download = (a: UnitAccreditation) =>
    downloadAccreditationCertificate(unitId, a).catch((error) =>
      toast.error(getErrorMessage(error)),
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Akreditasi
          </CardTitle>
          <CardDescription>
            Dari sertifikat BAN-PDM. Situs publik, ekspor EMIS/Dapodik, dan
            SKHUN membaca catatan ini.
          </CardDescription>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setDialog({ editing: null })}>
            <Plus className="mr-2 h-4 w-4" />
            Catat Akreditasi
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : current ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-2xl font-semibold">
              Terakreditasi {current.rating}
            </p>
            <div className="text-sm">
              <p>Berlaku sampai {longDate(current.validUntil)}</p>
              <p className="text-muted-foreground">
                No. {current.certificateNumber} · SK {current.decreeNumber},{" "}
                {longDate(current.decreedAt)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {records.length
              ? `Akreditasi terakhir (${records[0].rating}) berakhir ${longDate(records[0].validUntil)}. Catat sertifikat barunya begitu terbit.`
              : "Belum ada akreditasi tercatat. Catat begitu sertifikat BAN-PDM diterima; situs publik menampilkannya sendiri."}
          </p>
        )}

        {records.length > 0 && (
          <ul
            className="divide-y rounded-md border"
            aria-label="Riwayat akreditasi"
          >
            {records.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {a.rating} · No. {a.certificateNumber}
                  </p>
                  <p className="text-muted-foreground">
                    {longDate(a.decreedAt)} – {longDate(a.validUntil)} · dicatat{" "}
                    {a.recordedBy.name}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {a.current ? (
                    <Badge>Berlaku</Badge>
                  ) : a.validUntil < today ? (
                    <Badge variant="secondary">Berakhir</Badge>
                  ) : (
                    <Badge variant="outline">Digantikan</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Unduh sertifikat ${a.certificateNumber}`}
                    onClick={() => download(a)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {canWrite && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Ubah catatan ${a.certificateNumber}`}
                        onClick={() => setDialog({ editing: a })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Hapus catatan ${a.certificateNumber}`}
                        onClick={() => setDeleting(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <a
          href={BAN_PDM_LOOKUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
        >
          Cek di BAN-PDM
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </CardContent>

      {dialog && (
        <AccreditationDialog
          unitId={unitId}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus catatan akreditasi?"
        description={
          deleting
            ? `Catatan ${deleting.rating} No. ${deleting.certificateNumber} dan PDF-nya dihapus. Hapus hanya catatan yang salah masuk; sertifikat yang sudah berakhir tetap disimpan sebagai riwayat.`
            : ""
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="destructive"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Catatan akreditasi dihapus");
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          });
        }}
      />
    </Card>
  );
}
