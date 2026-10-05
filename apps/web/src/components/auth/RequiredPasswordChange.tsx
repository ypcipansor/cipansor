"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH_WITH_2FA } from "@cipansor/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/api-error";

/**
 * The new password a sign-in asks for when the current one was set by someone
 * else or marked leaked (decisions/autentikasi-2fa-dan-sandi.md). The old one
 * is not asked again — the sign-in just proved it.
 *
 * The form checks only the floor and the repeat; whether 8 characters are
 * enough depends on the account's 2FA, and the list of common passwords lives
 * on the server. The API's reason for a refusal is shown on the field.
 */
const schema = z
  .object({
    newPassword: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH_WITH_2FA,
        `Kata sandi minimal ${PASSWORD_MIN_LENGTH_WITH_2FA} karakter`,
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Kedua kata sandi tidak sama",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export function RequiredPasswordChange({
  onSubmit,
}: {
  onSubmit: (newPassword: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const submit = async (data: FormData) => {
    try {
      await onSubmit(data.newPassword);
    } catch (error) {
      setError("newPassword", { message: getErrorMessage(error) });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="required-new-password">Kata sandi baru</Label>
        <Input
          id="required-new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          {...register("newPassword")}
        />
        <p className="text-sm text-muted-foreground">{PASSWORD_HINT}</p>
        {errors.newPassword && (
          <p className="text-sm text-destructive">
            {errors.newPassword.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="required-confirm-password">
          Ulangi kata sandi baru
        </Label>
        <Input
          id="required-confirm-password"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Simpan dan masuk
      </Button>
    </form>
  );
}
