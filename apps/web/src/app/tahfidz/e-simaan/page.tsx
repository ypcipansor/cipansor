"use client";

import React, { useState } from "react";
import { MainLayout } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AudioRecorder } from "@/components/tahfidz/AudioRecorder";
import { useCreateTahfidz, SURAH_LIST } from "@/hooks/use-tahfidz";
import { useStudents } from "@/hooks/use-students";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BookOpen, Headphones } from "lucide-react";

export default function ESimaanPage() {
  const createTahfidz = useCreateTahfidz();
  const { data: studentsResponse } = useStudents({ limit: 100 });
  const students = studentsResponse?.data || [];
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState({
    studentId: "",
    surahName: "Al-Fatihah",
    ayahStart: 1,
    ayahEnd: 7,
    juz: 30,
    activityType: "ZIYADAH" as "ZIYADAH" | "MUROJAAH",
  });

  const handleUpload = async (blob: Blob) => {
    if (!formData.studentId) {
      toast.error("Pilih santri terlebih dahulu");
      return;
    }
    if (formData.ayahEnd < formData.ayahStart) {
      toast.error("Ayat akhir harus >= ayat awal");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload the actual recording — the stored URL must point at a
      //    file the muhafidz can really play back later.
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      const uploadData = new FormData();
      uploadData.append(
        "file",
        new File([blob], `simaan-${Date.now()}.${extension}`, {
          type: blob.type || "audio/webm",
        }),
      );
      const uploadRes = await api.post("/upload", uploadData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const audioUrl: string | undefined = uploadRes.data?.data?.url;
      if (!audioUrl) {
        throw new Error("Upload gagal: server tidak mengembalikan URL");
      }

      // 2. Record the setoran with the real audio URL attached.
      await createTahfidz.mutateAsync({
        ...formData,
        surahNumber: SURAH_LIST.indexOf(formData.surahName) + 1,
        audioUrl,
        notes: "Setoran via E-Simaan (asinkron)",
      });

      toast.success("Setoran terkirim! Menunggu simaan dari muhafidz.");
    } catch (error) {
      const err = error as { response?: { data?: { error?: { message?: string } } } };
      toast.error(
        err.response?.data?.error?.message || "Gagal mengunggah setoran",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">E-Simaan</h1>
          <p className="text-muted-foreground">
            Setoran hafalan mandiri via rekaman audio — muhafidz menyimak
            secara asinkron
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Detail Setoran
            </CardTitle>
            <CardDescription>
              Lengkapi info hafalan sebelum merekam
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Santri</Label>
              <Select
                value={formData.studentId}
                onValueChange={(v) => setFormData({ ...formData, studentId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih santri" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s: { id: string; user?: { name?: string }; nisn?: string }) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user?.name || s.nisn || s.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Jenis</Label>
              <Select
                value={formData.activityType}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    activityType: v as "ZIYADAH" | "MUROJAAH",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZIYADAH">Ziyadah (hafalan baru)</SelectItem>
                  <SelectItem value="MUROJAAH">Murojaah (mengulang)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Surah</Label>
              <Select
                value={formData.surahName}
                onValueChange={(v) => setFormData({ ...formData, surahName: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {SURAH_LIST.map((name: string) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Juz</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={formData.juz}
                onChange={(e) =>
                  setFormData({ ...formData, juz: parseInt(e.target.value) || 1 })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Ayat awal</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.ayahStart}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ayahStart: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Ayat akhir</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.ayahEnd}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ayahEnd: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Headphones className="h-5 w-5" /> Rekaman
            </CardTitle>
            <CardDescription>
              Rekaman diunggah ke server dan tersimpan pada catatan setoran
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AudioRecorder
              onUpload={handleUpload}
              isUploading={isUploading || createTahfidz.isPending}
            />
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
