"use client";

import { useState } from "react";
import { LetterCcInput, CorrespondenceParticipant } from "@cipansor/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

/**
 * Daftar tembusan yang bisa disusun: ditambah, dihapus, dan dipindah urutannya.
 *
 * Dulu ini sebuah daftar centang berisi pengguna sistem, dan itu keliru dalam
 * dua hal sekaligus. Tembusan naskah dinas kerap ditujukan kepada pihak yang
 * tidak punya akun di sini sama sekali — Kepala KUA, Ketua RW, dinas terkait —
 * sehingga separuh tembusan yang sesungguhnya tidak dapat dituliskan. Dan
 * daftar centang tidak punya urutan: tembusan tercetak sebagai daftar bernomor,
 * dan nomornya lazim menurun menurut kedudukan, dengan pihak dalam dan luar
 * berselang-seling. Urutan centang mengikuti urutan daftar pencarian, yang
 * tidak ada hubungannya dengan itu.
 *
 * Bedanya nyata, bukan soal tampilan: tembusan **internal** benar-benar
 * terkirim — penerimanya mendapat pemberitahuan dan dapat membuka suratnya —
 * sedangkan tembusan **eksternal** hanya tercetak, dan pengantarannya di luar
 * sistem. Itu dikatakan di sini, bukan disimpan sebagai kejutan.
 */

interface TembusanEditorProps {
  value: LetterCcInput[];
  onChange: (next: LetterCcInput[]) => void;
  participants: CorrespondenceParticipant[];
  search: string;
  onSearchChange: (q: string) => void;
  disabled?: boolean;
}

export function TembusanEditor({
  value,
  onChange,
  participants,
  search,
  onSearchChange,
  disabled = false,
}: TembusanEditorProps) {
  const [pendingType, setPendingType] = useState<"INTERNAL" | "EXTERNAL">(
    "INTERNAL",
  );
  const [pendingExternal, setPendingExternal] = useState("");

  const nameOf = (row: LetterCcInput): string => {
    if (row.externalName) return row.externalName;
    const p = participants.find((u) => u.id === row.userId);
    return p ? (p.nip ? `${p.name} (${p.nip})` : p.name) : "Pengguna terpilih";
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  };

  const addInternal = (userId: string) => {
    if (value.some((r) => r.userId === userId)) return;
    onChange([...value, { userId }]);
  };

  const addExternal = () => {
    const name = pendingExternal.trim();
    if (!name) return;
    // Perbandingan tanpa memperhatikan huruf besar-kecil: server menolak
    // duplikat dengan aturan yang sama, dan menawarkan baris yang akan
    // dibuang diam-diam adalah menjanjikan sesuatu yang tidak terjadi.
    if (
      value.some(
        (r) => r.externalName?.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      return;
    }
    onChange([...value, { externalName: name }]);
    setPendingExternal("");
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      {value.length > 0 && (
        <ol className="space-y-2">
          {value.map((row, index) => (
            <li
              key={row.userId ?? `ext-${row.externalName}-${index}`}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
            >
              <span className="w-5 shrink-0 text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <span className="min-w-0 flex-1 truncate">{nameOf(row)}</span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  row.userId
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {row.userId ? "Internal" : "Eksternal"}
              </span>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Naikkan ${nameOf(row)}`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Turunkan ${nameOf(row)}`}
                  disabled={disabled || index === value.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600 hover:text-red-700"
                  aria-label={`Hapus ${nameOf(row)}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Belum ada tembusan. Naskah dicetak tanpa daftar tembusan.
        </p>
      )}

      <div className="space-y-2 border-t pt-3">
        <Select
          value={pendingType}
          onValueChange={(v) => setPendingType(v as "INTERNAL" | "EXTERNAL")}
          disabled={disabled}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INTERNAL">
              Pengguna sistem — dikirim otomatis
            </SelectItem>
            <SelectItem value="EXTERNAL">
              Pihak luar — hanya tercetak pada naskah
            </SelectItem>
          </SelectContent>
        </Select>

        {pendingType === "INTERNAL" ? (
          <div className="space-y-2">
            <Input
              // Sengaja tidak "Cari pejabat/staf..." — formulir pembuatan surat
              // sudah memakai kalimat itu untuk pemeriksa, dan dua kotak cari
              // berbunyi sama pada satu halaman membuat penyusun menebak yang
              // mana yang mencari apa.
              placeholder="Cari penerima tembusan..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="text-xs"
              disabled={disabled}
            />
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {participants.map((u) => {
                const already = value.some((r) => r.userId === u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={disabled || already}
                    onClick={() => addInternal(u.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span className="min-w-0 truncate">
                      {u.nip ? `${u.name} (${u.nip})` : u.name}
                    </span>
                  </button>
                );
              })}
              {participants.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Tidak ada yang cocok.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Contoh: Kepala KUA Kecamatan Cipansor"
              value={pendingExternal}
              onChange={(e) => setPendingExternal(e.target.value)}
              onKeyDown={(e) => {
                // Enter menambah barisnya, bukan mengirim formulir surat.
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExternal();
                }
              }}
              className="text-sm"
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addExternal}
              disabled={disabled || !pendingExternal.trim()}
            >
              Tambah
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
