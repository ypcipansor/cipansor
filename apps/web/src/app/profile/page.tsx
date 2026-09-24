"use client";
import { MainLayout } from "@/components/layout";

/**
 * Profile Page
 * User profile management - view and edit profile, change password
 */

import { getEffectiveRole } from "@/lib/rbac";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  Lock,
  Mail,
  Phone,
  Building2,
  Shield,
  Save,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { demoPhotoForEmail } from "@/lib/demo-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { useUpdateUser } from "@/hooks/use-users";
import { useChangePassword } from "@/hooks/use-dashboard";
import { TwoFactorSettings } from "@/components/profile/TwoFactorSettings";

// Validation schemas
const profileSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  phone: z.string().optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password lama harus diisi"),
    newPassword: z.string().min(8, "Password baru minimal 8 karakter"),
    confirmPassword: z.string().min(1, "Konfirmasi password harus diisi"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Password baru dan konfirmasi tidak sama",
    path: ["confirmPassword"],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

// Role badge colors
const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  UNIT_ADMIN:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  TEACHER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  STAFF: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  STUDENT:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PARENT:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  UNIT_ADMIN: "Admin Unit",
  TEACHER: "Guru/Ustadz",
  STAFF: "Staff",
  STUDENT: "Santri",
  PARENT: "Wali Santri",
};

function ProfilePageContent() {
  const { user, fetchUser } = useAuthStore();
  const photo = demoPhotoForEmail(user?.email);
  const [activeTab, setActiveTab] = useState("profile");

  const updateUser = useUpdateUser();
  const changePassword = useChangePassword();

  // Profile form
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      phone: user?.phone || "",
    },
  });

  // Password form
  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Handle profile update
  const handleProfileUpdate = async (data: ProfileFormData) => {
    if (!user) return;

    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: {
          name: data.name,
          // phone: data.phone, // Will be handled when API supports it
        },
      });
      toast.success("Profil berhasil diperbarui");
      fetchUser();
    } catch (error) {
      toast.error("Gagal memperbarui profil");
      console.error(error);
    }
  };

  // Handle password change
  const handlePasswordChange = async (data: PasswordFormData) => {
    try {
      await changePassword.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success("Password berhasil diubah");
      passwordForm.reset();
    } catch (error) {
      toast.error("Gagal mengubah password. Pastikan password lama benar.");
      console.error(error);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Silakan login untuk melihat profil
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          {/* Same lookup the header and sidebar use. This page is the one place
              a user goes to look at their own profile, so it was the worst
              place to be the only avatar still showing a bare initial. */}
          {photo && <AvatarImage src={photo} alt={user.name} />}
          <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{user.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              className={
                ROLE_COLORS[getEffectiveRole(user) ?? user.role] ||
                "bg-gray-100"
              }
            >
              {ROLE_LABELS[getEffectiveRole(user) ?? user.role] || user.role}
            </Badge>
            {user.unit && (
              <Badge variant="outline">
                <Building2 className="h-3 w-3 mr-1" />
                {user.unit.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profil
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Keamanan
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          {/* Profile Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Informasi Akun</CardTitle>
              <CardDescription>Informasi dasar akun Anda</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    Role
                  </Label>
                  <p className="font-medium">
                    {ROLE_LABELS[getEffectiveRole(user) ?? user.role] ||
                      user.role}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    Telepon
                  </Label>
                  <p className="font-medium">{user.phone || "-"}</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    Unit
                  </Label>
                  <p className="font-medium">
                    {user.unit?.name || "Semua Unit"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit Profile Form */}
          <Card>
            <CardHeader>
              <CardTitle>Edit Profil</CardTitle>
              <CardDescription>Perbarui informasi profil Anda</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form
                  onSubmit={profileForm.handleSubmit(handleProfileUpdate)}
                  className="space-y-4"
                >
                  <FormField
                    control={profileForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nama Lengkap</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Masukkan nama lengkap"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nomor Telepon</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Contoh: 08123456789" />
                        </FormControl>
                        <FormDescription>
                          Nomor telepon untuk kontak
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={updateUser.isPending}>
                    {updateUser.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Simpan Perubahan
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <TwoFactorSettings />

          <Card>
            <CardHeader>
              <CardTitle>Ubah Password</CardTitle>
              <CardDescription>
                Perbarui password akun Anda untuk keamanan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form
                  onSubmit={passwordForm.handleSubmit(handlePasswordChange)}
                  className="space-y-4"
                >
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password Lama</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder="Masukkan password lama"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password Baru</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder="Masukkan password baru"
                          />
                        </FormControl>
                        <FormDescription>Minimal 8 karakter</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Konfirmasi Password Baru</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder="Masukkan ulang password baru"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={changePassword.isPending}>
                    {changePassword.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Mengubah...
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Ubah Password
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Security Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informasi Keamanan</CardTitle>
              <CardDescription>
                Tips untuk menjaga keamanan akun Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  Gunakan password yang kuat dengan kombinasi huruf, angka, dan
                  simbol
                </li>
                <li>Jangan bagikan password Anda kepada siapapun</li>
                <li>Ganti password secara berkala (minimal setiap 3 bulan)</li>
                <li>Jangan gunakan password yang sama dengan akun lain</li>
                <li>Logout dari perangkat yang tidak digunakan</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ProfilePageWithShell() {
  return (
    <MainLayout>
      <ProfilePageContent />
    </MainLayout>
  );
}
