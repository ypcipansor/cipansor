/**
 * Dashboard Error Fallback
 * Specialized error UI for dashboard components
 */

"use client";

import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

interface DashboardErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  title?: string;
  message?: string;
}

export function DashboardErrorFallback({
  error,
  resetError,
  title = "Gagal Memuat Dashboard",
  message = "Terjadi kesalahan saat memuat data dashboard. Silakan coba lagi.",
}: DashboardErrorFallbackProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="mt-2">{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {process.env.NODE_ENV === "development" && error && (
            <details className="rounded-md bg-gray-100 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-gray-700 mb-2">
                Error Details
              </summary>
              <pre className="text-xs text-gray-600 overflow-auto">
                {error.message}
                {"\n\n"}
                {error.stack}
              </pre>
            </details>
          )}

          <div className="flex flex-col gap-2">
            {resetError && (
              <Button onClick={resetError} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Coba Lagi
              </Button>
            )}
            <Button variant="outline" asChild className="w-full">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Kembali ke Beranda
              </Link>
            </Button>
          </div>

          <div className="text-center text-xs text-gray-500">
            <p>
              Jika masalah berlanjut, hubungi{" "}
              <a
                href="mailto:support@cipansor.or.id"
                className="text-blue-600 hover:underline"
              >
                dukungan teknis
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Loading error fallback (for query errors)
export function DashboardLoadingError({
  refetch,
  error,
}: {
  refetch?: () => void;
  error?: Error;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-red-800">
            Gagal Memuat Data
          </h3>
          <p className="text-sm text-red-700 mt-1">
            {error?.message ||
              "Terjadi kesalahan saat mengambil data. Silakan coba lagi."}
          </p>
          {refetch && (
            <Button
              onClick={refetch}
              size="sm"
              variant="outline"
              className="mt-3"
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              Muat Ulang
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
