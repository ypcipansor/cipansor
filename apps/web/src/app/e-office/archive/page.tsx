"use client";

import { Suspense, useState } from "react";
import { LetterList } from "@/components/e-office/letter-list";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LetterDirection, LetterStatus } from "@cipansor/shared";

/**
 * Arsip surat — naskah yang perjalanannya sudah selesai.
 *
 * Halaman ini tidak ada sebelumnya. Beranda e-office punya kartu "Arsip Surat"
 * yang memanggil `router.push("/e-office/archive")`, dan rutenya tidak pernah
 * dibuat: setiap kali ditekan, pengguna mendarat di halaman 404. Penjaga tautan
 * mati (`lib/dead-links.test.ts`) tidak melihatnya karena ia hanya memindai
 * atribut `href`, bukan `router.push` — dan itu pun sudah diperbaiki bersama
 * halaman ini.
 */
function ArchiveContent() {
  const [direction, setDirection] = useState<LetterDirection>(LetterDirection.INCOMING);

  return (
    <div>
      <div className="px-6 pt-6">
        <Tabs value={direction} onValueChange={(v) => setDirection(v as LetterDirection)}>
          <TabsList>
            <TabsTrigger value={LetterDirection.INCOMING}>Surat masuk</TabsTrigger>
            <TabsTrigger value={LetterDirection.OUTGOING}>Surat keluar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <LetterList
        key={direction}
        direction={direction}
        fixedStatus={LetterStatus.ARCHIVED}
        hideCrossLink
        heading={{
          title: "Arsip Surat",
          lead: "Naskah yang sudah diarsipkan — perjalanannya selesai dan disimpan sebagai rujukan.",
        }}
      />
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Memuat arsip…</div>}>
      <ArchiveContent />
    </Suspense>
  );
}
