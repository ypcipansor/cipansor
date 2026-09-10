"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";

function TargetPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [targetJuz, setTargetJuz] = useState<string>("30");
  const [targetAyah, setTargetAyah] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Fetch Active Academic Year
  const { data: academicYears } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const res = await api.get("/academic-years", { params: { limit: 100 } }); // Assuming endpoint exists or similar
      return res.data.data;
    },
  });

  // Hardcoded current academic year ID for now if API not found, or use first active
  const activeYearId = academicYears?.data?.find((y: any) => y.isActive)?.id;

  // Fetch Students
  const { data: students, isLoading: isLoadingStudents } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const res = await api.get("/students", {
        params: { limit: 100, status: "active" },
      });
      return res.data.data;
    },
  });

  // Fetch Existing Target when Student Selected
  useQuery({
    queryKey: ["takhosus", "target", selectedStudentId],
    queryFn: async () => {
      if (!selectedStudentId) return null;
      try {
        const res = await api.get(
          `/takhosus/targets/student/${selectedStudentId}`,
        );
        const target = res.data.data;
        if (target) {
          setTargetJuz(target.targetJuz.toString());
          setTargetAyah(target.targetAyah?.toString() || "");
          setNotes(target.notes || "");
        }
        return target;
      } catch (e) {
        // Ignore 404
        return null;
      }
    },
    enabled: !!selectedStudentId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeYearId) throw new Error("No active academic year found");
      return api.post("/takhosus/targets", {
        studentId: selectedStudentId,
        academicYearId: activeYearId,
        targetJuz: parseInt(targetJuz),
        targetAyah: targetAyah ? parseInt(targetAyah) : undefined,
        notes,
      });
    },
    onSuccess: () => {
      toast.success("Target berhasil disimpan");
      queryClient.invalidateQueries({
        queryKey: ["takhosus", "target", selectedStudentId],
      });
      // Optionally redirect back
      // router.push('/takhosus/halaqoh');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal menyimpan target");
    },
  });

  if (!activeYearId && academicYears) {
    return (
      <div className="container mx-auto py-8">
        <div className="bg-destructive/10 p-4 rounded-md text-destructive">
          Tidak ada tahun ajaran aktif ditemukan. Harap aktifkan tahun ajaran
          terlebih dahulu.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Atur Target Hafalan
          </h1>
          <p className="text-muted-foreground mt-2">
            Tentukan target hafalan santri untuk tahun ajaran aktif.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Form Target</CardTitle>
          <CardDescription>
            Target akan berlaku untuk Tahun Ajaran Aktif.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Pilih Santri</Label>
            <Select
              value={selectedStudentId}
              onValueChange={setSelectedStudentId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Cari santri..." />
              </SelectTrigger>
              <SelectContent>
                {students?.data?.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user.name} ({s.nisn})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Juz (Total)</Label>
              <Input
                type="number"
                min="1"
                max="30"
                value={targetJuz}
                onChange={(e) => setTargetJuz(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Jumlah juz yang harus selesai.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Target Ayat Tambahan (Opsional)</Label>
              <Input
                type="number"
                min="0"
                value={targetAyah}
                onChange={(e) => setTargetAyah(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Catatan / Motivasi</Label>
            <Input
              placeholder="Contoh: Fokus lancarkan Juz 30 bulan ini"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={!selectedStudentId || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Simpan Target
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TargetPage() {
  return (
    <MainLayout>
      <TargetPageContent />
    </MainLayout>
  );
}
