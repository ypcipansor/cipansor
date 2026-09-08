"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { useStudent, useUpdateStudent } from "@/hooks/use-students";
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
import { getEffectiveRole } from "@/lib/rbac";

const studentSchema = z.object({
  nisn: z.string().min(1, "NISN is required"),
  name: z.string().min(1, "Name is required"),
  gender: z.enum(["MALE", "FEMALE"], { required_error: "Gender is required" }),
  birthDate: z.string().min(1, "Birth date is required"),
  birthPlace: z.string().min(1, "Birth place is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  parentName: z.string().min(1, "Parent name is required"),
  parentPhone: z.string().min(1, "Parent phone is required"),
  unitId: z.string().min(1, "Unit is required"),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "DROPPED_OUT"]),
});

type StudentForm = z.infer<typeof studentSchema>;

export default function EditStudentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: student, isLoading } = useStudent(params.id as string);
  const { data: units } = useUnits();
  const updateMutation = useUpdateStudent();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
  });

  useEffect(() => {
    if (student) {
      reset({
        nisn: student.nisn,
        name: student.name,
        gender: student.gender,
        birthDate: student.birthDate.split("T")[0],
        birthPlace: student.birthPlace,
        address: student.address,
        phone: student.phone || "",
        email: student.email || "",
        parentName: student.parentName,
        parentPhone: student.parentPhone,
        unitId: student.unitId,
        status: student.status,
      });
    }
  }, [student, reset]);

  const onSubmit = async (data: StudentForm) => {
    try {
      await updateMutation.mutateAsync({
        id: params.id as string,
        data: {
          ...data,
          email: data.email || undefined,
          phone: data.phone || undefined,
        },
      });
      toast.success("Student updated successfully");
      router.push(`/students/${params.id}`);
    } catch {
      toast.error("Failed to update student");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  if (!student) {
    return (
      <MainLayout>
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Student not found</p>
          <Button variant="outline" onClick={() => router.push("/students")}>
            Back to Students
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN"]}>
      <div className="space-y-6">
        <PageHeader
          title="Edit Student"
          description={`Editing: ${student.name}`}
        >
          <Button variant="outline" asChild>
            <Link href={`/students/${params.id}`}>
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
                <Label htmlFor="nisn">NISN (Student ID) *</Label>
                <Input id="nisn" {...register("nisn")} />
                {errors.nisn && (
                  <p className="text-sm text-destructive">
                    {errors.nisn.message}
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

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>Student enrollment status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 md:w-1/2">
                <Label>Status</Label>
                <Select
                  value={watch("status")}
                  onValueChange={(value) =>
                    setValue(
                      "status",
                      value as
                        | "ACTIVE"
                        | "INACTIVE"
                        | "GRADUATED"
                        | "DROPPED_OUT",
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="GRADUATED">Graduated</SelectItem>
                    <SelectItem value="DROPPED_OUT">Dropped Out</SelectItem>
                  </SelectContent>
                </Select>
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
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
