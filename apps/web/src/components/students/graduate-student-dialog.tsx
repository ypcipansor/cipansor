"use client";

import { useState } from "react";
import { format } from "date-fns";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGraduateStudent } from "@/hooks/use-students";

interface GraduateStudentDialogProps {
  studentId: string;
  studentName: string;
  unitName?: string;
  className?: string;
}

/**
 * Luluskan santri dari unitnya sekarang: baris Alumni unit itu, status santri
 * menjadi alumni, rombelnya selesai, dan riwayat unitnya ditutup LULUS.
 * Diterima di unit berikutnya (SD IT → SMP IT) adalah langkah terpisah di SPMB
 * unit itu.
 */
export function GraduateStudentDialog({
  studentId,
  studentName,
  unitName,
  className,
}: GraduateStudentDialogProps) {
  const [open, setOpen] = useState(false);
  const [graduationDate, setGraduationDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [lastClass, setLastClass] = useState(className ?? "");
  const [notes, setNotes] = useState("");
  const graduate = useGraduateStudent();

  const unit = unitName ?? "unitnya";

  const handleSubmit = async () => {
    if (!graduationDate) return;
    try {
      const alumni = await graduate.mutateAsync({
        studentId,
        // Tengah hari UTC: tanggal yang dipilih tidak bergeser ke hari
        // sebelumnya di zona waktu mana pun.
        graduationDate: new Date(`${graduationDate}T12:00:00.000Z`).toISOString(),
        lastClass: lastClass.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(
        `${studentName} tercatat lulus dari ${unit} (${alumni?.graduationYear ?? graduationDate.slice(0, 4)}).`,
      );
      setOpen(false);
    } catch {
      // Pesan galat dari API sudah ditampilkan interceptor.
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <GraduationCap className="mr-2 h-4 w-4" />
          Luluskan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Luluskan dari {unit}</DialogTitle>
          <DialogDescription>
            {studentName} akan tercatat sebagai alumni {unit}, rombelnya
            selesai, dan statusnya menjadi alumni. Bila ia melanjutkan ke unit
            lain, penerimaannya dilakukan lewat SPMB unit tujuan.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="graduationDate">Tanggal lulus</Label>
            <Input
              id="graduationDate"
              type="date"
              value={graduationDate}
              onChange={(e) => setGraduationDate(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lastClass">Kelas terakhir</Label>
            <Input
              id="lastClass"
              value={lastClass}
              onChange={(e) => setLastClass(e.target.value)}
              placeholder="mis. 6A"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="graduationNotes">Catatan (opsional)</Label>
            <Textarea
              id="graduationNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!graduationDate || graduate.isPending}
          >
            {graduate.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Luluskan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
