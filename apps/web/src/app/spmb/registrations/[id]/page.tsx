"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  useRegistrant,
  useOnboardRegistrant,
  useRecordRegistrationFee,
  useUpdateRegistrantScore,
  useUpdateRegistrantStatus,
  useVerifyRegistrantDocument,
} from "@/hooks/use-admissions";
import type { RegistrationStatus } from "@/hooks/use-admissions";
import { useAuth } from "@/hooks/use-auth";
import { getPrimaryRoleCode } from "@/lib/rbac";
import { safeFormat } from "@/lib/date";
import { resolveFeeOwed, canPreviewDocument } from "@/lib/spmb-registration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Rocket, GraduationCap, Wallet, Check, X, FileText, Award, Eye, ExternalLink } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Mendaftar",
  DOCUMENT_CHECK: "Verifikasi Dokumen",
  TEST_SCHEDULED: "Dijadwalkan Tes",
  TEST_COMPLETED: "Selesai Tes",
  ACCEPTED: "Diterima",
  REJECTED: "Ditolak",
  ENROLLED: "Sudah Daftar Ulang",
  CANCELLED: "Dibatalkan",
};

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "-"}</p>
    </div>
  );
}

export default function RegistrationDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = React.use(paramsPromise);
  const { user } = useAuth();
  const { data: registrant, isLoading } = useRegistrant(params.id);
  const onboard = useOnboardRegistrant();
  const recordFee = useRecordRegistrationFee();
  const updateScore = useUpdateRegistrantScore();
  const updateStatus = useUpdateRegistrantStatus();
  const verifyDoc = useVerifyRegistrantDocument();

  const userRole = getPrimaryRoleCode(user);
  const canManageDecisions = userRole === "SUPER_ADMIN" || userRole === "UNIT_ADMIN";

  const [isOnboarding, setIsOnboarding] = useState(false);
  const [testScore, setTestScore] = useState<string>("");
  const [interviewScore, setInterviewScore] = useState<string>("");
  const [tahfidzScore, setTahfidzScore] = useState<string>("");

  React.useEffect(() => {
    if (registrant) {
      if (registrant.testScore != null) setTestScore(String(registrant.testScore));
      if (registrant.interviewScore != null) setInterviewScore(String(registrant.interviewScore));
      if (registrant.tahfidzScore != null) setTahfidzScore(String(registrant.tahfidzScore));
    }
  }, [registrant]);

  const handleSaveScores = async () => {
    if (!registrant) return;
    try {
      await updateScore.mutateAsync({
        id: registrant.id,
        testScore: testScore ? Number(testScore) : undefined,
        interviewScore: interviewScore ? Number(interviewScore) : undefined,
        tahfidzScore: tahfidzScore ? Number(tahfidzScore) : undefined,
      });
      toast.success("Nilai seleksi berhasil disimpan.");
    } catch {
      toast.error("Gagal menyimpan nilai seleksi.");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!registrant) return;
    try {
      await updateStatus.mutateAsync({
        id: registrant.id,
        status: newStatus as RegistrationStatus,
      });
      toast.success(`Status berhasil diubah ke ${STATUS_LABEL[newStatus] ?? newStatus}.`);
    } catch {
      toast.error("Gagal mengubah status.");
    }
  };

  const handleVerifyDocument = async (docId: string, isVerified: boolean) => {
    try {
      await verifyDoc.mutateAsync({ id: docId, isVerified });
      toast.success(isVerified ? "Dokumen diverifikasi." : "Verifikasi batalkan.");
    } catch {
      toast.error("Gagal memperbarui status dokumen.");
    }
  };

  const handleRecordFee = async () => {
    if (!registrant) return;
    try {
      await recordFee.mutateAsync({ id: registrant.id });
      toast.success("Pelunasan daftar ulang tercatat.");
    } catch {
      toast.error("Gagal mencatat pelunasan daftar ulang.");
    }
  };

  const handleOnboard = async () => {
    if (!registrant) return;
    // The registrant carries its unit via the admission period. The detail API
    // nests it as `admissionPeriod.unit.id`; fall back to the admin's own unit.
    const period = registrant.admissionPeriod as
      | { unitId?: string; unit?: { id?: string } }
      | undefined;
    const unitId =
      registrant.unitId ||
      period?.unit?.id ||
      period?.unitId ||
      (user as { unitId?: string } | null)?.unitId;
    if (!unitId) {
      toast.error("Unit tidak diketahui untuk pendaftar ini.");
      return;
    }

    setIsOnboarding(true);
    try {
      // The integrated onboarding orchestrator creates the student, invoice,
      // medical record, and parent account, and enrolls the registrant
      // (setting its status to ENROLLED) inside one transaction. Do NOT also
      // PATCH the status to ENROLLED here — the status endpoint forbids that
      // transition ("use the enrollment endpoint instead"), which previously
      // made every onboarding surface an error toast despite succeeding.
      await onboard.mutateAsync({ registrantId: registrant.id, unitId });
      toast.success("Siswa berhasil di-Onboard secara terpadu!");
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Gagal melakukan onboarding terpadu.";
      toast.error(message);
    } finally {
      setIsOnboarding(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!registrant) {
    return (
      <MainLayout>
        <div className="py-12 text-center text-destructive">
          Data pendaftar tidak ditemukan.
        </div>
      </MainLayout>
    );
  }

  // Acceptance is an academic decision; daftar ulang is a separate one. The
  // API refuses to onboard an unpaid registrant, so the button reflects that
  // rather than offering an action that will fail.
  // Mirrors assertAdmissionFeeSettled(): the wave's registrationFee overrides
  // the parent period's fee when present, and the onboarding gate reads the
  // *wave* fee. Reading only the period fee hides the payment button when the
  // period fee is 0 but the wave charges a fee, or shows it when the period
  // charges but the wave waived it — both make feeSettled diverge from backend.
  const registrationFeeOwed = resolveFeeOwed(
    registrant.wave?.registrationFee,
    registrant.admissionPeriod?.registrationFee,
  );
  const feeSettled = registrationFeeOwed <= 0 || Boolean(registrant.registrationFeePaidAt);
  const canOnboard =
    registrant.status === "ACCEPTED" && !registrant.enrolledAt && feeSettled;
  const awaitingFee =
    registrant.status === "ACCEPTED" && !registrant.enrolledAt && !feeSettled;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            title={registrant.fullName || registrant.name || "Pendaftar"}
            description={`No. Pendaftaran: ${registrant.registrationNo ?? "-"}`}
          />
          <Badge variant="outline" className="text-sm uppercase">
            {STATUS_LABEL[registrant.status] ?? registrant.status}
          </Badge>
        </div>

        {awaitingFee && (
          <Card className="border-l-4 border-l-amber-500 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-amber-600" /> Menunggu Daftar Ulang
              </CardTitle>
              <CardDescription>
                Pendaftar sudah diterima, tetapi biaya daftar ulang belum
                tercatat lunas. Onboarding terpadu terbuka setelah pelunasan
                dicatat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={handleRecordFee}
                disabled={recordFee.isPending}
              >
                {recordFee.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="mr-2 h-4 w-4" />
                )}
                Catat Pelunasan Daftar Ulang
              </Button>
            </CardContent>
          </Card>
        )}

        {canOnboard && (
          <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Rocket className="h-5 w-5 text-emerald-600" /> Onboarding Terpadu
              </CardTitle>
              <CardDescription>
                Pendaftar telah diterima. Jalankan onboarding terpadu untuk
                membuat data siswa, tagihan SPP, rekam medis, dan akun wali
                secara otomatis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleOnboard} disabled={isOnboarding}>
                {isOnboarding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GraduationCap className="mr-2 h-4 w-4" />
                )}
                Eksekusi Onboarding Terpadu (E2E)
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Calon Santri</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Nama Lengkap" value={registrant.fullName || registrant.name} />
              <Field label="Jenis Kelamin" value={registrant.gender === "MALE" ? "Laki-laki" : "Perempuan"} />
              <Field label="Tempat Lahir" value={registrant.birthPlace} />
              <Field
                label="Tanggal Lahir"
                value={safeFormat(registrant.birthDate, "dd MMM yyyy")}
              />
              <Field label="Asal Sekolah" value={registrant.previousSchool} />
              <Field label="Kemampuan Qur'an" value={registrant.quranAbility} />
              <Field label="Hafalan" value={registrant.memorizedJuz ? `${registrant.memorizedJuz} Juz` : "-"} />
              <Field
                label="Tanggal Daftar"
                value={safeFormat(registrant.createdAt, "dd MMM yyyy")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Orang Tua / Wali</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Nama Wali" value={registrant.parentName} />
              <Field label="No. HP Wali" value={registrant.parentPhone} />
              <Field label="Email Wali" value={registrant.parentEmail} />
              <Field label="Pekerjaan" value={registrant.parentOccupation} />
              <Field label="Alamat" value={registrant.address} />
            </CardContent>
          </Card>
        </div>

        {/* Nilai Seleksi & Keputusan Status */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" /> Penginputan Nilai Seleksi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-bold uppercase mb-1">Tes Akademik</p>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0-100"
                    value={testScore}
                    onChange={(e) => setTestScore(e.target.value)}
                    disabled={!canManageDecisions}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase mb-1">Wawancara</p>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0-100"
                    value={interviewScore}
                    onChange={(e) => setInterviewScore(e.target.value)}
                    disabled={!canManageDecisions}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase mb-1">Tes Qur'an/Tahfidz</p>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0-100"
                    value={tahfidzScore}
                    onChange={(e) => setTahfidzScore(e.target.value)}
                    disabled={!canManageDecisions}
                  />
                </div>
              </div>
              <Button onClick={handleSaveScores} disabled={!canManageDecisions || updateScore.isPending} className="w-full">
                {updateScore.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Simpan Nilai Seleksi
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Keputusan Kelulusan Seleksi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ubah status pendaftaran calon santri berdasarkan kriteria seleksi:
              </p>
              {!canManageDecisions && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  Hanya Admin Unit atau Super Admin yang berwenang mengubah nilai dan keputusan status seleksi.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={registrant.status === "ACCEPTED" ? "default" : "outline"}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleStatusChange("ACCEPTED")}
                  disabled={!canManageDecisions || updateStatus.isPending}
                >
                  Terima (ACCEPTED)
                </Button>
                <Button
                  size="sm"
                  variant={registrant.status === "REJECTED" ? "destructive" : "outline"}
                  onClick={() => handleStatusChange("REJECTED")}
                  disabled={!canManageDecisions || updateStatus.isPending}
                >
                  Tolak (REJECTED)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange("TEST_SCHEDULED")}
                  disabled={!canManageDecisions || updateStatus.isPending}
                >
                  Jadwalkan Tes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Verifikasi Dokumen Persyaratan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Dokumen Persyaratan SPMB
            </CardTitle>
          </CardHeader>
          <CardContent>
            {registrant.documents && registrant.documents.length > 0 ? (
              <div className="space-y-3">
                {registrant.documents.map((doc: any) => {
                  // SSRF guard (review): a stored `fileUrl` may point at an
                  // arbitrary public host that redirects to a private/metadata
                  // endpoint. Do NOT render a remote URL directly in the admin
                  // browser. Inline data-URIs are self-contained and safe to
                  // preview; everything else is shown as a download-required
                  // notice. A validated backend proxy is the future path for
                  // remote documents.
                  const isDataUri = canPreviewDocument(doc.fileUrl);
                  return (
                  <div
                    key={doc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-slate-50/50 gap-2"
                  >
                    <div>
                      <p className="font-semibold text-sm">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">Tipe: {doc.type}</p>
                      {doc.notes && (
                        <p className="text-xs text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200 mt-1 max-w-lg">
                          {doc.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {doc.fileUrl && isDataUri ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4 mr-1" /> Preview
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
                            <DialogHeader>
                              <DialogTitle>{doc.name} ({doc.type})</DialogTitle>
                            </DialogHeader>
                            <div className="mt-2 flex flex-col items-center justify-center">
                              {doc.fileUrl.startsWith("data:application/pdf") ? (
                                <iframe src={doc.fileUrl} title={doc.name} className="w-full h-[60vh] rounded border" />
                              ) : (
                                <img
                                  src={doc.fileUrl}
                                  alt={doc.name}
                                  className="max-h-[60vh] w-auto object-contain rounded border"
                                />
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : (doc.fileUrl ? (
                        <p className="text-xs text-muted-foreground bg-slate-100 border rounded p-2 max-w-xs">
                          Dokumen disimpan sebagai URL eksternal dan tidak dapat
                          dipratinjau langsung demi keamanan (anti-SSRF). Kontak
                          petugas terkait untuk memperoleh berkas.
                        </p>
                      ) : null)}
                      <Badge variant={doc.isVerified ? "default" : "secondary"}>
                        {doc.isVerified ? "Terverifikasi" : "Belum Verifikasi"}
                      </Badge>
                      <Button
                        size="sm"
                        variant={doc.isVerified ? "outline" : "default"}
                        onClick={() => handleVerifyDocument(doc.id, !doc.isVerified)}
                        disabled={!canManageDecisions || verifyDoc.isPending}
                      >
                        {doc.isVerified ? <X className="h-4 w-4 mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                        {doc.isVerified ? "Batal" : "Verifikasi"}
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground py-4">
                Belum ada berkas dokumen yang diunggah oleh pendaftar.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
