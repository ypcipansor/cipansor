"use client";

import React, { useState, Suspense } from "react";
import { usePublicCreateWbs } from "@/hooks/use-pengawasan";
import { usePublicUnits } from "@/hooks/use-units";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  AlertTriangle,
  Lock,
  RefreshCw,
  Copy,
  CheckCircle2,
  ArrowRight,
  FileText,
  UserX,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  WBS_CATEGORIES,
  WBS_CATEGORY_LABELS,
  WBS_TARGET_LEVELS,
  WBS_TARGET_LEVEL_LABELS,
} from "@cipansor/shared";
import type { WbsCategoryCode, WbsTargetLevelCode } from "@cipansor/shared";
import { storeWbsTrackingToken } from "@/lib/wbs-tracking";

function PublicWbsContent() {
  const [unitId, setUnitId] = useState<string>("");
  const [category, setCategory] = useState<WbsCategoryCode>("KEUANGAN_ASET");
  const [targetLevel, setTargetLevel] =
    useState<WbsTargetLevelCode>("KEPALA_UNIT");
  const [targetName, setTargetName] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [incidentDate, setIncidentDate] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);
  const [reporterName, setReporterName] = useState<string>("");
  const [reporterContact, setReporterContact] = useState<string>("");
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");

  const [createdTicket, setCreatedTicket] = useState<{
    ticketCode: string;
    trackingToken: string;
  } | null>(null);

  const { data: publicUnits } = usePublicUnits();
  const turnstile = useTurnstile();
  const createWbsMutation = usePublicCreateWbs();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject || !description) {
      toast.error("Judul dan Rincian Laporan wajib diisi.");
      return;
    }

    if (!turnstile.ready) {
      toast.error("Verifikasi keamanan belum selesai.");
      return;
    }

    try {
      const res = await createWbsMutation.mutateAsync({
        unitId: unitId && unitId !== "YAYASAN_PUSAT" ? unitId : undefined,
        category,
        targetLevel,
        targetName: targetName || undefined,
        subject,
        description,
        location: location || undefined,
        incidentDate: incidentDate || undefined,
        isAnonymous,
        reporterName: isAnonymous ? undefined : reporterName,
        reporterContact: isAnonymous ? undefined : reporterContact,
        attachments: attachmentUrl ? [attachmentUrl] : undefined,
        turnstileToken: turnstile.token || undefined,
      });

      if (res) {
        // Hand the bearer token to the tracking page through sessionStorage,
        // never the URL: a query string leaks to browser history, telemetry,
        // proxy logs and the `Referer` header of every third-party request.
        storeWbsTrackingToken(res.ticketCode, res.trackingToken);
        setCreatedTicket({
          ticketCode: res.ticketCode,
          trackingToken: res.trackingToken,
        });
      }
      turnstile.refresh();
    } catch (err) {
      turnstile.refresh();
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} berhasil disalin!`);
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-blue-100 text-blue-700 rounded-full mb-2">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Kanal Pengaduan & Whistleblowing System (WBS)
          </h1>
          <p className="text-slate-600 text-sm max-w-xl mx-auto">
            Sampaikan pengaduan secara aman, akurat, dan rahasia. Pengaduan Anda
            akan ditindaklanjuti secara obyektif oleh Pengawas, Pembina,
            Pengurus, atau Kepala Unit sesuai kewenangannya.
          </p>
          <div className="pt-2">
            <Link href="/public/wbs/track">
              <Button
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50 gap-2"
              >
                <FileText className="h-4 w-4" />
                Lacak Progress Laporan Anda
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* WBS Form Card */}
        <Card className="shadow-md border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Formulir Laporan Pengaduan Baru
            </CardTitle>
            <CardDescription>
              Isi data berikut dengan jelas. Identitas pelapor dapat
              dirahasiakan (anonim).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Category & Target Level */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category" className="font-semibold">
                    Kategori Laporan *
                  </Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as WbsCategoryCode)}
                  >
                    <SelectTrigger id="category" className="bg-white">
                      <SelectValue placeholder="Pilih Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {WBS_CATEGORIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {WBS_CATEGORY_LABELS[code]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetLevel" className="font-semibold">
                    Subjek Teradu (Level Jabatan) *
                  </Label>
                  <Select
                    value={targetLevel}
                    onValueChange={(v) =>
                      setTargetLevel(v as WbsTargetLevelCode)
                    }
                  >
                    <SelectTrigger id="targetLevel" className="bg-white">
                      <SelectValue placeholder="Pilih Subjek Teradu" />
                    </SelectTrigger>
                    <SelectContent>
                      {WBS_TARGET_LEVELS.map((code) => (
                        <SelectItem key={code} value={code}>
                          {WBS_TARGET_LEVEL_LABELS[code]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Unit Selection & Specific Target Name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unitId">
                    Unit Organisasi Terkait (Opsional)
                  </Label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger id="unitId" className="bg-white">
                      <SelectValue placeholder="Pilih Unit Organisasi..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YAYASAN_PUSAT">
                        Yayasan Pusat (Pusat)
                      </SelectItem>
                      {publicUnits?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetName">
                    Nama / Jabatan Pihak Teradu (Opsional)
                  </Label>
                  <Input
                    id="targetName"
                    placeholder="Contoh: Oknum Staf Keuangan / Nama Teradu"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    className="bg-white"
                  />
                </div>
              </div>

              {/* Subject & Incident Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="subject" className="font-semibold">
                    Judul / Perihal Laporan *
                  </Label>
                  <Input
                    id="subject"
                    placeholder="Tuliskan judul singkat mengenai indikasi pelanggaran..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    className="bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="incidentDate">
                    Tanggal Kejadian (Opsional)
                  </Label>
                  <Input
                    id="incidentDate"
                    type="date"
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    className="bg-white"
                  />
                </div>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location">
                  Spesifikasi Lokasi Kejadian (Opsional)
                </Label>
                <Input
                  id="location"
                  placeholder="Contoh: Gedung SD IT / Asrama Santri / Kantor Yayasan"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="bg-white"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="font-semibold">
                  Rincian & Kronologi Laporan *
                </Label>
                <Textarea
                  id="description"
                  rows={5}
                  placeholder="Jelaskan secara rinci kronologi kejadian, bukti yang ada, serta dampak dari pelanggaran..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="bg-white"
                />
              </div>

              {/* Attachment URL */}
              <div className="space-y-2">
                <Label htmlFor="attachmentUrl">
                  Tautan Lampiran Bukti / Google Drive / Cloud (Opsional)
                </Label>
                <Input
                  id="attachmentUrl"
                  type="url"
                  placeholder="https://..."
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  className="bg-white"
                />
              </div>

              {/* Reporter Identity Toggle */}
              <div className="p-4 bg-slate-100 rounded-lg border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      {isAnonymous ? (
                        <UserX className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <UserCheck className="h-5 w-5 text-blue-600" />
                      )}
                      Kerahasiaan Identitas Pelapor
                    </Label>
                    <p className="text-xs text-slate-500">
                      {isAnonymous
                        ? "Laporan dikirim secara ANONIM (tanpa mencantumkan nama/kontak Anda)."
                        : "Nama dan kontak Anda akan dicantumkan secara terbatas bagi pemeriksa."}
                    </p>
                  </div>
                  <Switch
                    checked={isAnonymous}
                    onCheckedChange={setIsAnonymous}
                  />
                </div>

                {!isAnonymous && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                    <div>
                      <Label htmlFor="reporterName" className="text-xs">
                        Nama Lengkap Pelapor
                      </Label>
                      <Input
                        id="reporterName"
                        placeholder="Nama Anda"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div>
                      <Label htmlFor="reporterContact" className="text-xs">
                        No. Telepon / Email Kontak
                      </Label>
                      <Input
                        id="reporterContact"
                        placeholder="No. WA atau Email"
                        value={reporterContact}
                        onChange={(e) => setReporterContact(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Security Verification */}
              {turnstile.required && (
                <div className="p-3 bg-slate-100 rounded-md border text-sm space-y-2">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <Lock className="h-4 w-4 text-blue-600" />
                    Verifikasi Keamanan
                  </div>
                  <TurnstileWidget
                    action="wbs_report"
                    {...turnstile.widgetProps}
                  />
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-base"
                disabled={createWbsMutation.isPending || !turnstile.ready}
              >
                {createWbsMutation.isPending ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                    Mengirimkan Laporan WBS...
                  </>
                ) : (
                  "Kirimkan Laporan Pengaduan WBS"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Success Modal / Dialog */}
        <Dialog
          open={!!createdTicket}
          onOpenChange={() => setCreatedTicket(null)}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 text-xl">
                <CheckCircle2 className="h-6 w-6" />
                Laporan WBS Berhasil Dikirim!
              </DialogTitle>
              <DialogDescription>
                Simpan Kode Tiket dan Token Akses Rahasia ini untuk melacak
                progress laporan dan berkomunikasi secara anonim.
              </DialogDescription>
            </DialogHeader>

            {createdTicket && (
              <div className="space-y-4 py-3">
                <Alert className="bg-amber-50 border-amber-300">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <AlertTitle className="text-amber-800 font-bold">
                    Penting!
                  </AlertTitle>
                  <AlertDescription className="text-amber-700 text-xs">
                    Token ini hanya ditampilkan SATU KALI. Mohon catat atau
                    salin token ini sekarang sebelum menutup modal!
                  </AlertDescription>
                </Alert>

                <div className="p-4 bg-slate-100 rounded-lg space-y-3 font-mono text-sm border">
                  <div>
                    <span className="text-xs text-slate-500 font-sans block">
                      Kode Tiket WBS:
                    </span>
                    <div className="flex items-center justify-between font-bold text-slate-900 bg-white p-2 rounded border">
                      <span>{createdTicket.ticketCode}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          copyToClipboard(
                            createdTicket.ticketCode,
                            "Kode Tiket",
                          )
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-500 font-sans block">
                      Token Akses Rahasia:
                    </span>
                    <div className="flex items-center justify-between font-bold text-emerald-800 bg-white p-2 rounded border break-all">
                      <span className="text-xs">
                        {createdTicket.trackingToken}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          copyToClipboard(
                            createdTicket.trackingToken,
                            "Token Rahasia",
                          )
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    onClick={() => {
                      // The token is already in sessionStorage under this
                      // ticket code; the URL carries only the non-secret
                      // ticket so the address itself is safe to share.
                      window.location.href = `/public/wbs/track?ticket=${encodeURIComponent(
                        createdTicket.ticketCode,
                      )}`;
                    }}
                  >
                    Buka Halaman Lacak Progress
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

export default function PublicWbsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center">Memuat halaman pengaduan WBS...</div>
      }
    >
      <PublicWbsContent />
    </Suspense>
  );
}
