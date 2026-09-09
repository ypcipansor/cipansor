"use client";

import { useState, useEffect } from "react";
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
import { cn } from "@/lib/utils";
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
  DEMO_ACCOUNTS,
  DEMO_TABS,
  DEMO_PASSWORD,
  type DemoAccount,
} from "@cipansor/shared";

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

// Next.js hardcodes process.env.NODE_ENV to "production" during `next build`,
// so a NODE_ENV check would compile the demo panel out of every built image.
// Gate on an explicit public build flag instead: set NEXT_PUBLIC_SHOW_DEMO_LOGIN
// = "true" for demo deployments, leave it unset for a real launch.
const SHOW_DEMO_LOGIN = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === "true";

// One accent colour per realm tab, used for the fallback initial avatar.
const groupColor: Record<string, string> = {
  YAYASAN: "bg-amber-500",
  PESANTREN: "bg-emerald-600",
  TK_QURAN: "bg-pink-500",
  SD_IT: "bg-green-600",
  SMP_IT: "bg-blue-600",
  SMA_QURAN: "bg-teal-600",
  PERGURUAN_TINGGI: "bg-indigo-600",
  SARANA_USAHA: "bg-slate-600",
};

// First meaningful letter of a name, skipping honorifics/titles.
function avatarInitial(name: string): string {
  const stripped = name
    .replace(
      /^(H\.|Hj\.|K\.H\.|KH\.|Drs\.|Dra\.|Dr\.|Prof\.|Ns\.|Lc\.|M\.Ag\.|Ustadz|Ustadzah|Bunda|Ananda|Ibu|Bapak)\s*/gi,
      "",
    )
    .trim();
  return (stripped || name).charAt(0).toUpperCase();
}

function DemoAvatar({ acc, size = 10 }: { acc: DemoAccount; size?: number }) {
  const dim = size === 8 ? "h-8 w-8" : "h-10 w-10";
  if (acc.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={acc.photo}
        alt={acc.name}
        className={cn(dim, "rounded-full object-cover flex-shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "flex items-center justify-center rounded-full text-white text-sm font-semibold flex-shrink-0",
        groupColor[acc.group] ?? "bg-gray-500",
      )}
    >
      {avatarInitial(acc.name)}
    </div>
  );
}

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

  // Handle OIDC token callback in URL hash (e.g. #id_token=...)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkHashAndLogin = () => {
      const hash = window.location.hash;
      if (hash.includes("id_token=")) {
        const params = new URLSearchParams(hash.substring(1));
        const idToken = params.get("id_token");
        const state = params.get("state");
        const storedState = sessionStorage.getItem("sso_state");
        const storedNonce = sessionStorage.getItem("sso_nonce");
        const storedProvider = sessionStorage.getItem("sso_provider") as "google" | "microsoft" | null;

        if (!storedProvider) {
          toast.error("Sesi SSO tidak valid atau telah kedaluwarsa. Silakan coba lagi.");
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }

        if (storedState && state !== storedState) {
          toast.error("Validasi keamanan SSO (state) gagal. Silakan coba lagi.");
          sessionStorage.removeItem("sso_state");
          sessionStorage.removeItem("sso_nonce");
          sessionStorage.removeItem("sso_provider");
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }

        // Decode JWT payload to verify nonce claim
        if (idToken && storedNonce) {
          try {
            const parts = idToken.split(".");
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload.nonce && payload.nonce !== storedNonce) {
                toast.error("Validasi keamanan SSO (nonce) gagal. Silakan coba lagi.");
                sessionStorage.removeItem("sso_state");
                sessionStorage.removeItem("sso_nonce");
                sessionStorage.removeItem("sso_provider");
                window.history.replaceState(null, "", window.location.pathname);
                return;
              }
            }
          } catch {}
        }

        sessionStorage.removeItem("sso_state");
        sessionStorage.removeItem("sso_nonce");
        sessionStorage.removeItem("sso_provider");

        if (idToken) {
          window.history.replaceState(null, "", window.location.pathname);
          ssoLogin({ provider: storedProvider, idToken }).then(() => {
            const storeState = useAuthStore.getState();
            if (!storeState.requiresTwoFactor && !storeState.requiresTwoFactorSetup && storeState.isAuthenticated) {
              router.push(landingRouteForCurrentUser());
            }
          }).catch(() => {});
        }
      }
    };

    checkHashAndLogin();
    window.addEventListener("hashchange", checkHashAndLogin);
    return () => window.removeEventListener("hashchange", checkHashAndLogin);
  }, [ssoLogin, router]);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(DEMO_TABS[0]?.key ?? "");

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
    setValue,
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

  const handleDemoLogin = (acc: DemoAccount) => {
    clearError();
    setSelectedDemo(acc.email);
    setValue("email", acc.email);
    setValue("password", acc.password);
  };

  const handleQuickLogin = async (acc: DemoAccount) => {
    try {
      clearError();
      setSelectedDemo(acc.email);
      setValue("email", acc.email);
      setValue("password", acc.password);
      await login({
        email: acc.email,
        password: acc.password,
        turnstileToken: turnstile.token ?? undefined,
      });

      const state = useAuthStore.getState();
      if (
        !state.requiresTwoFactor &&
        !state.requiresTwoFactorSetup &&
        state.isAuthenticated
      ) {
        router.push(landingRouteForCurrentUser());
      }
    } catch {
      // Error is handled in store
    }
  };

  const visibleAccounts = DEMO_ACCOUNTS.filter((a) => a.group === activeTab);

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
      {/* Left side - Demo Credentials */}
      {SHOW_DEMO_LOGIN && (
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center p-8 xl:p-12">
          <div className="max-w-lg mx-auto w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              Kredensial Demo
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-3">
              Klik salah satu akun untuk langsung masuk. Setiap peran memiliki
              hak akses dan menu yang berbeda.
            </p>

            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm dark:border-green-800 dark:bg-green-900/20">
              <span className="text-gray-600 dark:text-gray-300">
                Password untuk semua akun:{" "}
              </span>
              <code className="font-mono font-semibold text-green-800 dark:text-green-200">
                {DEMO_PASSWORD}
              </code>
            </div>

            {/* Realm Selector Tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {DEMO_TABS.map((tab) => {
                const count = DEMO_ACCOUNTS.filter(
                  (a) => a.group === tab.key,
                ).length;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setSelectedDemo(null);
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-full border transition-all whitespace-nowrap",
                      activeTab === tab.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50",
                    )}
                  >
                    {tab.label}
                    <span className="ml-1.5 opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
              {visibleAccounts.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => handleQuickLogin(acc)}
                  disabled={isLoading}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all",
                    "hover:bg-white hover:shadow-md dark:hover:bg-gray-800",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    selectedDemo === acc.email && isLoading
                      ? "bg-white shadow-md ring-2 ring-primary dark:bg-gray-800"
                      : "bg-white/50 dark:bg-gray-800/50",
                  )}
                >
                  <DemoAvatar acc={acc} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {acc.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {acc.description}
                    </div>
                    <div className="text-2xs text-gray-400 dark:text-gray-500 truncate font-mono">
                      {acc.email}
                    </div>
                  </div>
                  {selectedDemo === acc.email && isLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Catatan:</strong> Ini lingkungan demo. Seluruh data
                adalah contoh dan dapat direset berkala.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Right side - Login Form */}
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
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                disabled={isLoading}
                onClick={() => {
                  clearError();
                  if (ssoConfigError || !ssoConfig) {
                    toast.error(
                      "Gagal memuat konfigurasi SSO. Periksa koneksi Anda lalu coba lagi."
                    );
                    return;
                  }
                  if (!ssoConfig.googleEnabled || !ssoConfig.googleClientId) {
                    toast.info(
                      "Google Workspace SSO belum dikonfigurasi di server. Minta administrator menyetel GOOGLE_CLIENT_ID."
                    );
                    return;
                  }
                  try {
                    const state = crypto.randomUUID();
                    const nonce = crypto.randomUUID();
                    sessionStorage.setItem("sso_provider", "google");
                    sessionStorage.setItem("sso_state", state);
                    sessionStorage.setItem("sso_nonce", nonce);

                    const redirectUri = encodeURIComponent(window.location.origin + "/login");
                    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=id_token&client_id=${ssoConfig.googleClientId}&redirect_uri=${redirectUri}&scope=openid%20email%20profile&state=${state}&nonce=${nonce}`;
                    window.location.href = authUrl;
                  } catch {
                    toast.error(
                      "Gagal memulai alur masuk Google Workspace. Silakan coba lagi."
                    );
                  }
                }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"
                  />
                </svg>
                Google Workspace
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                disabled={isLoading}
                onClick={() => {
                  clearError();
                  if (ssoConfigError || !ssoConfig) {
                    toast.error(
                      "Gagal memuat konfigurasi SSO. Periksa koneksi Anda lalu coba lagi."
                    );
                    return;
                  }
                  if (!ssoConfig.microsoftEnabled || !ssoConfig.microsoftClientId) {
                    toast.info(
                      "Microsoft 365 SSO belum dikonfigurasi di server. Minta administrator menyetel MICROSOFT_CLIENT_ID."
                    );
                    return;
                  }
                  try {
                    const state = crypto.randomUUID();
                    const nonce = crypto.randomUUID();
                    sessionStorage.setItem("sso_provider", "microsoft");
                    sessionStorage.setItem("sso_state", state);
                    sessionStorage.setItem("sso_nonce", nonce);

                    const redirectUri = encodeURIComponent(window.location.origin + "/login");
                    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${ssoConfig.microsoftClientId}&response_type=id_token&redirect_uri=${redirectUri}&scope=openid%20profile%20email&response_mode=fragment&state=${state}&nonce=${nonce}`;
                    window.location.href = authUrl;
                  } catch {
                    toast.error(
                      "Gagal memulai alur masuk Microsoft 365. Silakan coba lagi."
                    );
                  }
                }}
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

            {/* Mobile Demo Credentials */}
            {SHOW_DEMO_LOGIN && (
              <div className="mt-6 border-t pt-4 lg:hidden">
                <p className="text-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Login Demo Cepat
                </p>
                <p className="text-center text-2xs text-gray-500 dark:text-gray-400 mb-3">
                  Password semua akun:{" "}
                  <code className="font-mono">{DEMO_PASSWORD}</code>
                </p>

                {/* Mobile Tabs */}
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-none">
                  {DEMO_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "px-2.5 py-1 text-2xs font-semibold rounded-full border transition-all whitespace-nowrap",
                        activeTab === tab.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin">
                  {visibleAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleDemoLogin(acc)}
                      disabled={isLoading}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border text-left transition-all text-xs",
                        "hover:bg-muted disabled:opacity-50",
                        selectedDemo === acc.email
                          ? "ring-2 ring-primary"
                          : "",
                      )}
                    >
                      <DemoAvatar acc={acc} size={8} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{acc.name}</div>
                        <div className="text-2xs text-muted-foreground truncate">
                          {acc.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
