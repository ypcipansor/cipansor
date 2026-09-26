"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAssignTeacherToSubject,
  type Subject,
} from "@/hooks/use-curriculum";
import { useTeachers } from "@/hooks/use-teachers";
import { useClasses } from "@/hooks/use-classes";

// Radix Select has no empty value; the API stores "all classes" as null.
const ALL_CLASSES = "ALL";

/** Assign a guru pengampu: a teacher of the subject's unit, for one class or all. */
export function PengampuDialog({
  subject,
  open,
  onOpenChange,
}: {
  subject: Subject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState(ALL_CLASSES);
  const { data: teachers, isLoading: teachersLoading } = useTeachers({
    unitId: subject.unitId,
    status: "ACTIVE",
    limit: 100,
  });
  const { data: classes } = useClasses({ unitId: subject.unitId, limit: 100 });
  const assign = useAssignTeacherToSubject();

  const teacherRows = teachers?.data ?? [];
  const classRows = classes?.data ?? [];

  const reset = () => {
    setTeacherId("");
    setClassId(ALL_CLASSES);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) return;
    try {
      await assign.mutateAsync({
        teacherId,
        subjectId: subject.id,
        classId: classId === ALL_CLASSES ? null : classId,
      });
      toast.success("Guru pengampu ditugaskan");
      reset();
      onOpenChange(false);
    } catch {
      // The API client has already shown the server's message.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tugaskan guru pengampu</DialogTitle>
          <DialogDescription>
            Guru {subject.unit?.name ?? "unit ini"} yang mengajar {subject.name}
            .
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pengampu-teacher">Guru</Label>
            {/* Radix shows the placeholder only for an undefined value, not "". */}
            <Select value={teacherId || undefined} onValueChange={setTeacherId}>
              <SelectTrigger id="pengampu-teacher" className="w-full">
                <SelectValue
                  placeholder={
                    teachersLoading
                      ? "Memuat…"
                      : teacherRows.length
                        ? "Pilih guru"
                        : "Unit ini belum punya guru"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {teacherRows.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.user?.name ?? t.nip ?? t.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pengampu-class">Kelas</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="pengampu-class" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CLASSES}>Semua kelas</SelectItem>
                {classRows.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.academicYear
                      ? `${c.name} · ${c.academicYear.name}`
                      : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={!teacherId || assign.isPending}>
              {assign.isPending ? "Menyimpan…" : "Tugaskan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
