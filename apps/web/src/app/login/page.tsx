"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/providers/i18n-provider";
import {
  getDashboardForRole,
  getEffectiveRole,
  getPrimaryRoleCode,
} from "@/lib/rbac";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { toast } from "sonner";

/**
 * Where to send a user after sign-in.
 *
 * This used to be a hardcoded "/dashboard" for everyone, which only appeared to
 * work because the middleware bounced roles that could not reach /dashboard on
 * to their own landing page. Once /dashboard became reachable for more buckets
 * that bounce stopped happening and teachers were dropped on the admin
 * dashboard. Resolve the destination properly instead of relying on a redirect.
 */
function landingRouteForCurrentUser(): string {
  const { user } = useAuthStore.getState();
  return getDashboardForRole(getEffectiveRole(user), getPrimaryRoleCode(user));
}

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginPageContent() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    login,
    isLoading,
    error,
    clearError,
    requiresTwoFactor,
    requiresTwoFactorSetup,
    verifyTwoFactor,
    resetAuth,
  } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Turnstile di halaman masuk.
   *
   * `authLimiter` membatasi 5 percobaan per menit **per IP**, dan itu memang
   * menghentikan satu mesin yang menebak kata sandi. Yang tidak dihentikannya
   * adalah percobaan yang tersebar di ribuan IP, karena tidak satu pun dari
   * mereka menyentuh batasnya. Turnstile menaikkan ongkos setiap percobaan,
   * bukan ongkos setiap alamat.
   */
  const turnstile = useTurnstile();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      clearError();
      await login({ ...data, turnstileToken: turnstile.token ?? undefined });
      const state = useAuthStore.getState();
      if (
        !state.requiresTwoFactor &&
        !state.requiresTwoFactorSetup &&
        state.isAuthenticated
      ) {
        router.push(landingRouteForCurrentUser());
      }
    } catch {
      // Error is handled in store. Tokennya sudah terpakai apa pun hasilnya —
      // Cloudflare menolak penukaran kedua — jadi percobaan berikutnya butuh
      // tantangan baru, bukan token yang sama.
      turnstile.refresh();
    }
  };

  if (requiresTwoFactorSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Mandatory 2FA Setup</CardTitle>
            <CardDescription>
              Your account requires Two-Factor Authentication. Please set it up
              to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TwoFactorSetup
              onComplete={() => {
                resetAuth();
                toast.success("Setup complete. Please sign in again.");
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requiresTwoFactor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <CardDescription>
              Please enter the verification code from your authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TwoFactorVerify
              onVerify={async (token) => {
                try {
                  await verifyTwoFactor(token);
                  router.push(landingRouteForCurrentUser());
                } catch {}
              }}
              isLoading={isLoading}
              error={error}
            />
            <Button variant="link" className="mt-4 w-full" onClick={resetAuth}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-linear-to-br from-green-50 to-green-100 dark:from-gray-900 dark:to-gray-800">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white p-1 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Cipansor Logo"
                className="h-full w-full object-contain rounded-full"
              />
            </div>
            {/* Both strings were hardcoded in Indonesian, which is why the
                language switcher never reached the login screen even though
                login.* has been translated in all three locales all along. */}
            <CardTitle className="text-2xl">
              {t("login.welcome", "Selamat Datang di Cipansor")}
            </CardTitle>
            <CardDescription>
              {t("login.description", "Sistem Informasi Cipansor")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Masukkan password"
                    {...register("password")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <TurnstileWidget action="login" {...turnstile.widgetProps} />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !turnstile.ready}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Masuk
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main id="main-content">
      <LoginPageContent />
    </main>
  );
}
