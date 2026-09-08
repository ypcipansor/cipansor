"use client";

/**
 * Pemakaian dan taksiran biaya asisten publik bulan berjalan.
 *
 * Sebelum kartu ini, angka-angka tersebut hanya keluar lewat surat peringatan
 * bulanan — yang berarti "sudah terpakai berapa?" tidak dapat dijawab siapa pun
 * sampai ambang pertama terlewati, dan jawabannya sudah terlambat.
 *
 * Aturan yang dipegang di sini: **taksiran tidak boleh tampil seperti tagihan.**
 * Setiap bendera dari server dinyatakan sebagai kalimat, bukan disembunyikan —
 * yang tak terukur membuat angkanya kurang, cache yang tak dilaporkan membuatnya
 * lebih, dan keduanya bisa berlaku sekaligus. Riwayat sistem ini penuh dengan
 * angka yang terdengar pasti padahal dikarang; kartu ini tidak menambah satu
 * lagi.
 */

import { Coins, TriangleAlert, Info } from "lucide-react";
import { useChatbotUsage } from "@/hooks/use-chatbot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function angka(n: number): string {
  return n.toLocaleString("id-ID");
}

/**
 * Uang, dengan cukup angka di belakang koma untuk tidak berbohong.
 *
 * Dua desimal membuat pemakaian awal bulan — yang memang beberapa perseribu
 * dolar — tampil sebagai `USD 0.00`, dan itu terbaca sebagai "gratis" alih-alih
 * "sangat kecil". Di bawah satu sen, angkanya ditampilkan apa adanya.
 */
function uang(amount: number, currency: string): string {
  if (amount > 0 && amount < 0.01) return `${currency} ${amount.toFixed(4)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

/** Empat angka penting, satu bentuk. */
function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ChatbotUsageCard() {
  const { data, isLoading, isError } = useChatbotUsage();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pemakaian bulan ini</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pemakaian bulan ini</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Angka pemakaian tidak dapat dimuat. Ini kegagalan pembacaan, bukan
          pertanda pemakaiannya nol.
        </CardContent>
      </Card>
    );
  }

  const { cost } = data;
  const persen = data.percentOfBudget;
  const melewatiAmbang = persen !== null && persen >= 80;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Coins className="h-4 w-4" />
          Pemakaian bulan ini
          <span className="text-xs font-normal text-muted-foreground">
            {data.monthKey} · WIB
          </span>
          {persen !== null && (
            <Badge
              variant={melewatiAmbang ? "destructive" : "outline"}
              className="ml-auto tabular-nums"
            >
              {persen.toFixed(1)}% dari anggaran
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Pertanyaan" value={angka(data.requests)} />
          <Tile
            label="Token masuk"
            value={angka(data.promptTokens)}
            hint={
              data.cachedPromptTokens > 0
                ? `${angka(data.cachedPromptTokens)} dari cache`
                : undefined
            }
          />
          <Tile label="Token keluar" value={angka(data.completionTokens)} />
          <Tile
            label="Taksiran biaya"
            value={
              cost.priced
                ? uang(cost.amount, cost.currency)
                : "belum berharga"
            }
            hint={
              data.monthlyBudget > 0
                ? `anggaran ${cost.currency} ${data.monthlyBudget}`
                : "anggaran belum diatur"
            }
          />
        </div>

        {/* Arah kemelesetan dinyatakan, bukan disembunyikan. */}
        <div className="space-y-2 text-sm">
          {!cost.priced && (
            <p className="flex gap-2 text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Harga token belum diisi, jadi biayanya belum bisa dihitung sama
                sekali. Isi <code>CHATBOT_PRICE_INPUT_PER_MTOK</code> dan{" "}
                <code>CHATBOT_PRICE_OUTPUT_PER_MTOK</code> di <code>.env</code>,
                lalu muat ulang kontainer API.
              </span>
            </p>
          )}

          {cost.priced && cost.cacheUnreported && (
            <p className="flex gap-2 text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Penyedia tidak melaporkan token yang dilayani dari cache-nya,
                sehingga seluruh token masuk dihitung pada tarif penuh. Angka di
                atas karena itu <strong>batas atas</strong> — biaya sebenarnya
                lebih rendah, tidak lebih tinggi.
              </span>
            </p>
          )}

          {cost.priced && cost.incomplete && (
            <p className="flex gap-2 text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {angka(data.unmeteredRequests)} panggilan berhasil tanpa laporan
                token, jadi biayanya tidak ikut terhitung. Sejauh itu, angka di
                atas <strong>kurang</strong> dari yang sebenarnya.
              </span>
            </p>
          )}

          <p className={cn("text-xs text-muted-foreground")}>
            Diperiksa otomatis tiap hari pukul 07.00 WIB; peringatan dikirim ke{" "}
            <strong>{data.alertTo}</strong> pada 50%, 80% dan 100% anggaran,
            masing-masing sekali per bulan.
          </p>
        </div>

        {data.byModel.length > 1 && (
          <div className="border-t border-border pt-3 text-sm">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Per model
            </p>
            <ul className="space-y-1">
              {data.byModel.map((m) => (
                <li key={m.model} className="flex justify-between gap-4">
                  <span className="truncate">{m.model}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {angka(m.requests)} pertanyaan ·{" "}
                    {angka(m.promptTokens + m.completionTokens)} token
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
