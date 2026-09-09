"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { useCreateUser } from "@/hooks/use-users";
import { useUnits } from "@/hooks/use-units";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const userSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(
    ["SUPER_ADMIN", "UNIT_ADMIN", "TEACHER", "STUDENT", "STAFF", "PARENT"],
    {
      error: "Role is required",
    },
  ),
  unitId: z.string().optional(),
});

type UserForm = z.infer<typeof userSchema>;

export default function NewUserPage() {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const { data: units } = useUnits();
  const createMutation = useCreateUser();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      unitId:
        currentUser?.role !== "SUPER_ADMIN" ? currentUser?.unitId : undefined,
    },
  });

  const selectedRole = watch("role");
  const needsUnit = selectedRole && selectedRole !== "SUPER_ADMIN";

  const onSubmit = async (data: UserForm) => {
    try {
      await createMutation.mutateAsync({
        ...data,
        unitId: needsUnit ? data.unitId : undefined,
      });
      toast.success("User created successfully");
      router.push("/users");
    } catch {
      toast.error("Failed to create user");
    }
  };

  const availableRoles =
    currentUser?.role === "SUPER_ADMIN"
      ? ["SUPER_ADMIN", "UNIT_ADMIN", "TEACHER", "STAFF", "STUDENT", "PARENT"]
      : ["UNIT_ADMIN", "TEACHER", "STAFF", "STUDENT", "PARENT"];

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    UNIT_ADMIN: "Unit Admin",
    TEACHER: "Teacher",
    STAFF: "Staff",
    STUDENT: "Student",
    PARENT: "Parent",
  };

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title="Add New User" description="Create a new system user">
          <Button variant="outline" asChild>
            <Link href="/users">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </PageHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>User login credentials</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
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

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input id="name" {...register("name")} />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Role & Assignment */}
          <Card>
            <CardHeader>
              <CardTitle>Role & Assignment</CardTitle>
              <CardDescription>User role and unit assignment</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select
                  value={watch("role")}
                  onValueChange={(value) =>
                    setValue("role", value as UserForm["role"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabels[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.role && (
                  <p className="text-sm text-destructive">
                    {errors.role.message}
                  </p>
                )}
              </div>

              {needsUnit && (
                <div className="space-y-2">
                  <Label>Unit *</Label>
                  <Select
                    value={watch("unitId")}
                    onValueChange={(value) => setValue("unitId", value)}
                    disabled={currentUser?.role !== "SUPER_ADMIN"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units?.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.unitId && (
                    <p className="text-sm text-destructive">
                      {errors.unitId.message}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create User
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
