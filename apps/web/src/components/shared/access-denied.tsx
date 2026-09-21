import { ShieldX } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AccessDeniedProps {
  title?: string;
  description?: string;
}

/**
 * Blok "Akses Ditolak" yang konsisten untuk page-level guard.
 *
 * Halaman yang hanya untuk satu peran (mis. Aturan Kuorum = SUPER_ADMIN)
 * harus menampilkan penolakan yang jelas, bukan form kosong plus toast 403.
 * Otorisasi backend tetap boundary utama; ini hanya UX dan mencegah request
 * yang pasti gagal.
 */
export function AccessDenied({
  title = "Akses Ditolak",
  description = "Anda tidak memiliki izin untuk mengakses halaman ini.",
}: AccessDeniedProps) {
  return (
    <Card className="max-w-xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <ShieldX className="h-6 w-6 text-red-600" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
