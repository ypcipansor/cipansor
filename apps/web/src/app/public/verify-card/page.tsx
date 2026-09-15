"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  ShieldCheck,
  User,
  School,
  IdCard,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { VerificationResponse } from "@cipansor/shared";

function VerifyCardContent() {
  const searchParams = useSearchParams();
  const initialData = searchParams.get("data") || searchParams.get("q") || "";

  const [qrString, setQrString] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e?: React.FormEvent, codeToTest?: string) => {
    if (e) e.preventDefault();
    const query = codeToTest ?? qrString.trim();
    if (!query) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.get<{ data: VerificationResponse }>(
        `/students/id-cards/verify`,
        { params: { q: query } }
      );
      const resData = response.data.data;
      if (resData) {
        setResult(resData);
        if (!resData.valid) {
          setError(resData.message);
        }
      }
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { message?: string } };
      };
      setError(
        axiosError.response?.data?.message ||
          "Gagal memproses verifikasi Kartu Santri."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialData) {
      handleVerify(undefined, initialData);
    }
  }, [initialData]);

  return (
    <div className="container max-w-2xl mx-auto py-12 px-4">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="bg-primary/10 p-3 rounded-full">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Verifikasi Kartu Santri / Pelajar
        </h1>
        <p className="text-muted-foreground mt-2 text-pretty">
          Pemeriksaan keaslian Kartu Santri dan Identitas Pelajar bertanda tangan kriptografis HMAC Yayasan Pesantren Cipansor.
        </p>
      </div>

      <div className="mb-8 space-y-4 text-muted-foreground">
        <p className="leading-relaxed">
          Kartu Santri resmi Cipansor dilengkapi dengan <strong className="text-foreground">QR Code Kriptografis HMAC-SHA256</strong> bertanda tangan kunci rahasia server. Sistem ini menjamin keaslian data identitas santri agar tidak dapat dipalsukan.
        </p>
      </div>

      <Card className="shadow-lg border-2">
        <CardHeader>
          <CardTitle>Cek Kode QR Kartu Santri</CardTitle>
          <CardDescription>
            Pindai QR code pada Kartu Santri atau masukkan string QR Code di bawah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="cipansor://eyJzaWQiOiI...#hmacHash"
                value={qrString}
                onChange={(e) => setQrString(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button type="submit" disabled={isLoading || !qrString.trim()}>
                {isLoading ? (
                  "Mengecek..."
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Verifikasi
                  </>
                )}
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-6 p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-3">
              <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Verifikasi Gagal / Tidak Valid</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {result && result.valid && result.student && (
            <div className="mt-6 space-y-6">
              <div className="p-4 bg-green-50 text-green-800 border border-green-200 rounded-lg flex items-start gap-3">
                <CheckCircle className="h-5 w-5 mt-0.5 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-lg text-green-700">
                    Kartu Santri Resmi & Terverifikasi
                  </p>
                  <p className="text-sm">{result.message}</p>
                </div>
              </div>

              <div className="grid gap-4 pt-4 border-t">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Nama Santri / Pelajar</p>
                    <p className="font-medium text-lg">{result.student.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <IdCard className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">NIS</p>
                      <p className="font-semibold">{result.student.nis}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <School className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Unit Pendidikan</p>
                      <p className="font-medium">{result.student.unit}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Kelas Aktif</p>
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                        {result.student.currentClass}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Tahun Ajaran</p>
                      <p className="font-medium">{result.student.academicYear}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && !result.valid && result.expired && (
            <div className="mt-6 p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 text-yellow-600 shrink-0" />
              <div>
                <p className="font-semibold text-lg text-yellow-700">Kartu Kedaluwarsa (Expired)</p>
                <p className="text-sm">{result.message}</p>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="bg-muted/30 text-xs text-center justify-center py-3">
          Sistem Informasi Cipansor &copy; {new Date().getFullYear()}
        </CardFooter>
      </Card>
    </div>
  );
}

export default function PublicVerifyCardPage() {
  return (
    <main id="main-content">
      <Suspense fallback={null}>
        <VerifyCardContent />
      </Suspense>
    </main>
  );
}
