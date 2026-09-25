"use client";

import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Save, SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_FOUNDATION_RULE,
  FOUNDATION_DECISION_KINDS,
  FOUNDATION_ORGAN_TYPES,
  FOUNDATION_QUORUM_MODES,
  quorumValueForMode,
  type FoundationDecisionKind,
  type FoundationOrganType,
  type FoundationQuorumMode,
} from "@cipansor/shared";
import {
  FOUNDATION_KIND_LABEL,
  FOUNDATION_ORGAN_LABEL,
  useFoundationRules,
  useUpsertFoundationRule,
} from "@/hooks/use-foundation-decisions";
import { AccessDenied } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth";
import { getActiveRoleCodes } from "@/lib/rbac";
import { userCanManageFoundationRules } from "@/lib/yayasan-organ";

const QUORUM_MODE_LABEL: Record<FoundationQuorumMode, string> = {
  MUTLAK: "Mutlak (seluruh kolam)",
  MAJORITY: "Mayoritas (> setengah)",
  TWO_THIRDS: "Dua pertiga",
  THREE_QUARTERS: "Tiga perempat",
};

interface RuleFormState {
  quorumPresentMode: FoundationQuorumMode;
  quorumPresentValue: number;
  quorumDecisionMode: FoundationQuorumMode;
  quorumDecisionValue: number;
}

/**
 * Halaman pengelolaan aturan kuorum (SUPER_ADMIN).
 *
 * Menutup celah "hook tanpa halaman": `useFoundationRules`/`useUpsertFoundationRule`
 * dulu diekspor tetapi tak satu pun halaman memakainya, sehingga override
 * Anggaran Dasar yang endpoint-nya sudah ada tak dapat dikonfigurasi siapa pun.
 *
 * Nilai awal diambil dari `DEFAULT_FOUNDATION_RULE` di `@cipansor/shared` — sumber
 * yang sama dengan `loadRule` API — sehingga yang ditampilkan benar-benar ambang
 * yang sedang berlaku ketika aturan (organ × cara) belum disimpan.
 */
export default function FoundationRulesPage() {
  // Halaman ini khusus SUPER_ADMIN (endpoint GET/PUT /foundation/rules memakai
  // isSuperAdmin). Sebelumnya ia langsung memanggil hook, sehingga pengguna
  // yayasan non-admin yang mengetik URL langsung tetap mengirim permintaan yang
  // pasti 403 dan hanya melihat form kosong + toast. Gerbang ini hanyalah UX —
  // otorisasi backend tetap boundary utama.
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  // SUPER_ADMIN sebagai peran AKTIF mana pun (primary atau sekunder), selaras
  // dengan `authorizeAnyRole(SUPER_ADMIN)` di rute. Membaca peran primer saja
  // menyembunyikan halaman ini dari admin yang peran utamanya bukan SUPER_ADMIN.
  const isSuperAdmin = userCanManageFoundationRules(getActiveRoleCodes(user));

  // Tahan query sampai status auth siap DAN peran terbukti SUPER_ADMIN, agar
  // permintaan yang pasti gagal tidak pernah dikirim.
  const { data: rules, isLoading } = useFoundationRules({
    enabled: isSuperAdmin,
  });
  const upsert = useUpsertFoundationRule();

  const [organType, setOrganType] = useState<FoundationOrganType>("PEMBINA");
  const [kind, setKind] = useState<FoundationDecisionKind>("CIRCULAR");
  const [form, setForm] = useState<RuleFormState>(() => {
    const d = DEFAULT_FOUNDATION_RULE.CIRCULAR;
    return {
      quorumPresentMode: d.quorumPresentMode,
      quorumPresentValue: d.quorumPresentValue,
      quorumDecisionMode: d.quorumDecisionMode,
      quorumDecisionValue: d.quorumDecisionValue,
    };
  });
  const [saved, setSaved] = useState(false);

  const stored = rules?.find(
    (r) => r.organType === organType && r.decisionKind === kind,
  );

  // Sirkuler WAJIB mufakat: server menolak mode lain (kontrak Zod + service),
  // jadi form pun tidak boleh menawarkannya. Ini penegakan UX yang mencerminkan
  // boundary peladen — bukan sekadar menyembunyikan opsi.
  const circularLocked = kind === "CIRCULAR";

  // Muat nilai tersimpan (atau default legal) setiap kali pilihan berubah.
  //
  // `organType` WAJIB ada di daftar dependensi. `stored` sendiri tidak cukup:
  // ia `undefined` baik untuk "organ ini belum punya aturan" maupun untuk
  // "masih memuat", dan berpindah antara DUA organ yang dua-duanya belum
  // punya aturan tidak mengubah identitas `stored` (sama-sama `undefined`) —
  // sehingga tanpa `organType` efek tak berjalan dan suntingan yang belum
  // disimpan dari organ sebelumnya tertinggal di form, lalu tersimpan ke
  // organ yang baru.
  useEffect(() => {
    setSaved(false);
    if (stored) {
      setForm({
        quorumPresentMode: stored.quorumPresentMode,
        quorumPresentValue: stored.quorumPresentValue,
        quorumDecisionMode: stored.quorumDecisionMode,
        quorumDecisionValue: stored.quorumDecisionValue,
      });
      return;
    }
    const d = DEFAULT_FOUNDATION_RULE[kind];
    setForm({
      quorumPresentMode: d.quorumPresentMode,
      quorumPresentValue: d.quorumPresentValue,
      quorumDecisionMode: d.quorumDecisionMode,
      quorumDecisionValue: d.quorumDecisionValue,
    });
  }, [stored, kind, organType]);

  /**
   * Mode yang boleh dipilih untuk pasangan organ × cara saat ini.
   *
   * Untuk sirkuler hanya MUTLAK: mengunci di UI mencegah pengguna memilih mode
   * yang submission-nya pasti ditolak, dan sekaligus menjelaskan mengapa.
   */
  const selectableModes = circularLocked
    ? (["MUTLAK"] as FoundationQuorumMode[])
    : FOUNDATION_QUORUM_MODES;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await upsert.mutateAsync({ organType, decisionKind: kind, ...form });
    setSaved(true);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Aturan Kuorum Organ"
          description="Ambang kuorum per organ dan cara pengambilan keputusan. Nilai ini menggantikan default Anggaran Dasar."
        />

        {authLoading && !user ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !isAuthenticated || !isSuperAdmin ? (
          <AccessDenied
            title="Akses Ditolak"
            description="Pengaturan aturan kuorum hanya dapat diakses oleh Super Admin."
          />
        ) : isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SlidersHorizontal className="h-4 w-4" /> Pilih Organ & Cara
                  </CardTitle>
                  <CardDescription>
                    Aturan disimpan per pasangan organ × cara keputusan.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Organ</Label>
                    <Select
                      value={organType}
                      onValueChange={(v) =>
                        setOrganType(v as FoundationOrganType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOUNDATION_ORGAN_TYPES.map((o) => (
                          <SelectItem key={o} value={o}>
                            {FOUNDATION_ORGAN_LABEL[o]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cara Keputusan</Label>
                    <Select
                      value={kind}
                      onValueChange={(v) =>
                        setKind(v as FoundationDecisionKind)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOUNDATION_DECISION_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {FOUNDATION_KIND_LABEL[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {FOUNDATION_ORGAN_LABEL[organType]} ·{" "}
                    {FOUNDATION_KIND_LABEL[kind]}
                  </CardTitle>
                  <CardDescription>
                    {stored
                      ? "Menggunakan aturan tersimpan."
                      : "Belum ada aturan tersimpan — menampilkan default Anggaran Dasar."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={onSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Mode Kuorum Hadir</Label>
                        <Select
                          value={form.quorumPresentMode}
                          disabled={circularLocked}
                          onValueChange={(v) => {
                            const mode = v as FoundationQuorumMode;
                            setForm((f) => ({
                              ...f,
                              quorumPresentMode: mode,
                              // Nilai DITURUNKAN dari mode, bukan diketik bebas.
                              // Nilai bebas pernah dapat bertentangan dengan
                              // labelnya (TWO_THIRDS dengan 0.5), sehingga ambang
                              // yang benar-benar berlaku tak dapat diketahui dari
                              // nama modenya.
                              quorumPresentValue: quorumValueForMode(mode),
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selectableModes.map((m) => (
                              <SelectItem key={m} value={m}>
                                {QUORUM_MODE_LABEL[m]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Ambang Kuorum Hadir</Label>
                        <Input
                          readOnly
                          value={`${form.quorumPresentMode} · ${form.quorumPresentValue.toFixed(2)}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Mode Kuorum Sah</Label>
                        <Select
                          value={form.quorumDecisionMode}
                          disabled={circularLocked}
                          onValueChange={(v) => {
                            const mode = v as FoundationQuorumMode;
                            setForm((f) => ({
                              ...f,
                              quorumDecisionMode: mode,
                              quorumDecisionValue: quorumValueForMode(mode),
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selectableModes.map((m) => (
                              <SelectItem key={m} value={m}>
                                {QUORUM_MODE_LABEL[m]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Ambang Kuorum Sah</Label>
                        <Input
                          readOnly
                          value={`${form.quorumDecisionMode} · ${form.quorumDecisionValue.toFixed(2)}`}
                        />
                      </div>
                    </div>
                    {circularLocked && (
                      <p className="text-xs text-muted-foreground">
                        Keputusan sirkuler hanya sah bila diambil dengan mufakat
                        (mutlak): cara lain dikunci oleh sistem.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="submit" disabled={upsert.isPending}>
                        <Save className="mr-2 h-4 w-4" /> Simpan Aturan
                      </Button>
                      {saved && (
                        <span className="text-sm text-emerald-600">
                          Aturan tersimpan.
                        </span>
                      )}
                      {upsert.isError && (
                        <span className="text-sm text-destructive">
                          Gagal menyimpan aturan.
                        </span>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aturan Tersimpan</CardTitle>
                <CardDescription>
                  Hanya pasangan organ × cara yang sudah dikonfigurasi.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organ</TableHead>
                      <TableHead>Cara</TableHead>
                      <TableHead>Kuorum Hadir</TableHead>
                      <TableHead>Kuorum Sah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">
                          Memuat…
                        </TableCell>
                      </TableRow>
                    ) : (rules?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground"
                        >
                          Belum ada aturan tersimpan.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rules?.map((r) => (
                        <TableRow
                          key={r.id ?? `${r.organType}-${r.decisionKind}`}
                        >
                          <TableCell>
                            {FOUNDATION_ORGAN_LABEL[r.organType]}
                          </TableCell>
                          <TableCell>
                            {FOUNDATION_KIND_LABEL[r.decisionKind]}
                          </TableCell>
                          <TableCell>
                            {r.quorumPresentMode} · {r.quorumPresentValue}
                          </TableCell>
                          <TableCell>
                            {r.quorumDecisionMode} · {r.quorumDecisionValue}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
