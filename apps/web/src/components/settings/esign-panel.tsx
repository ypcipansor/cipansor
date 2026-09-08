"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useEsign, type SigningKeyState } from "@/hooks/use-esign";
import { safeFormat } from "@/lib/date";
import { id as idLocale } from "date-fns/locale";
import { KeyRound, ShieldCheck, ShieldAlert, Clock, Ban } from "lucide-react";

/**
 * Pengaturan tanda tangan elektronik milik pengguna.
 *
 * Tempatnya di tab "Keamanan Akun" — yang sebelumnya hanya berisi kalimat
 * "hubungi IT Support" dan tidak melakukan apa pun.
 *
 * Passphrase tidak pernah disimpan di sisi klien. Nilainya hanya hidup di
 * dalam state formulir ini dan dibersihkan segera setelah dikirim.
 */

/** Dipakai bersama daftar kunci Super Admin, supaya istilahnya satu. */
export const STATE_LABEL: Record<SigningKeyState, string> = {
  PENDING_APPROVAL: "Menunggu persetujuan",
  ACTIVE: "Aktif",
  EXPIRING_SOON: "Akan segera berakhir",
  EXPIRED: "Kedaluwarsa",
  REVOKED: "Dicabut",
};

export function StateBadge({ state }: { state: SigningKeyState }) {
  const tone: Record<SigningKeyState, string> = {
    ACTIVE: "border-emerald-600 text-emerald-700 bg-emerald-50",
    EXPIRING_SOON: "border-amber-600 text-amber-700 bg-amber-50",
    PENDING_APPROVAL: "border-blue-600 text-blue-700 bg-blue-50",
    EXPIRED: "border-red-600 text-red-700 bg-red-50",
    REVOKED: "border-red-700 text-red-800 bg-red-100",
  };
  const Icon =
    state === "ACTIVE" ? ShieldCheck
    : state === "EXPIRING_SOON" ? Clock
    : state === "REVOKED" ? Ban
    : ShieldAlert;

  return (
    <Badge variant="outline" className={`gap-1 ${tone[state]}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {STATE_LABEL[state]}
    </Badge>
  );
}

export function EsignPanel() {
  const { status, saveIdentity, uploadKtp, requestKey, activate, changePassphrase } =
    useEsign();
  const [reason, setReason] = useState("");
  const [identityForm, setIdentityForm] = useState({
    legalName: "",
    nik: "",
    birthPlace: "",
    birthDate: "",
  });
  const [identityOpen, setIdentityOpen] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [curPass, setCurPass] = useState("");
  const [acctPass, setAcctPass] = useState("");
  const [changePass, setChangePass] = useState("");

  const s = status.data;

  if (status.isLoading) {
    return <p className="text-sm text-muted-foreground">Memuat status tanda tangan…</p>;
  }

  const fmt = (d: string | null) =>
    d ? safeFormat(new Date(d), "dd MMMM yyyy", { locale: idLocale }) : "-";

  async function submitIdentity() {
    try {
      const result = await saveIdentity.mutateAsync(identityForm);
      setIdentityOpen(false);
      // Peringatan, bukan penolakan: NIK menyandikan tanggal lahir, jadi
      // ketidakcocokan berarti salah satunya salah ketik — tetapi kekeliruan
      // pencatatan kependudukan juga ada, dan memblokirnya lebih merugikan.
      if (result?.warning) {
        toast.warning(result.warning);
      } else {
        toast.success("Data identitas tersimpan, menunggu verifikasi Super Admin.");
      }
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          "Gagal menyimpan data identitas",
      );
    }
  }

  async function submitKtp(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadKtp.mutateAsync(file);
      toast.success("Foto KTP terunggah, menunggu diperiksa Super Admin.");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message ??
          err?.response?.data?.message ??
          "Gagal mengunggah foto KTP",
      );
    } finally {
      // Supaya berkas yang sama dapat dipilih lagi setelah gagal.
      e.target.value = "";
    }
  }

  async function submitRequest() {
    try {
      await requestKey.mutateAsync(reason || undefined);
      setReason("");
      toast.success("Pengajuan terkirim, menunggu persetujuan Super Admin.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Gagal mengirim pengajuan");
    }
  }

  async function submitActivate() {
    try {
      await activate.mutateAsync(newPass);
      setNewPass("");
      toast.success("Kunci tanda tangan aktif. Simpan passphrase Anda baik-baik.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Gagal mengaktifkan kunci");
    }
  }

  async function submitChange() {
    try {
      await changePassphrase.mutateAsync({
        currentPassphrase: curPass,
        accountPassword: acctPass,
        newPassphrase: changePass,
      });
      setCurPass(""); setAcctPass(""); setChangePass("");
      toast.success("Passphrase berhasil diganti.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Gagal mengganti passphrase");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Tanda Tangan Elektronik
        </CardTitle>
        <CardDescription>
          Kunci untuk menandatangani surat keluar. Diterbitkan atas persetujuan
          Super Admin dan berlaku untuk jangka waktu tertentu.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Keadaan sekarang */}
        <div className="flex flex-wrap items-center gap-3">
          {s?.state ? <StateBadge state={s.state} /> : (
            <Badge variant="outline">Belum memiliki kunci</Badge>
          )}
          {s?.expiresAt && (
            <span className="text-sm text-muted-foreground">
              Berlaku sampai {fmt(s.expiresAt)}
              {typeof s.daysUntilExpiry === "number" && s.daysUntilExpiry >= 0 &&
                ` (${s.daysUntilExpiry} hari lagi)`}
            </span>
          )}
        </div>

        {s?.revokedReason && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            Kunci dicabut: {s.revokedReason}
          </p>
        )}
        {s?.lockedUntil && new Date(s.lockedUntil) > new Date() && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Terkunci sementara karena passphrase salah berulang kali, sampai{" "}
            {safeFormat(new Date(s.lockedUntil), "HH:mm", { locale: idLocale })}.
          </p>
        )}

        {/* Pengajuan sedang menunggu */}
        {s?.pendingRequest && (
          <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
            Pengajuan{" "}
            {s.pendingRequest.kind === "RENEWAL" ? "perpanjangan" : "penerbitan"}{" "}
            Anda sedang menunggu keputusan Super Admin.
          </p>
        )}

        {/*
          Identitas yang mendasari kunci.

          Sebuah tanda tangan elektronik mengikat kepada orang, dan ia mengikat
          hanya sejauh penerbitnya tahu siapa orang itu. Sebelumnya kunci di
          sini terbit untuk sebuah akun yang identitasnya nama dan surel — jadi
          yang dibuktikan sebuah tanda tangan adalah pengetahuan passphrase, dan
          tidak lebih.

          Ditampilkan sebelum tombol pengajuan, dengan urutan yang sama seperti
          yang harus dijalani: lengkapi, diverifikasi, baru mengajukan.
        */}
        {s?.identity && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-medium">Identitas penandatangan</Label>
              {s.identity.verifiedAt ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-600 bg-emerald-50 text-emerald-700"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Terverifikasi {fmt(s.identity.verifiedAt)}
                </Badge>
              ) : s.identity.missingFields.length === 0 ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-blue-600 bg-blue-50 text-blue-700"
                >
                  <Clock className="h-3 w-3" />
                  Menunggu verifikasi
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-600 bg-amber-50 text-amber-700"
                >
                  <ShieldAlert className="h-3 w-3" />
                  Belum lengkap
                </Badge>
              )}
            </div>

            {s.identity.missingFields.length > 0 && (
              <p className="text-sm text-amber-700">
                Lengkapi dulu {s.identity.missingFields.join(", ")} sebelum
                mengajukan kunci tanda tangan.
              </p>
            )}

            {s.identity.missingFields.length === 0 && !identityOpen && (
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Nama sesuai KTP</dt>
                  <dd className="font-medium">{s.identity.legalName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">NIK</dt>
                  {/* Tidak ditampilkan kembali: pemiliknya sudah mengetahuinya,
                      dan setiap layar yang memuatnya adalah satu salinan lagi. */}
                  <dd className="text-muted-foreground">tersimpan</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tempat lahir</dt>
                  <dd>{s.identity.birthPlace}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tanggal lahir</dt>
                  <dd>{fmt(s.identity.birthDate)}</dd>
                </div>
              </dl>
            )}

            {/*
              Foto KTP — satu-satunya jalur pembuktian.

              Dulu penyetuju dapat memilih "kartu ditunjukkan langsung" atau
              "dikenali pribadi", dan keduanya tidak meninggalkan apa pun yang
              dapat diperiksa: dapat dipilih tanpa melakukan apa pun, sehingga
              seluruh pemeriksaan menyusut menjadi sekadar klik. Ditambah lagi,
              menuntut seratusan staf lintas unit mendatangi Super Admin satu
              per satu bukan alur yang dapat dijalankan siapa pun.
            */}
            {s.identity.missingFields.length === 0 &&
              !s.identity.verifiedAt &&
              !identityOpen && (
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <Label htmlFor="ktp-file" className="text-sm">
                    Foto KTP
                  </Label>
                  {s.identity.hasKtpOnFile ? (
                    <p className="text-sm text-emerald-700">
                      Sudah diunggah{" "}
                      {s.identity.ktpUploadedAt
                        ? fmt(s.identity.ktpUploadedAt)
                        : ""}
                      . Hanya Super Admin yang dapat membukanya, dan setiap
                      pembacaan dicatat.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Diperlukan agar Super Admin dapat mencocokkan data di atas
                      dengan kartu identitas Anda.
                    </p>
                  )}
                  <Input
                    id="ktp-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={submitKtp}
                    disabled={uploadKtp.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Setelah pengajuan Anda diputuskan, berkas ini tidak lagi
                    dapat Anda buka — Anda sudah memegang kartunya, dan menutup
                    jalur ini menghapus satu jalan yang terbuka bila akun Anda
                    dibajak.
                  </p>
                </div>
              )}

            {identityOpen ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="id-name">Nama lengkap sesuai KTP</Label>
                    <Input
                      id="id-name"
                      value={identityForm.legalName}
                      onChange={(e) =>
                        setIdentityForm({ ...identityForm, legalName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="id-nik">NIK</Label>
                    <Input
                      id="id-nik"
                      inputMode="numeric"
                      placeholder="16 angka"
                      value={identityForm.nik}
                      onChange={(e) =>
                        setIdentityForm({ ...identityForm, nik: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="id-birthplace">Tempat lahir</Label>
                    <Input
                      id="id-birthplace"
                      value={identityForm.birthPlace}
                      onChange={(e) =>
                        setIdentityForm({ ...identityForm, birthPlace: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="id-birthdate">Tanggal lahir</Label>
                    <Input
                      id="id-birthdate"
                      type="date"
                      value={identityForm.birthDate}
                      onChange={(e) =>
                        setIdentityForm({ ...identityForm, birthDate: e.target.value })
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Menyimpan perubahan akan membatalkan verifikasi yang sudah ada —
                  yang dinyatakan Super Admin adalah data yang itu, bukan bahwa
                  Anda pernah diperiksa sekali.
                </p>
                <div className="flex gap-2">
                  <Button onClick={submitIdentity} disabled={saveIdentity.isPending}>
                    {saveIdentity.isPending ? "Menyimpan…" : "Simpan Identitas"}
                  </Button>
                  <Button variant="outline" onClick={() => setIdentityOpen(false)}>
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIdentityForm({
                    legalName: s.identity.legalName ?? "",
                    nik: "",
                    birthPlace: s.identity.birthPlace ?? "",
                    birthDate: s.identity.birthDate
                      ? new Date(s.identity.birthDate).toISOString().slice(0, 10)
                      : "",
                  });
                  setIdentityOpen(true);
                }}
              >
                {s.identity.missingFields.length > 0
                  ? "Lengkapi Identitas"
                  : "Ubah Identitas"}
              </Button>
            )}
          </div>
        )}

        {/* Mengajukan penerbitan / perpanjangan */}
        {!s?.pendingRequest && (s?.needsNewIssuance || s?.canRequestRenewal) && (
          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="esign-reason">
              {s.canRequestRenewal
                ? "Ajukan perpanjangan masa berlaku"
                : "Ajukan penerbitan kunci tanda tangan"}
            </Label>
            <Textarea
              id="esign-reason"
              placeholder="Alasan pengajuan (opsional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {/* Tombolnya menolak sebelum ditekan, dan mengatakan alasannya —
                server akan menolak dengan alasan yang sama, jadi menawarkan
                tombol yang pasti gagal hanya membuat orang menebak-nebak. */}
            <Button
              onClick={submitRequest}
              disabled={requestKey.isPending || !s.identity?.verifiedAt}
            >
              {requestKey.isPending ? "Mengirim…" : "Kirim Pengajuan"}
            </Button>
            {!s.identity?.verifiedAt && (
              <p className="text-xs text-muted-foreground">
                {s.identity?.missingFields.length
                  ? "Lengkapi identitas Anda terlebih dahulu."
                  : !s.identity?.hasKtpOnFile
                    ? "Unggah foto KTP Anda terlebih dahulu."
                    : "Menunggu Super Admin memverifikasi identitas Anda."}
              </p>
            )}
          </div>
        )}

        {/*
          Menetapkan passphrase — hanya setelah pengajuan benar-benar disetujui.

          Syaratnya dulu `!hasKey && !pendingRequest`, yang juga benar bagi
          orang yang belum pernah mengajukan apa pun: kotak ini muncul
          berdampingan dengan kotak "Ajukan penerbitan", dan menekan tombolnya
          selalu dijawab server dengan "Belum ada persetujuan penerbitan kunci
          tanda tangan untuk Anda". Menawarkan langkah yang pasti gagal membuat
          orang menebak urutannya sendiri.

          Kuncinya memang baru dibuat pada langkah ini, bukan saat disetujui,
          karena hanya pemiliknya yang boleh tahu passphrase-nya — server pun
          tidak menyimpannya, dan penyetuju tidak boleh pernah melewatinya.
        */}
        {s?.approvedAwaitingActivation && (
          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="esign-new">Tetapkan passphrase (minimal 12 karakter)</Label>
            <Input
              id="esign-new"
              type="password"
              autoComplete="new-password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Passphrase tanda tangan"
            />
            <p className="text-xs text-muted-foreground">
              Berbeda dari password akun. Tidak dapat dipulihkan bila lupa —
              kunci harus diterbitkan ulang.
            </p>
            <Button
              onClick={submitActivate}
              disabled={activate.isPending || newPass.length < 12}
            >
              {activate.isPending ? "Mengaktifkan…" : "Aktifkan Kunci"}
            </Button>
          </div>
        )}

        {/*
          Ganti passphrase menuntut dua bukti: passphrase lama (Anda pemilik
          kunci) dan password akun (ini benar-benar Anda, bukan sesi yang
          tertinggal terbuka). Keduanya menjawab pertanyaan berbeda.
        */}
        {s?.hasKey && s.state !== "REVOKED" && (
          <div className="space-y-3 rounded-lg border p-4">
            <Label>Ganti passphrase</Label>
            <Input
              type="password" autoComplete="current-password"
              placeholder="Passphrase saat ini"
              value={curPass} onChange={(e) => setCurPass(e.target.value)}
            />
            <Input
              type="password" autoComplete="current-password"
              placeholder="Password akun Anda"
              value={acctPass} onChange={(e) => setAcctPass(e.target.value)}
            />
            <Input
              type="password" autoComplete="new-password"
              placeholder="Passphrase baru (minimal 12 karakter)"
              value={changePass} onChange={(e) => setChangePass(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={submitChange}
              disabled={
                changePassphrase.isPending ||
                !curPass || !acctPass || changePass.length < 12
              }
            >
              {changePassphrase.isPending ? "Menyimpan…" : "Ganti Passphrase"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
