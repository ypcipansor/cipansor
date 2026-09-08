"use client";

import { Suspense } from "react";
import { LetterList } from "@/components/e-office/letter-list";
import { LetterDirection } from "@cipansor/shared";

/**
 * Buku agenda surat masuk.
 *
 * Arahnya ditentukan rute, bukan state di dalam komponen — lihat
 * `components/e-office/letter-list.tsx` untuk sebabnya.
 */
export default function InboxPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Memuat daftar surat…</div>}>
      <LetterList direction={LetterDirection.INCOMING} />
    </Suspense>
  );
}
