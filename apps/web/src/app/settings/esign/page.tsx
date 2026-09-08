"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { useEsignRequests } from "@/hooks/use-esign";
import { authFileUrl } from "@/lib/files";
import { EsignKeyInventory } from "@/components/settings/esign-key-inventory";
import { safeFormat } from "@/lib/date";
import { id as idLocale } from "date-fns/locale";
import { ShieldCheck, Clock, BadgeCheck, TriangleAlert, FileImage } from "lucide-react";

/**
 * Antrean persetujuan kunci tanda tangan elektronik — kewenangan Super Admin.
 *
 * Kunci tidak diterbitkan sendiri oleh penggunanya: ia diajukan, lalu disetujui
 * di sini, dan yang menyetujui sekaligus menentukan berapa lama kunci itu
 * berlaku. Masa berlaku ditentukan per persetujuan, bukan konstanta global,
 * supaya yang memberi wewenang menandatangani juga menanggung keputusan berapa
 * lama wewenang itu berlaku.
 *
 * Server tetap memeriksa kewenangan (isSuperAdmin) dan rentang masa berlaku;
 * halaman ini hanya menampilkan pilihan yang sah, tidak menegakkannya.
 */

const DEFAULT_DAYS = 365;
const MIN_DAYS = 30;
const MAX_DAYS = 730;

const KIND_LABEL: Record<string, string> = {
  ENROLLMENT: "Penerbitan",
  RENEWAL: "Perpanjangan",
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "border-blue-600 text-blue-700 bg-blue-50",
  APPROVED: "border-emerald-600 text-emerald-700 bg-emerald-50",
  REJECTED: "border-red-600 text-red-700 bg-red-50",
};

export default function EsignRequestsPage() {
  const { requests, decide } = useEsignRequests();
  const [days, setDays] = useState<Record<string, number>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [idNote, setIdNote] = useState<Record<string, string>>({});

  const rows: any[] = requests.data ?? [];
  const pending = rows.filter((r) => r.status === "PENDING");
  const decided = rows.filter((r) => r.status !== "PENDING");

  async function submit(id: string, approve: boolean, needsIdentity: boolean) {
    try {
      await decide.mutateAsync({
        id,
        approve,
        grantedDays: approve ? (days[id] ?? DEFAULT_DAYS) : undefined,
        note: note[id] || undefined,
        // Hanya ikut ketika menyetujui identitas yang belum pernah
        // diverifikasi. Menolak tidak menuntut apa pun: yang ditolak tidak
        // menerbitkan kunci.
        identityVerification:
          approve && needsIdentity ? { note: idNote[id] || undefined } : undefined,
      });
      toast.success(approve ? "Pengajuan disetujui." : "Pengajuan ditolak.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Gagal memproses pengajuan");
    }
  }

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN"]}>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Tanda Tangan Elektronik
          </h1>
          <p className="text-sm text-muted-foreground">
            Menyetujui penerbitan dan perpanjangan kunci tanda tangan beserta
            masa berlakunya, dan mencabutnya bila perlu.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Menunggu keputusan ({pending.length})
            </CardTitle>
            <CardDescription>
              Masa berlaku {MIN_DAYS}–{MAX_DAYS} hari. Batas atas ada supaya
              persetujuan tidak diam-diam menjadi wewenang seumur hidup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {requests.isLoading && (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            )}
            {!requests.isLoading && pending.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Tidak ada pengajuan yang menunggu.
              </p>
            )}

            {pending.map((r) => {
              const identity = r.user?.identity ?? null;
              const missing = [
                [identity?.legalName, "nama lengkap sesuai KTP"],
                [identity?.nik, "NIK"],
                [identity?.birthPlace, "tempat lahir"],
                [identity?.birthDate, "tanggal lahir"],
              ]
                .filter(([v]) => !v)
                .map(([, label]) => label as string);
              const needsIdentity = !identity?.verifiedAt;
              // Tanpa berkasnya, tidak ada yang dapat dicocokkan — dan
              // menyetujui tanpa mencocokkan bukan verifikasi.
              const hasKtp = !!identity?.ktpUploadedAt && !identity?.ktpDeletedAt;
              const canApprove = missing.length === 0 && (!needsIdentity || hasKtp);

              return (
              <div key={r.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.user?.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.user?.email}
                  </span>
                  <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {safeFormat(new Date(r.createdAt), "dd MMM yyyy HH:mm", {
                      locale: idLocale,
                    })}
                  </span>
                </div>

                {r.reason && (
                  <p className="rounded-md bg-muted/50 p-3 text-sm">{r.reason}</p>
                )}

                {/*
                  Identitas pemohon — inilah yang sesungguhnya diputuskan.

                  Menyetujui sebuah pengajuan berarti menyatakan bahwa akun ini
                  benar-benar orang yang diakuinya. Data itu harus terlihat di
                  layar yang sama dengan tombolnya; menyetujui tanpa melihat
                  siapa yang disetujui bukan verifikasi, hanya persetujuan.
                */}
                <div className="rounded-md border border-dashed p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Identitas pemohon
                  </p>
                  {missing.length > 0 ? (
                    <p className="flex items-start gap-2 text-sm text-amber-700">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Belum lengkap: {missing.join(", ")}. Minta pemohon
                      melengkapinya sebelum kunci dapat diterbitkan.
                    </p>
                  ) : (
                    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Nama sesuai KTP
                        </dt>
                        <dd className="font-medium">{identity.legalName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">NIK</dt>
                        <dd className="font-medium tabular-nums">
                          {identity.nik}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Tempat lahir
                        </dt>
                        <dd>{identity.birthPlace}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Tanggal lahir
                        </dt>
                        <dd>
                          {safeFormat(
                            new Date(identity.birthDate),
                            "dd MMMM yyyy",
                            { locale: idLocale },
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}

                  {identity?.verifiedAt && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                      <BadgeCheck className="h-4 w-4" />
                      Sudah diverifikasi
                      {identity.verifiedBy?.name
                        ? ` oleh ${identity.verifiedBy.name}`
                        : ""}{" "}
                      pada{" "}
                      {safeFormat(
                        new Date(identity.verifiedAt),
                        "dd MMM yyyy",
                        { locale: idLocale },
                      )}
                      {identity.verificationNote
                        ? ` — ${identity.verificationNote}`
                        : ""}
                    </p>
                  )}
                </div>

                {/*
                  Cara pemeriksaannya, ditanyakan hanya sekali — saat identitas
                  ini pertama dinyatakan benar. Jawabannya adalah artefak yang
                  lestari: ia menjawab "atas dasar apa kunci ini terbit"
                  bertahun-tahun kemudian.
                */}
                {/*
                  Foto KTP-nya, dan pernyataan bahwa ia sudah dibuka.

                  Tidak ada lagi pilihan *cara*: dua dari tiga pilihan lama —
                  "ditunjukkan langsung" dan "dikenali pribadi" — tidak
                  meninggalkan apa pun yang dapat diperiksa, sehingga dapat
                  dipilih tanpa melakukan apa pun. Yang tersisa satu jalur, dan
                  jalur itu meninggalkan berkas beserta hash-nya.
                */}
                {missing.length === 0 && needsIdentity && (
                  <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                    <p className="text-xs font-medium text-amber-900">
                      Identitas ini belum diverifikasi. Buka foto KTP-nya,
                      cocokkan dengan data di atas, lalu nyatakan kecocokannya.
                    </p>

                    {hasKtp ? (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={authFileUrl(
                            `/api/esign/identities/${r.user.id}/ktp`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileImage className="mr-2 h-4 w-4" />
                          Buka Foto KTP
                        </a>
                      </Button>
                    ) : (
                      <p className="flex items-start gap-2 text-sm text-amber-800">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        Pemohon belum mengunggah foto KTP, sehingga tidak ada
                        yang dapat dicocokkan.
                      </p>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor={`idnote-${r.id}`}>
                        Keterangan pemeriksaan (opsional)
                      </Label>
                      <Input
                        id={`idnote-${r.id}`}
                        className="bg-white"
                        placeholder="mis. NIK dan nama cocok; foto jelas terbaca"
                        value={idNote[r.id] ?? ""}
                        onChange={(e) =>
                          setIdNote({ ...idNote, [r.id]: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`days-${r.id}`}>Masa berlaku (hari)</Label>
                    <Input
                      id={`days-${r.id}`}
                      type="number"
                      min={MIN_DAYS}
                      max={MAX_DAYS}
                      value={days[r.id] ?? DEFAULT_DAYS}
                      onChange={(e) =>
                        setDays({ ...days, [r.id]: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`note-${r.id}`}>Catatan (opsional)</Label>
                    <Textarea
                      id={`note-${r.id}`}
                      value={note[r.id] ?? ""}
                      onChange={(e) =>
                        setNote({ ...note, [r.id]: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => submit(r.id, true, needsIdentity)}
                    disabled={decide.isPending || !canApprove}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Setujui
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => submit(r.id, false, needsIdentity)}
                    disabled={decide.isPending}
                  >
                    Tolak
                  </Button>
                  {!canApprove && (
                    <span className="text-xs text-muted-foreground">
                      {missing.length > 0
                        ? "Persetujuan terkunci sampai identitas pemohon lengkap."
                        : "Persetujuan terkunci sampai pemohon mengunggah foto KTP."}
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Menerbitkan dan mencabut adalah dua sisi wewenang yang sama, jadi
            keduanya berada di halaman yang sama. Sebelumnya rute pencabutan
            tidak dipanggil dari mana pun. */}
        <EsignKeyInventory />

        {decided.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Riwayat keputusan</CardTitle>
              <CardDescription>
                Catatan siapa memberi wewenang menandatangani, kapan, dan untuk
                berapa lama.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {decided.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm last:border-0"
                >
                  <span className="font-medium">{r.user?.name}</span>
                  <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                  <Badge variant="outline" className={STATUS_TONE[r.status]}>
                    {r.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                  </Badge>
                  {r.grantedDays && (
                    <span className="text-muted-foreground">
                      {r.grantedDays} hari
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {r.decidedBy?.name ?? "-"} ·{" "}
                    {r.decidedAt
                      ? safeFormat(new Date(r.decidedAt), "dd MMM yyyy", {
                          locale: idLocale,
                        })
                      : "-"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
