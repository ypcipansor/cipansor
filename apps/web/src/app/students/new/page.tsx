"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { useCreateStudent } from "@/hooks/use-students";
import { useUnits } from "@/hooks/use-units";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createStudentSchema, type CreateStudentInput } from "@cipansor/shared";
import { getEffectiveRole } from "@/lib/rbac";

// Use strict validation from shared
// We can extend here if needed for UI-specific validaton (e.g. terms acceptance)
const studentSchema = createStudentSchema;

type StudentForm = CreateStudentInput;

export default function NewStudentPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: units } = useUnits();
  const createMutation = useCreateStudent();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema) as any,
    defaultValues: {
      unitId: getEffectiveRole(user) !== "SUPER_ADMIN" ? user?.unitId : "",
      enrollmentDate: new Date().toISOString().split("T")[0] as any,
    },
  });

  const onSubmit = async (data: StudentForm) => {
    try {
      await createMutation.mutateAsync({
        ...data,
        birthDate:
          data.birthDate instanceof Date
            ? data.birthDate.toISOString()
            : data.birthDate,
        enrollmentDate:
          data.enrollmentDate instanceof Date
            ? data.enrollmentDate.toISOString()
            : data.enrollmentDate,
        email: data.email || undefined,
        phone: data.phone || undefined,
      });
      toast.success("Student created successfully");
      router.push("/students");
    } catch {
      toast.error("Failed to create student");
    }
  };

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN"]}>
      <div className="space-y-6">
        <PageHeader
          title="Add New Student"
          description="Create a new student record"
        >
          <Button variant="outline" asChild>
            <Link href="/students">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </PageHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Student&apos;s personal details</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nisn">NISN</Label>
                <Input id="nisn" {...register("nisn")} />
                {errors.nisn && (
                  <p className="text-sm text-destructive">
                    {errors.nisn.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nik">NIK</Label>
                <Input id="nik" {...register("nik")} />
                {errors.nik && (
                  <p className="text-sm text-destructive">
                    {errors.nik.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input id="name" {...register("name")} />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select
                  value={watch("gender")}
                  onValueChange={(value) =>
                    setValue("gender", value as "MALE" | "FEMALE")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Laki-laki</SelectItem>
                    <SelectItem value="FEMALE">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && (
                  <p className="text-sm text-destructive">
                    {errors.gender.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate">Birth Date *</Label>
                <Input id="birthDate" type="date" {...register("birthDate")} />
                {errors.birthDate && (
                  <p className="text-sm text-destructive">
                    {errors.birthDate.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthPlace">Birth Place *</Label>
                <Input id="birthPlace" {...register("birthPlace")} />
                {errors.birthPlace && (
                  <p className="text-sm text-destructive">
                    {errors.birthPlace.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Unit *</Label>
                <Select
                  value={watch("unitId")}
                  onValueChange={(value) => setValue("unitId", value)}
                  disabled={getEffectiveRole(user) !== "SUPER_ADMIN"}
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

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address *</Label>
                <Textarea id="address" rows={3} {...register("address")} />
                {errors.address && (
                  <p className="text-sm text-destructive">
                    {errors.address.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>
                Student and parent contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register("phone")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="parentName">Parent Name *</Label>
                <Input id="parentName" {...register("parentName")} />
                {errors.parentName && (
                  <p className="text-sm text-destructive">
                    {errors.parentName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="parentPhone">Parent Phone *</Label>
                <Input id="parentPhone" {...register("parentPhone")} />
                {errors.parentPhone && (
                  <p className="text-sm text-destructive">
                    {errors.parentPhone.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Enrollment */}
          <Card>
            <CardHeader>
              <CardTitle>Enrollment</CardTitle>
              <CardDescription>Enrollment details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 md:w-1/2">
                <Label htmlFor="enrollmentDate">Enrollment Date</Label>
                <Input
                  id="enrollmentDate"
                  type="date"
                  {...register("enrollmentDate")}
                />
              </div>
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
              Create Student
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
