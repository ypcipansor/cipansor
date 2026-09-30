"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTwoFactorStatus } from "@/hooks/use-two-factor-status";
import {
  clearTwoFactorInvite,
  hasTwoFactorInvite,
} from "@/lib/two-factor-invite";
import { useAuthStore } from "@/stores/auth";

/** The marker changes only through this component: nothing to subscribe to. */
const subscribeToNothing = () => () => {};

/**
 * Right after a password sign-in, invite educators, staff and wali santri to
 * turn on verifikasi dua langkah (decided 2026-09-28). "Nanti saja" has no
 * limit and asks nothing more; the invitation returns at the next sign-in until
 * 2FA is on. Who is invited is the API's answer (`isInvited`), never a role
 * list kept here.
 */
export function TwoFactorInvite() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id);
  // The marker is in sessionStorage: read in the browser, absent on the server.
  const marked = useSyncExternalStore(
    subscribeToNothing,
    hasTwoFactorInvite,
    () => false,
  );
  const [answered, setAnswered] = useState(false);
  const pending = marked && !answered;

  const { data } = useTwoFactorStatus(userId, pending);

  // Not invited (a santri, 2FA already on, or mandatory): forget the marker,
  // so the pages that follow do not ask the API again.
  useEffect(() => {
    if (data && !data.isInvited) clearTwoFactorInvite();
  }, [data]);

  const answer = (enableNow: boolean) => {
    clearTwoFactorInvite();
    setAnswered(true);
    if (enableNow) router.push("/profile?tab=security");
  };

  return (
    <Dialog
      open={pending && !!data?.isInvited}
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {/* Left-aligned at every width: two paragraphs to read, not a
            one-line alert, and the second one sits outside the header. */}
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Lindungi akun Anda
          </DialogTitle>
          <DialogDescription>
            Aktifkan verifikasi dua langkah: sesudah kata sandi, Anda memasukkan
            kode 6 angka dari aplikasi autentikator di ponsel (Google
            Authenticator, Microsoft Authenticator, atau sejenisnya). Orang yang
            mengetahui kata sandi Anda tetap tidak bisa masuk tanpa ponsel Anda.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Memasangnya sekitar dua menit. Ajakan ini muncul lagi setiap Anda
          masuk, sampai verifikasi dua langkah aktif.
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => answer(false)}>
            Nanti saja
          </Button>
          <Button onClick={() => answer(true)}>Aktifkan sekarang</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
