"use client";

import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  GraduationCap,
  Wallet,
  Home,
  AlertTriangle,
  FileText,
  Activity,
  Clock,
  CheckCircle,
} from "lucide-react";

import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { useStudent, useGraduateStudent } from "@/hooks/use-students";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// New components
import { StudentCounselingTab } from "@/components/students/student-counseling-tab";
import { StudentBehaviorTab } from "@/components/students/student-behavior-tab";
import { StudentIbadahTab } from "@/components/students/student-ibadah-tab";
import { StudentKitabTab } from "@/components/students/student-kitab-tab";
import { StudentTakhosusTab } from "@/components/students/student-takhosus-tab";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  GRADUATED: "bg-blue-100 text-blue-800",
  DROPPED_OUT: "bg-red-100 text-red-800",
};

const genderLabels: Record<string, string> = {
  MALE: "Laki-laki",
  FEMALE: "Perempuan",
};

// Helper to safely format currency
const formatCurrency = (amount: number | string) => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
  }).format(numAmount || 0);
};

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;

  // Only use useStudent here
  const { data: student, isLoading } = useStudent(studentId);
  const graduateMutation = useGraduateStudent();

  const handleGraduate = () => {
    if (!student) return;
    if (
      !window.confirm(
        `Tandai ${student.name} sebagai lulus? Histori kelas & SPP akan dipindahkan ke status alumni.`,
      )
    ) {
      return;
    }
    graduateMutation.mutate(
      { studentId: student.id, graduationDate: new Date().toISOString() },
      {
        onSuccess: () => router.refresh(),
      },
    );
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

  const summary = student.summary || {
    walletBalance: 0,
    violationPoints: 0,
    boarding: null,
    unpaidInvoices: { count: 0, total: 0 },
  };

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN", "TEACHER"]}>
      <div className="space-y-6">
        <PageHeader
          title={student.name}
          description={`NISN: ${student.nisn || student.nik || "-"}`}
        >
          <Button variant="outline" asChild>
            <Link href="/students">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/students/${student.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          {!["GRADUATED", "ALUMNI", "alumni", "graduated"].includes(
            student.status,
          ) && (
            <Button
              variant="outline"
              onClick={handleGraduate}
              disabled={graduateMutation.isPending}
            >
              <GraduationCap className="mr-2 h-4 w-4" />
              {graduateMutation.isPending ? "Menandai..." : "Tandai Lulus"}
            </Button>
          )}
        </PageHeader>

        {/* Status Banner */}
        <div className="flex items-center gap-4">
          <Badge className={statusColors[student.status]} variant="outline">
            {student.status}
          </Badge>
          {student.currentClass && (
            <Badge variant="secondary">
              <GraduationCap className="mr-1 h-3 w-3" />
              {student.currentClass.name}
            </Badge>
          )}
          <Badge variant="outline">{student.unit?.name}</Badge>

          {summary.boarding && (
            <Badge
              variant="secondary"
              className="bg-indigo-100 text-indigo-800"
            >
              <Home className="mr-1 h-3 w-3" />
              {summary.boarding.roomName}
            </Badge>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Wallet Balance
              </CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.walletBalance)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Violation Points
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${summary.violationPoints > 50 ? "text-red-600" : "text-green-600"}`}
              >
                {summary.violationPoints}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Unpaid Invoices
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.unpaidInvoices.count}
              </div>
              <p className="text-xs text-muted-foreground">
                Total: {formatCurrency(summary.unpaidInvoices.total)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tahfidz</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {student.tahfidzRecords?.[0]?.juz || "-"}
              </div>
              <p className="text-xs text-muted-foreground">Last Juz Recited</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="tahfidz">Tahfidz</TabsTrigger>
            <TabsTrigger value="takhosus">Takhosus</TabsTrigger>
            <TabsTrigger value="kitab">Kitab Kuning</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
            <TabsTrigger value="counseling">Counseling</TabsTrigger>
            <TabsTrigger value="ibadah">Mutabaah</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
            <TabsTrigger value="boarding">Boarding</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow label="Full Name" value={student.name} />
                  <InfoRow
                    label="Gender"
                    value={genderLabels[student.gender]}
                  />
                  <InfoRow
                    label="Birth Date"
                    value={safeFormat(
                      new Date(student.birthDate),
                      "dd MMMM yyyy",
                    )}
                  />
                  <InfoRow label="Birth Place" value={student.birthPlace} />
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow
                    label="Phone"
                    value={student.phone || "-"}
                    icon={<Phone className="h-4 w-4" />}
                  />
                  <InfoRow
                    label="Email"
                    value={student.email || "-"}
                    icon={<Mail className="h-4 w-4" />}
                  />
                  <InfoRow
                    label="Address"
                    value={student.address}
                    icon={<MapPin className="h-4 w-4" />}
                  />
                </CardContent>
              </Card>

              {/* Parent Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Parent / Guardian</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow label="Name" value={student.parentName} />
                  <InfoRow label="Phone" value={student.parentPhone} />
                </CardContent>
              </Card>

              {/* Enrollment Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Enrollment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Fallback to createdAt if enrollmentDate not available in this shape */}
                  <InfoRow
                    label="Enrollment Date"
                    value={format(
                      new Date(student.enrollmentDate || student.createdAt),
                      "dd MMMM yyyy",
                    )}
                  />
                  <InfoRow label="Unit" value={student.unit?.name || "-"} />
                  <InfoRow
                    label="Current Class"
                    value={student.currentClass?.name || "Not assigned"}
                  />
                  <InfoRow
                    label="Academic Year"
                    value={student.currentClass?.academicYear?.name || "-"}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="academic">
            <Card>
              <CardHeader>
                <CardTitle>Academic History</CardTitle>
                <CardDescription>Recent enrollment records</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {student.enrollments?.map((enrollment) => (
                    <div
                      key={enrollment.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">{enrollment.class.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {enrollment.class.academicYear?.name}
                        </p>
                      </div>
                      <Badge
                        variant={
                          enrollment.status === "active"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {enrollment.status}
                      </Badge>
                    </div>
                  ))}
                  {!student.enrollments?.length && (
                    <p className="text-muted-foreground">
                      No enrollment history found.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="counseling">
            <StudentCounselingTab studentId={studentId} />
          </TabsContent>

          <TabsContent value="behavior">
            <StudentBehaviorTab studentId={studentId} />
          </TabsContent>

          <TabsContent value="ibadah">
            <StudentIbadahTab studentId={studentId} />
          </TabsContent>

          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <CardTitle>Recent Attendance</CardTitle>
                <CardDescription>Last 10 attendance records</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {student.attendances?.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-2 w-2 rounded-full ${att.status === "PRESENT" ? "bg-green-500" : "bg-red-500"}`}
                        />
                        <div>
                          <p className="font-medium">
                            {safeFormat(new Date(att.date), "dd MMMM yyyy")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {att.status}
                          </p>
                        </div>
                      </div>
                      {att.notes && (
                        <p className="text-sm text-muted-foreground italic">
                          {att.notes}
                        </p>
                      )}
                    </div>
                  ))}
                  {!student.attendances?.length && (
                    <p className="text-muted-foreground">
                      No attendance records found.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tahfidz">
            <Card>
              <CardHeader>
                <CardTitle>Tahfidz Progress</CardTitle>
                <CardDescription>
                  Recent Quran memorization records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {student.tahfidzRecords?.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">
                          Juz {rec.juz}, {rec.surahName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Ayah {rec.ayahStart} - {rec.ayahEnd}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(
                            new Date(rec.recordedAt),
                            "dd MMM yyyy HH:mm",
                          )}
                        </p>
                      </div>
                      <Badge variant="outline">{rec.activityType}</Badge>
                    </div>
                  ))}
                  {!student.tahfidzRecords?.length && (
                    <p className="text-muted-foreground">
                      No tahfidz records found.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="takhosus">
            <StudentTakhosusTab studentId={studentId} />
          </TabsContent>

          <TabsContent value="kitab">
            <StudentKitabTab studentId={studentId} />
          </TabsContent>

          <TabsContent value="finance">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Unpaid Invoices</CardTitle>
                  <CardDescription>Outstanding payments</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {student.invoices?.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-col gap-1 border-b pb-4 last:border-0 last:pb-0"
                      >
                        <div className="flex justify-between items-center">
                          <p className="font-medium">{inv.paymentType.name}</p>
                          <span className="text-red-600 font-bold">
                            {formatCurrency(
                              Number(inv.amount) - Number(inv.paidAmount),
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>
                            Due:{" "}
                            {safeFormat(new Date(inv.dueDate), "dd MMM yyyy")}
                          </span>
                          <span>{inv.invoiceNumber}</span>
                        </div>
                      </div>
                    ))}
                    {!student.invoices?.length && (
                      <div className="flex flex-col items-center justify-center py-4 text-center">
                        <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                        <p className="text-muted-foreground">
                          No unpaid invoices. Good job!
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Wallet</CardTitle>
                  <CardDescription>Digital wallet information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-xl text-white">
                    <p className="text-sm opacity-80 mb-1">Current Balance</p>
                    <h3 className="text-3xl font-bold mb-4">
                      {formatCurrency(summary.walletBalance)}
                    </h3>
                    <p className="text-xs opacity-70">
                      {student.wallet?.lastTopUp
                        ? `Last top up: ${safeFormat(new Date(student.wallet.lastTopUp), "dd MMM yyyy")}`
                        : "No transaction history"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="finance">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Wallet (Uang Saku)
                  </CardTitle>
                  <CardDescription>Digital wallet information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-xl text-white">
                    <p className="text-sm opacity-80 mb-1">Current Balance</p>
                    <h3 className="text-3xl font-bold mb-4">
                      {formatCurrency(summary.walletBalance)}
                    </h3>
                    <p className="text-xs opacity-70">
                      {student.wallet?.lastTopUp
                        ? `Last top up: ${safeFormat(new Date(student.wallet.lastTopUp), "dd MMM yyyy")}`
                        : "No transaction history"}
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/wallet/${student.id}`}>
                      Kelola Saldo & Riwayat
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Tagihan & Tunggakan
                  </CardTitle>
                  <CardDescription>
                    Informasi status tagihan berjalan
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-center py-6">
                  {summary.unpaidInvoices.count > 0 ? (
                    <div>
                      <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-yellow-600 mb-1">
                        {summary.unpaidInvoices.count} Tagihan Belum Dibayar
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        Total:{" "}
                        <strong>
                          {formatCurrency(summary.unpaidInvoices.total)}
                        </strong>
                      </p>
                      <Button variant="default" asChild>
                        <Link href={`/finance/bills?studentId=${student.id}`}>
                          Lihat Detail Tagihan
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-green-600 mb-1">
                        Status Lunas
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        Tidak ada tagihan tertunggak.
                      </p>
                      <Button variant="outline" asChild>
                        <Link
                          href={`/finance/payments?studentId=${student.id}`}
                        >
                          Lihat Riwayat Pembayaran
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="boarding">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Room Assignment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summary.boarding ? (
                    <>
                      <InfoRow
                        label="Dormitory"
                        value={summary.boarding.dormitoryName}
                        icon={<Home className="h-4 w-4" />}
                      />
                      <InfoRow label="Room" value={summary.boarding.roomName} />
                      <InfoRow
                        label="Assigned Date"
                        value={format(
                          new Date(summary.boarding.assignedAt),
                          "dd MMMM yyyy",
                        )}
                        icon={<Clock className="h-4 w-4" />}
                      />
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      No active room assignment.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Medical History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {student.medicalRecords?.map((med) => (
                      <div
                        key={med.id}
                        className="border-b pb-2 last:border-0 last:pb-0"
                      >
                        <div className="flex justify-between">
                          <p className="font-medium">
                            {med.complaint || med.type}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {safeFormat(new Date(med.visitDate), "dd MMM yyyy")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {med.diagnosis}
                        </p>
                      </div>
                    ))}
                    {!student.medicalRecords?.length && (
                      <p className="text-muted-foreground">
                        No medical records found.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <div className="flex items-start justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {value}
      </span>
    </div>
  );
}
