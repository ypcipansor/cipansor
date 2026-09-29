"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { toast } from "sonner";

const setupSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, "Masukkan 6 digit dari aplikasi autentikator"),
});

type SetupForm = z.infer<typeof setupSchema>;

interface TwoFactorSetupProps {
  onComplete: () => void;
}

export function TwoFactorSetup({ onComplete }: TwoFactorSetupProps) {
  const [step, setStep] = useState<"scan" | "verify" | "recovery">("scan");
  const [secret, setSecret] = useState<string>("");
  const [qrCode, setQrCode] = useState<string>("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
  });

  useEffect(() => {
    const fetchSecret = async () => {
      try {
        const res = await authApi.generate2FA();
        setSecret(res.data.data.secret);
        setQrCode(res.data.data.qrCodeUrl);
      } catch (error) {
        toast.error("Gagal menyiapkan verifikasi dua langkah. Coba lagi.");
      }
    };
    fetchSecret();
  }, []);

  const onVerify = async (data: SetupForm) => {
    setIsLoading(true);
    try {
      const res = await authApi.enable2FA({
        token: data.token,
      });
      setRecoveryCodes(res.data.data.recoveryCodes);
      setStep("recovery");
      toast.success("Verifikasi dua langkah aktif");
    } catch (error) {
      // Error handled by interceptor or store usually, but here we call api directly
      // Interceptor handles toast
    } finally {
      setIsLoading(false);
    }
  };

  const copyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast.success("Kode pemulihan disalin");
  };

  if (!qrCode && step === "scan") {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {step !== "recovery" && (
        <div className="flex flex-col items-center space-y-4">
          <ol className="w-full list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Pasang aplikasi autentikator di ponsel Anda (Google Authenticator,
              Microsoft Authenticator, atau yang sejenis).
            </li>
            <li>Pindai kode QR ini, atau ketik kode manual di bawahnya.</li>
            <li>Masukkan 6 digit yang tampil di aplikasi.</li>
          </ol>

          <div className="bg-white p-2 rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCode}
              alt="Kode QR verifikasi dua langkah"
              className="w-48 h-48"
            />
          </div>

          <div className="w-full text-center">
            <p className="text-xs text-muted-foreground mb-1">Kode manual:</p>
            <code className="bg-muted p-2 rounded text-sm font-mono break-all block">
              {secret}
            </code>
          </div>

          <form onSubmit={handleSubmit(onVerify)} className="w-full space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Kode verifikasi</Label>
              <Input
                id="token"
                placeholder="123456"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={12}
                {...register("token")}
              />
              {errors.token && (
                <p className="text-sm text-destructive">
                  {errors.token.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verifikasi & aktifkan
            </Button>
          </form>
        </div>
      )}

      {step === "recovery" && (
        <div className="space-y-4">
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-4 border border-amber-200 dark:border-amber-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">
                  Simpan kode pemulihan ini sekarang
                </p>
                <p>
                  Cetak atau simpan di tempat yang aman. Jika ponsel Anda hilang
                  atau aplikasinya terhapus, masukkan salah satu kode ini di
                  langkah verifikasi saat masuk. Setiap kode hanya berlaku
                  sekali, dan daftar ini tidak akan ditampilkan lagi.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-muted p-4 rounded-lg font-mono text-sm">
            {recoveryCodes.map((code, i) => (
              <div key={i} className="text-center">
                {code}
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={copyRecoveryCodes}
          >
            <Copy className="mr-2 h-4 w-4" />
            Salin kode
          </Button>

          <Button onClick={onComplete} className="w-full">
            Selesai
          </Button>
        </div>
      )}
    </div>
  );
}
