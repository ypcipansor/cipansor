"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Users, ChevronRight, Star } from "lucide-react";

interface Child {
  id: string;
  name: string;
  nisn: string;
  currentClass?: {
    name: string;
  };
  unit?: {
    name: string;
  };
  relation: string;
}

export default function ParentIbadahPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Child[]>([]);

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        setLoading(true);
        const res = await api.get("/parent/children");
        const childrenData = res.data.data || [];
        setChildren(childrenData);

        // If only one child, redirect immediately
        if (childrenData.length === 1) {
          router.replace(`/parent/ibadah/${childrenData[0].id}`);
          return; // Prevent flash of content by keeping loading true during redirect
        }
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch children:", err);
        setLoading(false);
      }
    };

    fetchChildren();
  }, [router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  // If we have children but more than 1 (or 0 and waiting), show selection
  if (children.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Belum ada data anak</h3>
          <p className="text-muted-foreground mt-2">
            Silakan hubungi admin sekolah untuk menghubungkan akun Anda dengan
            data anak.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Mutaba&apos;ah Ibadah
        </h1>
        <p className="text-muted-foreground">
          Pilih anak untuk melihat laporan ibadah harian
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {children.map((child) => (
          <Card
            key={child.id}
            className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
            onClick={() => router.push(`/parent/ibadah/${child.id}`)}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
                  {child.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-lg">{child.name}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="secondary" className="font-normal">
                      {child.currentClass?.name || "Belum ada kelas"}
                    </Badge>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500" /> Lihat Laporan
                </span>
                <span>{child.unit?.name}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
