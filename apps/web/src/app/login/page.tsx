"use client";

import { useState, useRef, useEffect } from "react";
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
import { useSSOConfig } from "@/hooks/use-sso-config";
import {
  loginWithGoogle,
  loginWithGoogleButton,
  loginWithMicrosoft,
} from "@/lib/sso";

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
    ssoLogin,
    isLoading,
    error,
    clearError,
    requiresTwoFactor,
    requiresTwoFactorSetup,
    verifyTwoFactor,
    resetAuth,
  } = useAuthStore();

  // SSO config via the React Query data-layer hook (never the Axios instance).
  const { data: ssoConfig, isError: ssoConfigError } = useSSOConfig();

  // Declared before the SSO handlers because the One Tap fallback effect below
  // reads them. Holds GIS's explicit renderButton when One Tap is suppressed;
  // it stays empty on every browser where `prompt()` works, so the fallback UI
  // only appears when the browser has said the prompt cannot be shown.
  const [googleFallback, setGoogleFallback] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  /**
   * Turnstile di halaman masuk.
   *
   * `authLimiter` membatasi 5 percobaan per menit **per IP**, dan itu memang
   * menghentikan satu mesin yang menebak kata sandi. Yang tidak dihentikannya
   * adalah percobaan yang tersebar di ribuan IP, karena tidak satu pun dari
   * mereka menyentuh batasnya. Turnstile menaikkan ongkos setiap percobaan,
   * bukan ongkos setiap alamat.
   *
   * Dua instance, bukan satu: token Turnstile terikat pada `action` yang
   * memasangnya, jadi token formulir kata sandi (`login`) DITOLAK di
   * `/auth/sso/login` (`sso-login`) dan sebaliknya. Tombol SSO karena itu
   * menunggu tokennya sendiri.
   */
  const turnstile = useTurnstile();
  const ssoTurnstile = useTurnstile();

  /**
   * Shared tail of both SSO flows: hand the ID token to the backend and route
   * on success. Extracted because Google and Microsoft differ only in how the
   * token is obtained — the SDKs do the redirect handshake, so there is no
   * `state`/`nonce`/hash handling left on this page.
   *
   * The SSO endpoint carries the same Turnstile gate as the password form (a
   * bearer ID token is just as worth replaying as a password), so the widget's
   * token rides along and is refreshed after every attempt — Turnstile tokens
   * are single-use and a second exchange is rejected by Cloudflare.
   */
  const completeSsoLogin = async (
    provider: "google" | "microsoft",
    idToken: string,
  ) => {
    try {
      await ssoLogin({
        provider,
        idToken,
        turnstileToken: ssoTurnstile.token ?? undefined,
      });
      const storeState = useAuthStore.getState();
      if (
        !storeState.requiresTwoFactor &&
        !storeState.requiresTwoFactorSetup &&
        storeState.isAuthenticated
      ) {
        router.push(landingRouteForCurrentUser());
      }
    } catch {
      // The store surfaces the error; nothing more to do here.
      ssoTurnstile.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    clearError();
    if (ssoConfigError || !ssoConfig) {
      toast.error(
        "Gagal memuat konfigurasi SSO. Periksa koneksi Anda lalu coba lagi.",
      );
      return;
    }
    if (!ssoConfig.googleEnabled || !ssoConfig.googleClientId) {
      toast.info(
        "Google Workspace SSO belum dikonfigurasi di server. Minta administrator menyetel GOOGLE_CLIENT_ID.",
      );
      return;
    }
    try {
      const { idToken } = await loginWithGoogle(ssoConfig.googleClientId);
      await completeSsoLogin("google", idToken);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Gagal memulai alur masuk Google Workspace.";
      // One Tap was suppressed by the browser (Safari/Firefox ITP, enterprise
      // cookie policy). Retrying `prompt()` cannot help, so surface GIS's
      // explicit renderButton instead — it is an ordinary same-origin button
      // and is not subject to the same suppression.
      if (message.includes("tidak dapat ditampilkan")) {
        setGoogleFallback(true);
        toast.info(
          "Pop-up akun Google tidak didukung di peramban ini. Gunakan tombol Google yang muncul di bawah.",
        );
        return;
      }
      toast.error(`Gagal masuk dengan Google Workspace: ${message}`);
    }
  };

  const handleGoogleButtonLogin = async () => {
    clearError();
    if (ssoConfigError || !ssoConfig) return;
    if (!ssoConfig.googleEnabled || !ssoConfig.googleClientId) return;
    const container = googleButtonRef.current;
    if (!container) return;
    try {
      const { idToken } = await loginWithGoogleButton(
        ssoConfig.googleClientId,
        container,
      );
      await completeSsoLogin("google", idToken);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Gagal masuk dengan Google Workspace: ${err.message}`
          : "Gagal memulai alur masuk Google Workspace. Silakan coba lagi.",
      );
    }
  };

  // Once the fallback is requested, GIS's button can be rendered into the
  // container. Doing it in an effect (rather than in the click handler) means
  // the container is committed to the DOM before `renderButton` touches it.
  useEffect(() => {
    if (!googleFallback) return;
    void handleGoogleButtonLogin();
    // `handleGoogleButtonLogin` is stable enough for this one-shot render; the
    // guard is the `googleFallback` flag, not the callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleFallback]);

  const handleMicrosoftLogin = async () => {
    clearError();
    if (ssoConfigError || !ssoConfig) {
      toast.error(
        "Gagal memuat konfigurasi SSO. Periksa koneksi Anda lalu coba lagi.",
      );
      return;
    }
    if (!ssoConfig.microsoftEnabled || !ssoConfig.microsoftClientId) {
      toast.info(
        "Microsoft 365 SSO belum dikonfigurasi di server. Minta administrator menyetel MICROSOFT_CLIENT_ID.",
      );
      return;
    }
    try {
      const { idToken } = await loginWithMicrosoft({
        clientId: ssoConfig.microsoftClientId,
        tenantId: ssoConfig.microsoftTenantId,
      });
      await completeSsoLogin("microsoft", idToken);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Gagal masuk dengan Microsoft 365: ${err.message}`
          : "Gagal memulai alur masuk Microsoft 365. Silakan coba lagi.",
      );
    }
  };

  const [showPassword, setShowPassword] = useState(false);

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

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Atau Masuk Dengan Akun Domain
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {/* Token for `/auth/sso/login`. It must be its own widget: a
                  Turnstile token is bound to the `action` that rendered it, and
                  the password form mints `login`, which the SSO endpoint
                  rejects. */}
              <TurnstileWidget
                action="sso-login"
                {...ssoTurnstile.widgetProps}
              />

              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                disabled={isLoading || !ssoTurnstile.ready}
                onClick={handleGoogleLogin}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"
                  />
                </svg>
                Google Workspace
              </Button>

              {/* GIS's own button, rendered only when One Tap is suppressed.
                  It must not sit inside the React <Button> above: GIS injects
                  its iframe into this container and would fight React's
                  reconciler over the same DOM node. */}
              <div
                ref={googleButtonRef}
                className={googleFallback ? "flex justify-center" : "hidden"}
                data-testid="google-sso-fallback"
              />

              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                disabled={isLoading || !ssoTurnstile.ready}
                onClick={handleMicrosoftLogin}
              >
                <svg className="h-4 w-4 text-blue-600" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                Microsoft 365
              </Button>
            </div>
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
