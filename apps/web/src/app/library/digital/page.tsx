"use client";

import React, { useMemo } from "react";
import { MainLayout } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DigitalLibraryViewer } from "@/components/library/DigitalLibraryViewer";
import { useBooks } from "@/hooks/use-library";
import { Library } from "lucide-react";

export default function DigitalLibraryPage() {
  const { data: booksResponse, isLoading } = useBooks({
    limit: 100,
    isDigital: true,
  });
  const books = useMemo(() => booksResponse?.data || [], [booksResponse?.data]);

  // Real per-category counts derived from the loaded collection.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) {
      const name = book.category?.name ?? "Tanpa kategori";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [books]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Maktabah Cipansor
          </h1>
          <p className="text-muted-foreground">
            Koleksi kitab dan e-book digital pesantren
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Library className="w-5 h-5 mr-2" /> Kategori
              </CardTitle>
              <CardDescription>
                Distribusi koleksi digital per kategori
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <Skeleton className="h-24" />
              ) : categoryCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada koleksi digital. Tandai buku sebagai digital dan isi
                  tautan berkasnya dari modul Perpustakaan.
                </p>
              ) : (
                categoryCounts.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex justify-between items-center p-2 rounded-md hover:bg-muted"
                  >
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">
                      {count} judul
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Koleksi Digital</CardTitle>
              <CardDescription>
                Klik sampul untuk membaca atau mengunduh
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-40" />
                  <Skeleton className="h-40" />
                </div>
              ) : (
                <DigitalLibraryViewer books={books} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
