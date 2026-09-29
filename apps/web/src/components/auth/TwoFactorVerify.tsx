"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// The API decides whether a code matches; here we only refuse an empty field.
// Six digits or a ten-character recovery code, with or without spaces.
const verifySchema = z.object({
  token: z.string().trim().min(1, "Masukkan kodenya"),
});

type VerifyForm = z.infer<typeof verifySchema>;

interface TwoFactorVerifyProps {
  onVerify: (token: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  /**
   * The sign-in step also takes a recovery code, for someone who cannot open
   * their authenticator app. Turning 2FA off, for oneself or for another user,
   * takes the authenticator code only.
   */
  allowRecoveryCode?: boolean;
  submitLabel?: string;
}

/**
 * The code field of every two-factor prompt. It has no heading of its own:
 * the card or dialog around it names the step.
 */
export function TwoFactorVerify({
  onVerify,
  isLoading,
  error,
  allowRecoveryCode = false,
  submitLabel = "Verifikasi",
}: TwoFactorVerifyProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyForm>({
    resolver: zodResolver(verifySchema),
  });

  const onSubmit = async (data: VerifyForm) => {
    await onVerify(data.token);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="token">
          {allowRecoveryCode
            ? "Kode verifikasi atau kode pemulihan"
            : "Kode verifikasi"}
        </Label>
        <Input
          id="token"
          placeholder={allowRecoveryCode ? "123456 atau A1B2C3D4E5" : "123456"}
          autoComplete="one-time-code"
          inputMode={allowRecoveryCode ? "text" : "numeric"}
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          {...register("token")}
        />
        {errors.token && (
          <p className="text-sm text-destructive">{errors.token.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Buka aplikasi autentikator di ponsel Anda dan masukkan 6 digit yang
          tampil.
          {allowRecoveryCode &&
            " Tidak bisa membuka aplikasinya? Masukkan salah satu kode pemulihan yang Anda simpan saat mengaktifkan verifikasi dua langkah — setiap kode hanya berlaku sekali."}
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
