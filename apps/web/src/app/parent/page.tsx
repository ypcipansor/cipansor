"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ParentChild } from "@/hooks/use-parent-portal";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  Calendar,
  AlertTriangle,
  Award,
  Receipt,
  BookOpen,
  TrendingUp,
  Bell,
  Wallet,
  MessageSquare,
  Star,
  HeartHandshake,
} from "lucide-react";

interface ChildSummary {
  studentId: string;
  studentName: string;
  recentAttendance: {
    present: number;
    absent: number;
    sick: number;
    permitted: number;
    percentage: number;
  };
  latestTahfidz?: {
    totalJuz: number;
    lastMemoization?: {
      surahName: string;
      ayahStart: number;
      ayahEnd: number;
    };
  };
  latestGrade?: {
    subject: string;
    score: number;
    maxScore: number;
  };
  holisticScore?: number;
  holisticInterpretation?: string;
  boardingHarmonyScore?: number;
  pendingViolations: number;
  pendingPayments: {
    count: number;
    total: number;
  };
  unreadRewards: number;
  wallet?: {
    balance: number;
    lastTransaction?: {
      type: string;
      amount: number;
      date: string;
    };
  };
}

interface DashboardData {
  children: ChildSummary[];
  recentAnnouncements: Array<{
    id: string;
    title: string;
    content: string;
    createdAt: string;
    priority: string;
  }>;
  unreadNotifications: number;
}

export default function ParentDashboardPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch children list and dashboard summary
        const [childrenRes, dashboardRes] = await Promise.all([
          api.get("/parent/children"),
          api.get("/parent/dashboard"),
        ]);
        setChildren(childrenRes.data.data || []);
        setDashboard(dashboardRes.data.data || null);
      } catch (err: any) {
        console.error("Failed to fetch parent data:", err);
        setError(err.response?.data?.error?.message || "Gagal memuat data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Coba Lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Selamat Datang, {user?.name?.split(" ")[0]}!
          </h1>
          <p className="text-muted-foreground">
            Portal Orang Tua - Pantau perkembangan anak Anda
          </p>
        </div>
        {dashboard && dashboard.unreadNotifications > 0 && (
          <Link href="/parent/announcements">
            <Button variant="outline" className="gap-2">
              <Bell className="h-4 w-4" />
              {dashboard.unreadNotifications} Notifikasi Baru
            </Button>
          </Link>
        )}
      </div>

      {/* Children Cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {children.map((child) => {
          const summary = dashboard?.children.find(
            (c) => c.studentId === child.id,
          );

          return (
            <Card key={child.id} className="overflow-hidden">
              <CardHeader className="bg-primary/5 pb-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-2xl">
                    {child.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      {child.name}
                    </CardTitle>
                    <CardDescription>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="secondary">{child.nisn}</Badge>
                        {child.currentClass && (
                          <Badge variant="outline">
                            {child.currentClass.name}
                          </Badge>
                        )}
                      </div>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {/* Attendance */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Kehadiran:{" "}
                      <strong
                        className={
                          (summary?.recentAttendance?.percentage ?? 0) >= 80
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {summary?.recentAttendance?.percentage ?? 0}%
                      </strong>
                    </span>
                  </div>

                  {/* Tahfidz */}
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Tahfidz:{" "}
                      <strong>
                        {summary?.latestTahfidz?.totalJuz || 0} Juz
                      </strong>
                    </span>
                  </div>

                  {/* Violations */}
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Pelanggaran:{" "}
                      <strong
                        className={
                          summary?.pendingViolations
                            ? "text-red-600"
                            : "text-green-600"
                        }
                      >
                        {summary?.pendingViolations || 0}
                      </strong>
                    </span>
                  </div>

                  {/* Rewards */}
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Penghargaan:{" "}
                      <strong className="text-green-600">
                        {summary?.unreadRewards || 0}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Enhanced Analytics Section */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 flex flex-col items-center justify-center">
                    <p className="text-[10px] text-indigo-700 font-bold uppercase">Skor Holistik</p>
                    <p className="text-lg font-black text-indigo-900">{summary?.holisticScore || '—'}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center">
                    <p className="text-[10px] text-emerald-700 font-bold uppercase">Harmony Asrama</p>
                    <p className="text-lg font-black text-emerald-900">{summary?.boardingHarmonyScore || '—'}%</p>
                  </div>
                </div>

                {/* Pending Payments */}
                {summary?.pendingPayments &&
                  summary.pendingPayments.count > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                      <div className="flex items-center gap-2 text-yellow-700">
                        <Receipt className="h-4 w-4" />
                        <span className="font-medium">
                          {summary.pendingPayments.count} tagihan belum lunas
                        </span>
                      </div>
                      <p className="text-sm text-yellow-600 mt-1">
                        Total: {formatCurrency(summary.pendingPayments.total)}
                      </p>
                    </div>
                  )}

                {/* Wallet Balance */}
                {summary?.wallet && (
                  <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-700">
                        <Wallet className="h-4 w-4" />
                        <span className="font-medium">Saldo Dompet</span>
                      </div>
                      <span className="font-bold text-blue-800">
                        {formatCurrency(summary.wallet.balance)}
                      </span>
                    </div>
                    {summary.wallet.lastTransaction && (
                      <p className="text-xs text-blue-600 mt-1">
                        Transaksi terakhir:{" "}
                        {summary.wallet.lastTransaction.type === "TOP_UP"
                          ? "+"
                          : "-"}
                        {formatCurrency(summary.wallet.lastTransaction.amount)}
                      </p>
                    )}
                  </div>
                )}

                {/* View Details Button */}
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/parent/children?id=${child.id}`}
                    className="flex-1"
                  >
                    <Button variant="outline" className="w-full">
                      Lihat Detail
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* No children message */}
        {children.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">Belum ada data anak</h3>
              <p className="text-muted-foreground mt-2">
                Silakan hubungi admin sekolah untuk menghubungkan akun Anda
                dengan data anak.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Announcements */}
      {dashboard?.recentAnnouncements &&
        dashboard.recentAnnouncements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Pengumuman Terbaru
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboard.recentAnnouncements
                  .slice(0, 3)
                  .map((announcement) => (
                    <div
                      key={announcement.id}
                      className="flex items-start gap-4 p-4 rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{announcement.title}</h4>
                          {announcement.priority === "HIGH" && (
                            <Badge variant="destructive">Penting</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {announcement.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(announcement.createdAt).toLocaleDateString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            },
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
              <Link href="/parent/announcements">
                <Button variant="link" className="mt-4 p-0">
                  Lihat Semua Pengumuman →
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Aksi Cepat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/parent/children">
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <Users className="h-6 w-6" />
                <span>Data Anak</span>
              </Button>
            </Link>
            <Link href="/parent/finance">
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <Receipt className="h-6 w-6" />
                <span>Keuangan</span>
              </Button>
            </Link>
            <Link href="/parent/permits">
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <GraduationCap className="h-6 w-6" />
                <span>Ajukan Izin</span>
              </Button>
            </Link>
            <Link href="/parent/announcements">
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <Bell className="h-6 w-6" />
                <span>Pengumuman</span>
              </Button>
            </Link>
            <Link href="/parent/messages">
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <MessageSquare className="h-6 w-6" />
                <span>Pesan Guru</span>
              </Button>
            </Link>
            <Link href="/parent/ibadah">
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <Star className="h-6 w-6" />
                <span>Mutaba&apos;ah</span>
              </Button>
            </Link>
            <Link href="/parent/counseling">
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <HeartHandshake className="h-6 w-6" />
                <span>Konseling</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
