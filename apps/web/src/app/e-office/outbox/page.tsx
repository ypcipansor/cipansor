"use client";

import { Suspense } from "react";
import { LetterList } from "@/components/e-office/letter-list";
import { LetterDirection } from "@cipansor/shared";

/**
 * Buku agenda surat keluar.
 *
 * Halaman ini dahulu me-render ulang komponen inbox apa adanya, dan komponen
 * itu memulai arahnya pada INCOMING — sehingga menu "Surat Keluar" membuka
 * daftar surat masuk.
 */
export default function OutboxPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Memuat daftar surat…</div>}>
      <LetterList direction={LetterDirection.OUTGOING} />
    </Suspense>
  );
}
