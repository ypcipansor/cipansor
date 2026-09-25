"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Tautan lama ke halaman verifikasi internal.
 *
 * Verifikasi keputusan kini publik (`/public/verify-decision`) supaya pemindai
 * QR anonim tidak dilempar ke layar login staf. Halaman ini hanya meneruskan
 * tautan lama — termasuk yang tersemat pada risalah yang sudah dicetak — ke
 * alamat publik itu, dengan tokennya utuh.
 */
function RedirectToPublic() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  useEffect(() => {
    const target = token
      ? `/public/verify-decision?token=${encodeURIComponent(token)}`
      : "/public/verify-decision";
    router.replace(target);
  }, [router, token]);

  return (
    <main
      id="main-content"
      className="p-8 text-center text-sm text-muted-foreground"
    >
      Mengalihkan ke halaman verifikasi publik…
    </main>
  );
}

export default function VerifyFoundationDecisionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Memuat…</div>}>
      <RedirectToPublic />
    </Suspense>
  );
}
